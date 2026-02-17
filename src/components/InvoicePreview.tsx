import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Invoice, INVOICE_TYPE_LABELS } from '@/types/invoice';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface InvoicePreviewProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoicePreview({ invoice, open, onOpenChange }: InvoicePreviewProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invoice || !open) {
      setFileUrl(null);
      return;
    }

    const fetchUrl = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.storage
          .from('invoices')
          .createSignedUrl(invoice.file_path, 300);
        setFileUrl(data?.signedUrl || null);
      } catch {
        setFileUrl(null);
      }
      setLoading(false);
    };

    fetchUrl();
  }, [invoice, open]);

  if (!invoice) return null;

  const typeLabel = invoice.invoice_type
    ? INVOICE_TYPE_LABELS[invoice.invoice_type]
    : 'Documento';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa de {typeLabel.toLowerCase()}</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{invoice.file_name}</p>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-muted">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : fileUrl ? (
            invoice.file_type === 'pdf' ? (
              <iframe src={fileUrl} className="w-full h-full border-0" title={invoice.file_name} />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                <img src={fileUrl} alt={invoice.file_name} className="max-w-full max-h-full object-contain" />
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No se pudo cargar el archivo
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
