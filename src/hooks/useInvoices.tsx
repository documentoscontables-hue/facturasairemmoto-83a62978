import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useInvoices() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['invoices', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        invoice_type: item.invoice_type as InvoiceType | null,
        operation_type: item.operation_type as OperationType | null,
        classification_status: item.classification_status as ClassificationStatus,
        file_type: item.file_type as 'pdf' | 'image',
        client_name: (item as any).client_name as string | null,
        classification_details: item.classification_details as Invoice['classification_details'],
      })) as Invoice[];
    },
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ files, clientName }: { files: File[]; clientName: string }) => {
      if (!user) throw new Error('Not authenticated');
      if (!clientName.trim()) throw new Error('El nombre del cliente es requerido');

      const results = [];
      for (const file of files) {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const isPdf = fileExt === 'pdf';
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt || '');

        if (!isPdf && !isImage) {
          throw new Error(`Formato no soportado: ${file.name}`);
        }

        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: invoiceData, error: insertError } = await supabase
          .from('invoices')
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_path: filePath,
            file_type: isPdf ? 'pdf' : 'image',
            client_name: clientName.trim(),
          })
          .select()
          .single();

        if (insertError) throw insertError;
        results.push(invoiceData);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Facturas subidas correctamente');
    },
    onError: (error) => {
      toast.error(`Error al subir: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, invoice_type, operation_type }: { 
      id: string; 
      invoice_type?: InvoiceType; 
      operation_type?: OperationType;
    }) => {
      const { error } = await supabase
        .from('invoices')
        .update({ invoice_type, operation_type, classification_status: 'classified' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Factura actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke('classify-invoice', {
        body: { invoiceId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error) => {
      console.error('Error clasificando factura:', error.message);
    },
  });

  const classifyAllMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const results = [];
      for (const id of invoiceIds) {
        try {
          const { data, error } = await supabase.functions.invoke('classify-invoice', {
            body: { invoiceId: id },
          });
          if (error) throw error;
          results.push({ id, success: true, data });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        } catch (err) {
          results.push({ id, success: false, error: err });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (failed === 0) {
        toast.success(`${successful} factura(s) clasificada(s) con IA`);
      } else {
        toast.warning(`${successful} clasificadas, ${failed} con errores`);
      }
    },
    onError: (error) => {
      toast.error(`Error en clasificación: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const invoice = query.data?.find(i => i.id === id);
      if (!invoice) throw new Error('Factura no encontrada');

      await supabase.storage.from('invoices').remove([invoice.file_path]);
      
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Factura eliminada');
    },
    onError: (error) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  return {
    invoices: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    uploadInvoices: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    updateInvoice: updateMutation.mutateAsync,
    classifyInvoice: classifyMutation.mutateAsync,
    classifyAllInvoices: classifyAllMutation.mutateAsync,
    isClassifying: classifyMutation.isPending,
    isClassifyingAll: classifyAllMutation.isPending,
    deleteInvoice: deleteMutation.mutateAsync,
  };
}
