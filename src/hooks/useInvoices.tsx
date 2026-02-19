import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Invoice, InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Sanitize file names for Supabase Storage (remove accents and special chars)
function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace special chars with underscore
}

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
        client_name: (item as any).client_name as string | null,
        classification_details: item.classification_details as Invoice['classification_details'],
        feedback_status: (item as any).feedback_status as string | null,
        assigned_account: (item as any).assigned_account as string | null,
      })) as Invoice[];
    },
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ files, clientName, clientNit }: { files: File[]; clientName: string; clientNit?: string }) => {
      if (!user) throw new Error('Not authenticated');
      if (!clientName.trim()) throw new Error('El nombre del cliente es requerido');

      const results: { file: string; success: boolean; error?: string }[] = [];
      
      for (const file of files) {
        try {
          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const isPdf = fileExt === 'pdf';
          const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt || '');

          if (!isPdf && !isImage) {
            results.push({ file: file.name, success: false, error: 'Formato no soportado' });
            continue;
          }

          const sanitizedName = sanitizeFileName(file.name);
          const filePath = `${user.id}/${Date.now()}-${sanitizedName}`;
          
          console.log(`Uploading file: ${file.name} -> ${filePath} (${file.size} bytes, type: ${file.type})`);
          
          const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(filePath, file);

          if (uploadError) {
            console.error(`Storage upload error for ${file.name}:`, uploadError);
            results.push({ file: file.name, success: false, error: uploadError.message });
            continue;
          }

          const insertData: any = {
            user_id: user.id,
            file_name: file.name,
            file_path: filePath,
            file_type: isPdf ? 'pdf' : 'image',
            client_name: clientName.trim(),
          };
          if (clientNit?.trim()) {
            insertData.client_nit = clientNit.trim();
          }

          const { data: invoiceData, error: insertError } = await supabase
            .from('invoices')
            .insert(insertData)
            .select()
            .single();

          if (insertError) {
            console.error(`DB insert error for ${file.name}:`, insertError);
            results.push({ file: file.name, success: false, error: insertError.message });
            continue;
          }
          
          console.log(`Successfully uploaded: ${file.name}, id: ${invoiceData.id}`);
          results.push({ file: file.name, success: true });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
          console.error(`Unexpected error uploading ${file.name}:`, err);
          results.push({ file: file.name, success: false, error: errorMsg });
        }
      }
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (successful.length === 0 && failed.length > 0) {
        throw new Error(`Error al subir: ${failed.map(f => `${f.file}: ${f.error}`).join(', ')}`);
      }
      
      return { successful, failed };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (data.failed.length > 0) {
        toast.warning(`${data.successful.length} subida(s), ${data.failed.length} con error: ${data.failed.map(f => f.file).join(', ')}`);
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

  // Helper: call classify with retries + backoff (retries on ANY error, not just rate limits)
  const classifyWithRetry = async (invoiceId: string, maxRetries = 5): Promise<any> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { data, error } = await supabase.functions.invoke('classify-invoice', {
        body: { invoiceId },
      });

      if (!error) return data;

      // Retry on ANY error (including 500 "Invalid AI response format", network errors, etc.)
      if (attempt < maxRetries) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 60000);
        console.log(`Classify retry for ${invoiceId} in ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries}) — error: ${error.message}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw error;
    }
  };

  const classifyMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return classifyWithRetry(invoiceId);
    },
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
      // CONCURRENCY = 1: sequential processing guarantees duplicate detection works correctly.
      // Each invoice is fully saved in DB before the next one checks for duplicates.
      let completed = 0;

      setClassificationProgress({ current: 0, total: invoiceIds.length });

      for (const id of invoiceIds) {
        const invoice = invoices.find(inv => inv.id === id);

        try {
          const data = await classifyWithRetry(id);
          results.push({ id, success: true, data });
        } catch (err) {
          console.error(`Failed to classify invoice ${id} after all retries:`, err);
          results.push({ id, success: false, error: err });
          // Mark as error in DB so it's visible to the user
          try {
            await supabase
              .from('invoices')
              .update({ classification_status: 'error' })
              .eq('id', id);
          } catch (dbErr) {
            console.error('Could not mark invoice as error:', dbErr);
          }
        }

        completed++;
        setClassificationProgress({
          current: completed,
          total: invoiceIds.length,
          currentFileName: invoice?.file_name,
        });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }

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
      correctedOperation 
    }: { 
      invoiceId: string;
      isCorrect: boolean;
      originalType: InvoiceType | null;
      originalOperation: OperationType | null;
      correctedType?: InvoiceType;
      correctedOperation?: OperationType;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Insert feedback record
      const { error: feedbackError } = await supabase
        .from('classification_feedback')
        .insert({
          invoice_id: invoiceId,
          user_id: user.id,
          is_correct: isCorrect,
          original_invoice_type: originalType,
          original_operation_type: originalOperation,
          corrected_invoice_type: correctedType || null,
          corrected_operation_type: correctedOperation || null,
        });

      if (feedbackError) throw feedbackError;

      // Update invoice feedback status
      const feedbackStatus = isCorrect ? 'correct' : 'corrected';
      const updateData: any = { feedback_status: feedbackStatus };
      
      // If corrected, also update the invoice classification
      if (!isCorrect && correctedType && correctedOperation) {
        updateData.invoice_type = correctedType;
        updateData.operation_type = correctedOperation;
      }

      const { error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (updateError) throw updateError;
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

  const deleteAllMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const allInvoices = query.data || [];
      const toDelete = allInvoices.filter(i => invoiceIds.includes(i.id));
      if (toDelete.length === 0) throw new Error('No hay facturas para eliminar');

      const BATCH_SIZE = 50;

      // Delete files from storage in batches
      const filePaths = toDelete.map(i => i.file_path);
      for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);
        const { error: storageError } = await supabase.storage.from('invoices').remove(batch);
        if (storageError) console.error('Storage batch delete error:', storageError);
      }

      // Delete records from DB in batches
      for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
        const batch = invoiceIds.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('invoices')
          .delete()
          .in('id', batch);
        if (error) throw error;
      }

      return toDelete.length;
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
