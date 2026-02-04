import { Invoice, InvoiceType, OperationType, OPERATION_TYPE_LABELS } from '@/types/invoice';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileText, Image, Trash2, CheckCircle, AlertCircle, Clock,
  ChevronDown, ChevronUp, Building, User, Calendar, Hash, Euro, Globe, FileCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ClassificationFeedback } from './ClassificationFeedback';

interface InvoiceCardProps {
  invoice: Invoice;
  onUpdate: (id: string, invoice_type?: InvoiceType, operation_type?: OperationType) => void;
  onDelete: (id: string) => void;
  onFeedback: (invoiceId: string, isCorrect: boolean, correctedType?: InvoiceType, correctedOperation?: OperationType) => void;
  isSubmittingFeedback?: boolean;
}

export function InvoiceCard({ 
  invoice, 
  onUpdate, 
  onDelete,
  onFeedback,
  isSubmittingFeedback = false,
}: InvoiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  const statusConfig = {
    pending: { icon: Clock, label: 'Pendiente', className: 'bg-warning/10 text-warning' },
    classified: { icon: CheckCircle, label: 'Clasificada', className: 'bg-success/10 text-success' },
    error: { icon: AlertCircle, label: 'Error', className: 'bg-destructive/10 text-destructive' },
  };

  const status = statusConfig[invoice.classification_status];
  const StatusIcon = status.icon;
  const data = invoice.classification_details?.extracted_data;

  const formatCurrency = (amount?: number, currency = 'EUR') => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  };

  return (
    <Card className="glass-card overflow-hidden group hover:shadow-xl transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
            invoice.file_type === 'pdf' ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {invoice.file_type === 'pdf' ? (
              <FileText className="w-6 h-6 text-destructive" />
            ) : (
              <Image className="w-6 h-6 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium truncate">{invoice.file_name}</h3>
                <p className="text-sm text-muted-foreground">
                  {invoice.client_name && (
                    <span className="text-primary font-medium">{invoice.client_name} • </span>
                  )}
                  {format(new Date(invoice.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              <Badge variant="outline" className={cn("shrink-0", status.className)}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
            </div>

            {/* Extracted Data Summary - Only show if classified */}
            {invoice.classification_status === 'classified' && data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate">{data.numero_factura || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{data.fecha_factura || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Euro className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{formatCurrency(data.total, data.moneda)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{data.idioma || '-'} / {data.moneda || '-'}</span>
                </div>
              </div>
            )}

            {/* Expanded Details */}
            {expanded && invoice.classification_status === 'classified' && data && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                {/* Emisor */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <Building className="w-3.5 h-3.5" />
                    Emisor
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">{data.nombre_emisor || '-'}</span>
                      <span className="text-muted-foreground ml-2">({data.id_emisor || '-'})</span>
                    </div>
                    <div className="text-muted-foreground">
                      {data.direccion_emisor || '-'} {data.codigo_postal_emisor && `(${data.codigo_postal_emisor})`}
                    </div>
                  </div>
                </div>

                {/* Receptor */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <User className="w-3.5 h-3.5" />
                    Receptor
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">{data.nombre_receptor || '-'}</span>
                      <span className="text-muted-foreground ml-2">({data.id_receptor || '-'})</span>
                    </div>
                    <div className="text-muted-foreground">
                      {data.direccion_receptor || '-'} {data.codigo_postal_receptor && `(${data.codigo_postal_receptor})`}
                    </div>
                  </div>
                </div>

                {/* Importes */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                    <Euro className="w-3.5 h-3.5" />
                    Importes
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Subtotal: </span>
                      <span className="font-medium">{formatCurrency(data.subtotal, data.moneda)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IVA ({data.porcentaje_iva || 0}%): </span>
                      <span className="font-medium">{formatCurrency(data.impuestos, data.moneda)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-bold text-primary">{formatCurrency(data.total, data.moneda)}</span>
                    </div>
                  </div>
                </div>

                {/* Descripción */}
                {data.descripcion && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                      <FileCheck className="w-3.5 h-3.5" />
                      Descripción
                    </div>
                    <p className="text-sm">{data.descripcion}</p>
                  </div>
                )}

                {/* Exención */}
                {data.factura_exenta && (
                  <div className="flex items-center gap-2 p-2 bg-warning/10 rounded text-sm">
                    <AlertCircle className="w-4 h-4 text-warning" />
                    <span>Factura exenta: {data.motivo_exencion || 'Motivo no especificado'}</span>
                  </div>
                )}

                {/* Reasoning */}
                {invoice.classification_details?.reasoning && (
                  <div className="text-xs text-muted-foreground italic border-t pt-2">
                    IA: {invoice.classification_details.reasoning}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select
                  value={invoice.invoice_type || ''}
                  onValueChange={(value) => onUpdate(invoice.id, value as InvoiceType, invoice.operation_type || undefined)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emitida">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emitida" />
                        Emitida
                      </span>
                    </SelectItem>
                    <SelectItem value="recibida">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-recibida" />
                        Recibida
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Operación</label>
                <Select
                  value={invoice.operation_type || ''}
                  onValueChange={(value) => onUpdate(invoice.id, invoice.invoice_type || undefined, value as OperationType)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATION_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Feedback section - only show for classified invoices without feedback */}
            {invoice.classification_status === 'classified' && (
              <ClassificationFeedback
                currentType={invoice.invoice_type}
                currentOperation={invoice.operation_type}
                feedbackStatus={invoice.feedback_status}
                onFeedback={(isCorrect, correctedType, correctedOperation) => 
                  onFeedback(invoice.id, isCorrect, correctedType, correctedOperation)
                }
                isSubmitting={isSubmittingFeedback}
              />
            )}

            <div className="flex gap-2 pt-1">
              {invoice.classification_status === 'classified' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(!expanded)}
                  className="flex-1"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-2" />
                      Menos detalles
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Ver detalles
                    </>
                  )}
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(invoice.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
