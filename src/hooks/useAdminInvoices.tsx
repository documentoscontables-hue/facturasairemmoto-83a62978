import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from './useAdmin';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';

export interface UserInvoiceData {
  user_id: string;
  email: string;
  invoices: Invoice[];
}

interface InvoiceRow {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  client_name: string | null;
  invoice_type: string | null;
  operation_type: string | null;
  classification_status: string;
  classification_details: Record<string, unknown> | null;
  feedback_status: string | null;
  assigned_account: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdminInvoices(userId?: string) {
  const { isAdmin, isCoordinator } = useAdmin();

  const { data: userInvoices = [], isLoading, refetch } = useQuery({
    queryKey: ['adminInvoices', userId],
    queryFn: async () => {
      if (!userId) return [] as UserInvoiceData[];

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, email')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: invoicesData, error: invoicesError } = await supabase
        .rpc('get_user_invoices_admin', { target_user_id: userId }) as { data: InvoiceRow[] | null; error: any };

      if (invoicesError) {
        console.error('Error fetching invoices:', invoicesError);
        return [] as UserInvoiceData[];
      }

      const invoices = (invoicesData || []).map((item: InvoiceRow) => ({
        id: item.id,
        user_id: item.user_id,
        file_name: item.file_name,
        file_path: item.file_path,
        file_type: item.file_type as 'pdf' | 'image',
        client_name: item.client_name,
        invoice_type: item.invoice_type as InvoiceType | null,
        operation_type: item.operation_type as OperationType | null,
        classification_status: item.classification_status as ClassificationStatus,
        classification_details: item.classification_details as Invoice['classification_details'],
        feedback_status: item.feedback_status as 'correct' | 'corrected' | null,
        assigned_account: item.assigned_account,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })) as Invoice[];

      return [{
        user_id: userId,
        email: profile?.email || 'Unknown',
        invoices,
      }] as UserInvoiceData[];
    },
    enabled: (isAdmin || isCoordinator) && !!userId,
  });

  return { userInvoices, isLoading, refetch };
}
