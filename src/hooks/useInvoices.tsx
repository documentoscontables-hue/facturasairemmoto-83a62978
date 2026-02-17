import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ClassificationProgress {
  current: number;
  total: number;
  currentFileName?: string;
}

export function useInvoices() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [classificationProgress, setClassificationProgress] = useState<ClassificationProgress | null>(null);

  const query = useQuery({
    queryKey: ['invoices', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        invoice_type: item.invoice_type as InvoiceType | null,
        operation_type: item.operation_type as OperationType | null,
        classification_status: item.classification_status as ClassificationStatus,
        file_type: item.file_type as 'pdf' | 'image',
        classification_details: item.classification_details as Invoice['classification_details'],
      })) as Invoice[];
    },
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ files, clientName, clientNit }: { files: File[]; clientName: string; clientNit?: string }) => {
      if (!user) throw new Error('Not authenticated');
      if (!clientName.trim()) throw new Error('El nombre del cliente es requerido');

      const results: { successful: any[]; failed: any[] } = { successful: [], failed: [] };

      for (const file of files) {
        try {
          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileType = fileExt === 'pdf' ? 'pdf' : 'image';
          const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: invoice, error: insertError } = await supabase
            .from('invoices')
            .insert({
              user_id: user.id,
              file_name: file.name,
              file_path: filePath,
              file_type: fileType,
              client_name: clientName.trim(),
              client_nit: clientNit?.trim() || null,
            })
            .select()
            .single();

          if (insertError) throw insertError;
          results.successful.push(invoice);
        } catch (err) {
          results.failed.push({ fileName: file.name, error: err });
        }
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (data.failed.length > 0) {
        toast.warning(`${data.successful.length} subida(s), ${data.failed.length} con error`);
      } else {
        toast.success(`${data.successful.length} factura(s) subida(s) correctamente`);
      }
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

  const classifyWithRetry = async (invoiceId: string, maxRetries = 4): Promise<any> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('classify-invoice', {
          body: { invoiceId },
        });
        if (error) throw error;
        return data;
      } catch (err: any) {
        const msg = err.message || '';
        const isRetryable = msg.includes('429') || msg.includes('503') || msg.includes('rate') || msg.includes('overload');
        if (isRetryable && attempt < maxRetries) {
          const waitMs = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 60000);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
  };

  const classifyMutation = useMutation({
    mutationFn: async (invoiceId: string) => classifyWithRetry(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error) => {
      console.error('Error clasificando factura:', error.message);
    },
  });

  const classifyAllMutation = useMutation({
    mutationFn: async ({ invoiceIds, invoices }: { invoiceIds: string[]; invoices: Invoice[] }) => {
      const results: { id: string; success: boolean; data?: any; error?: any }[] = [];
      const CONCURRENCY = 3;
      let completed = 0;

      setClassificationProgress({ current: 0, total: invoiceIds.length });

      const queue = [...invoiceIds];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const id = queue.shift()!;
          const invoice = invoices.find(inv => inv.id === id);
          try {
            const data = await classifyWithRetry(id);
            results.push({ id, success: true, data });
          } catch (err) {
            results.push({ id, success: false, error: err });
          }
          completed++;
          setClassificationProgress({
            current: completed,
            total: invoiceIds.length,
            currentFileName: invoice?.file_name,
          });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        }
      });

      await Promise.all(workers);
      return results;
    },
    onSuccess: (results) => {
      setClassificationProgress(null);
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
      setClassificationProgress(null);
      toast.error(`Error en clasificación: ${error.message}`);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({
      invoiceId, isCorrect, originalType, originalOperation, correctedType, correctedOperation,
    }: {
      invoiceId: string; isCorrect: boolean;
      originalType: InvoiceType | null; originalOperation: OperationType | null;
      correctedType?: InvoiceType; correctedOperation?: OperationType;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error: fbError } = await supabase.from('classification_feedback').insert({
        invoice_id: invoiceId,
        user_id: user.id,
        is_correct: isCorrect,
        original_invoice_type: originalType,
        original_operation_type: originalOperation,
        corrected_invoice_type: correctedType || null,
        corrected_operation_type: correctedOperation || null,
      });
      if (fbError) throw fbError;

      if (!isCorrect && (correctedType || correctedOperation)) {
        const updates: any = { feedback_status: 'corrected' };
        if (correctedType) updates.invoice_type = correctedType;
        if (correctedOperation) updates.operation_type = correctedOperation;
        updates.classification_status = 'classified';

        const { error: upError } = await supabase
          .from('invoices')
          .update(updates)
          .eq('id', invoiceId);
        if (upError) throw upError;
      } else {
        await supabase.from('invoices').update({ feedback_status: 'correct' }).eq('id', invoiceId);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (variables.isCorrect) {
        toast.success('¡Gracias por confirmar!');
      } else {
        toast.success('Corrección guardada - esto ayuda a mejorar el sistema');
      }
    },
    onError: (error) => {
      toast.error(`Error al guardar feedback: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const invoice = query.data?.find(i => i.id === id);
      if (invoice) {
        await supabase.storage.from('invoices').remove([invoice.file_path]);
      }
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

  const deleteAllMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const invoicesToDelete = query.data?.filter(i => invoiceIds.includes(i.id)) || [];
      const filePaths = invoicesToDelete.map(i => i.file_path);
      if (filePaths.length > 0) {
        await supabase.storage.from('invoices').remove(filePaths);
      }
      const { error } = await supabase.from('invoices').delete().in('id', invoiceIds);
      if (error) throw error;
      return invoiceIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${count} factura(s) eliminada(s)`);
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
    classificationProgress,
    submitFeedback: feedbackMutation.mutateAsync,
    isSubmittingFeedback: feedbackMutation.isPending,
    deleteInvoice: deleteMutation.mutateAsync,
    deleteAllInvoices: deleteAllMutation.mutateAsync,
    isDeletingAll: deleteAllMutation.isPending,
  };
}
