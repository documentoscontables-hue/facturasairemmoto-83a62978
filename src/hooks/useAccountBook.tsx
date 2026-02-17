import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AccountBook {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  book_id: string;
  user_id: string;
  account_code: string;
  account_description: string;
  created_at: string;
}

export function useAccountBook() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isParsingBook, setIsParsingBook] = useState(false);

  const bookQuery = useQuery({
    queryKey: ['account-book', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('account_books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    },
    enabled: !!user,
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('account_code');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'xlsx', 'xls'].includes(fileExt || '')) {
        throw new Error('Formato no soportado. Use PDF o Excel.');
      }

      setIsParsingBook(true);

      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('account-books')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Delete existing book if any
      if (bookQuery.data) {
        await supabase.from('accounts').delete().eq('book_id', bookQuery.data.id);
        await supabase.storage.from('account-books').remove([bookQuery.data.file_path]);
        await supabase.from('account_books').delete().eq('id', bookQuery.data.id);
      }

      const { data: bookData, error: insertError } = await supabase
        .from('account_books')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: filePath,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // Parse the book via edge function
      const { data: parseResult, error: parseError } = await supabase.functions.invoke('parse-account-book', {
        body: { bookId: bookData.id },
      });
      if (parseError) throw parseError;

      return { book: bookData, parseResult };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['account-book'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Libro procesado: ${result.parseResult?.accounts_count || 0} cuentas encontradas`);
      setIsParsingBook(false);
    },
    onError: (error) => {
      toast.error(`Error al procesar libro: ${error.message}`);
      setIsParsingBook(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user || !bookQuery.data) throw new Error('No book to delete');
      await supabase.from('accounts').delete().eq('book_id', bookQuery.data.id);
      await supabase.storage.from('account-books').remove([bookQuery.data.file_path]);
      await supabase.from('account_books').delete().eq('id', bookQuery.data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-book'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Libro de cuentas eliminado');
    },
    onError: (error) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  return {
    accountBook: bookQuery.data,
    accounts: accountsQuery.data || [],
    isLoading: bookQuery.isLoading,
    isLoadingAccounts: accountsQuery.isLoading,
    uploadAccountBook: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    isParsingBook,
    deleteAccountBook: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    hasAccountBook: !!bookQuery.data,
  };
}
