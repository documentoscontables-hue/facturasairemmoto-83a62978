import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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
      const data = await apiFetch<any[]>('/api/invoices');
      return data.map(item => ({
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

      const formData = new FormData();
      formData.append('client_name', clientName.trim());
      if (clientNit?.trim()) formData.append('client_nit', clientNit.trim());
      for (const file of files) {
        formData.append('files', file);
      }

      const data = await apiFetch<{ successful: any[]; failed: any[] }>('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      return data;
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
      await apiFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ invoice_type, operation_type, classification_status: 'classified' }),
      });
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
        return await apiFetch(`/api/invoices/${invoiceId}/classify`, { method: 'POST' });
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
      invoiceId,
      isCorrect,
      originalType,
      originalOperation,
      correctedType,
      correctedOperation,
    }: {
      invoiceId: string;
      isCorrect: boolean;
      originalType: InvoiceType | null;
      originalOperation: OperationType | null;
      correctedType?: InvoiceType;
      correctedOperation?: OperationType;
    }) => {
      await apiFetch(`/api/invoices/${invoiceId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          is_correct: isCorrect,
          original_invoice_type: originalType,
          original_operation_type: originalOperation,
          corrected_invoice_type: correctedType || null,
          corrected_operation_type: correctedOperation || null,
        }),
      });
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
      await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' });
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
      const data = await apiFetch<{ count: number }>('/api/invoices/delete-batch', {
        method: 'POST',
        body: JSON.stringify({ ids: invoiceIds }),
      });
      return data.count;
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
