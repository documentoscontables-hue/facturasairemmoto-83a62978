import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAdmin } from './useAdmin';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';

export interface UserInvoiceData {
  user_id: string;
  email: string;
  invoices: Invoice[];
}

export function useAdminInvoices(userId?: string) {
  const { isAdmin, isCoordinator } = useAdmin();

  const { data: userInvoices = [], isLoading, refetch } = useQuery({
    queryKey: ['adminInvoices', userId],
    queryFn: async () => {
      if (!userId) return [] as UserInvoiceData[];

      const invoicesData = await apiFetch<any[]>(`/api/invoices/admin/${userId}`);

      const invoices = invoicesData.map(item => ({
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

      // We don't have email from this endpoint, use userId as fallback
      return [{
        user_id: userId,
        email: invoices[0]?.user_id || userId,
        invoices,
      }] as UserInvoiceData[];
    },
    enabled: (isAdmin || isCoordinator) && !!userId,
  });

  return { userInvoices, isLoading, refetch };
}
