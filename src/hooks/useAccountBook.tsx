import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Sanitize file names for Supabase Storage (remove accents and special chars)
function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace special chars with underscore
}

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

  // Fetch user's account book
  const bookQuery = useQuery({
    queryKey: ['account-book', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('account_books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as AccountBook | null;
    },
    enabled: !!user,
  });

  // Fetch accounts from the book
  const accountsQuery = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('account_code', { ascending: true });

      if (error) throw error;
      return data as Account[];
    },
    enabled: !!user,
  });

  // Upload and parse account book
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const isPdf = fileExt === 'pdf';
      const isExcel = ['xlsx', 'xls'].includes(fileExt || '');

      if (!isPdf && !isExcel) {
        throw new Error('Formato no soportado. Use PDF o Excel.');
      }

      setIsParsingBook(true);

      const sanitizedName = sanitizeFileName(file.name);
      const filePath = `${user.id}/${Date.now()}-${sanitizedName}`;
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('account-books')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Delete existing account books for this user
      await supabase
        .from('account_books')
        .delete()
        .eq('user_id', user.id);

      // Create account book record
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

      // Call edge function to parse the book
      const { data: parseResult, error: parseError } = await supabase.functions.invoke('parse-account-book', {
        body: { bookId: bookData.id },
      });

      if (parseError) throw parseError;

      return { book: bookData, parseResult };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['account-book'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Libro procesado: ${result.parseResult.accounts_count} cuentas encontradas`);
      setIsParsingBook(false);
    },
    onError: (error) => {
      toast.error(`Error al procesar libro: ${error.message}`);
      setIsParsingBook(false);
    },
  });

  // Delete account book
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user || !bookQuery.data) throw new Error('No book to delete');

      // Delete from storage
      await supabase.storage
        .from('account-books')
        .remove([bookQuery.data.file_path]);

      // Delete book record (accounts will be cascade deleted)
      const { error } = await supabase
        .from('account_books')
        .delete()
        .eq('id', bookQuery.data.id);

      if (error) throw error;
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
