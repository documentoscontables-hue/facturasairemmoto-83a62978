import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from './useAdmin';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';

export interface UserInvoiceData {
  user_id: string;
  email: string;
  invoices: Invoice[];
}

export function useAdminInvoices(userId?: string) {
  const { isAdmin } = useAdmin();

  const { data: userInvoices = [], isLoading, refetch } = useQuery({
    queryKey: ['adminInvoices', userId],
    queryFn: async () => {
      // First get profiles for admin
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }

      // Get all invoices (admin can see all via service role in edge function or RLS policy)
      // Since we can't see all invoices from client, we need a different approach
      // For now, we'll query invoices for a specific user if provided
      if (userId) {
        // We need an RPC or edge function to get other users' invoices as admin
        // For now, let's use the existing data structure
        const { data: invoicesData, error: invoicesError } = await supabase
          .rpc('get_user_invoices_admin', { target_user_id: userId });

        if (invoicesError) {
          console.error('Error fetching invoices:', invoicesError);
          // If the RPC doesn't exist yet, return empty
          return [];
        }

        const profile = profiles?.find(p => p.user_id === userId);
        
        return [{
          user_id: userId,
          email: profile?.email || 'Unknown',
          invoices: (invoicesData || []).map((item: any) => ({
            ...item,
            invoice_type: item.invoice_type as InvoiceType | null,
            operation_type: item.operation_type as OperationType | null,
            classification_status: item.classification_status as ClassificationStatus,
            file_type: item.file_type as 'pdf' | 'image',
            classification_details: item.classification_details as Invoice['classification_details'],
          })) as Invoice[],
        }] as UserInvoiceData[];
      }

      return [] as UserInvoiceData[];
    },
    enabled: isAdmin === true && !!userId,
  });

  return {
    userInvoices,
    isLoading,
    refetch,
  };
}
