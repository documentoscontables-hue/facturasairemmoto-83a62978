import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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

  // Fetch user's account books
  const bookQuery = useQuery({
    queryKey: ['account-book', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const data = await apiFetch<AccountBook[]>('/api/account-books');
      return data.length > 0 ? data[0] : null;
    },
    enabled: !!user,
  });

  // Fetch accounts
  const accountsQuery = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return apiFetch<Account[]>('/api/account-books/accounts');
    },
    enabled: !!user,
  });

  // Upload and parse account book
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'xlsx', 'xls'].includes(fileExt || '')) {
        throw new Error('Formato no soportado. Use PDF o Excel.');
      }

      setIsParsingBook(true);

      // Upload the file
      const formData = new FormData();
      formData.append('file', file);

      const bookData = await apiFetch<AccountBook>('/api/account-books/upload', {
        method: 'POST',
        body: formData,
      });

      // Parse the book
      const parseResult = await apiFetch<{ success: boolean; accounts_count: number }>(`/api/account-books/${bookData.id}/parse`, {
        method: 'POST',
      });

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
      await apiFetch(`/api/account-books/${bookQuery.data.id}`, { method: 'DELETE' });
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
