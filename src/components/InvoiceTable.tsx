import { Invoice, OPERATION_TYPE_LABELS, INVOICE_TYPE_LABELS } from '@/types/invoice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, CheckCircle, AlertCircle, Clock, FileText, Image, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { InvoicePreview } from './InvoicePreview';

interface InvoiceTableProps {
  invoices: Invoice[];
  onDelete: (id: string) => void;
}

export function InvoiceTable({ invoices, onDelete }: InvoiceTableProps) {
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const formatCurrency = (amount?: number, currency = 'EUR') => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  };

  const statusConfig = {
    pending: { icon: Clock, label: 'Pendiente', className: 'bg-warning/10 text-warning' },
    classified: { icon: CheckCircle, label: 'Clasificada', className: 'bg-success/10 text-success' },
    error: { icon: AlertCircle, label: 'Error', className: 'bg-destructive/10 text-destructive' },
  };

  return (
    <>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[50px]">Tipo</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Nº Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Receptor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Clasificación</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const data = invoice.classification_details?.extracted_data;
                const status = statusConfig[invoice.classification_status];
                const StatusIcon = status.icon;

                return (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className={cn(
                        "w-8 h-8 rounded flex items-center justify-center",
                        invoice.file_type === 'pdf' ? "bg-destructive/10" : "bg-primary/10"
                      )}>
                        {invoice.file_type === 'pdf' ? (
                          <FileText className="w-4 h-4 text-destructive" />
                        ) : (
                          <Image className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[150px] truncate" title={invoice.file_name}>
                      {invoice.file_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.client_name || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {data?.numero_factura || '-'}
                    </TableCell>
                    <TableCell>
                      {data?.fecha_factura || format(new Date(invoice.created_at), 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      <div className="truncate" title={data?.nombre_emisor || '-'}>
                        {data?.nombre_emisor || '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">{data?.id_emisor || ''}</div>
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      <div className="truncate" title={data?.nombre_receptor || '-'}>
                        {data?.nombre_receptor || '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">{data?.id_receptor || ''}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(data?.total, data?.moneda)}
                    </TableCell>
                    <TableCell>
                      {invoice.invoice_type ? (
                        <Badge variant="outline" className={cn(
                          "capitalize",
                          invoice.invoice_type === 'emitida' ? 'border-emitida text-emitida' : 
                          invoice.invoice_type === 'recibida' ? 'border-recibida text-recibida' :
                          invoice.invoice_type === 'no_es_factura' ? 'border-destructive text-destructive' :
                          'border-muted-foreground text-muted-foreground'
                        )}>
                          {INVOICE_TYPE_LABELS[invoice.invoice_type as keyof typeof INVOICE_TYPE_LABELS]}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      <span className="text-sm truncate block" title={invoice.operation_type ? OPERATION_TYPE_LABELS[invoice.operation_type] : ''}>
                        {invoice.operation_type ? OPERATION_TYPE_LABELS[invoice.operation_type] : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {invoice.assigned_account ? (
                        <Badge variant="secondary" className="font-mono">
                          {invoice.assigned_account}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("shrink-0", status.className)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewInvoice(invoice)}
                          className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                          title="Vista previa"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(invoice.id)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <InvoicePreview 
        invoice={previewInvoice} 
        open={!!previewInvoice} 
        onOpenChange={(open) => !open && setPreviewInvoice(null)} 
      />
    </>
  );
}
