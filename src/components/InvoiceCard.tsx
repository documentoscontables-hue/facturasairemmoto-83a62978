import { Invoice, InvoiceType, OperationType, OPERATION_TYPE_LABELS } from '@/types/invoice';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Image, Sparkles, Trash2, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface InvoiceCardProps {
  invoice: Invoice;
  onClassify: (id: string) => void;
  onUpdate: (id: string, invoice_type?: InvoiceType, operation_type?: OperationType) => void;
  onDelete: (id: string) => void;
  isClassifying?: boolean;
}

export function InvoiceCard({ 
  invoice, 
  onClassify, 
  onUpdate, 
  onDelete,
  isClassifying 
}: InvoiceCardProps) {
  const statusConfig = {
    pending: { icon: Clock, label: 'Pendiente', className: 'bg-warning/10 text-warning' },
    classified: { icon: CheckCircle, label: 'Clasificada', className: 'bg-success/10 text-success' },
    error: { icon: AlertCircle, label: 'Error', className: 'bg-destructive/10 text-destructive' },
  };

  const status = statusConfig[invoice.classification_status];
  const StatusIcon = status.icon;

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
                  {format(new Date(invoice.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              <Badge variant="outline" className={cn("shrink-0", status.className)}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
            </div>

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

            <div className="flex gap-2 pt-1">
              {invoice.classification_status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onClassify(invoice.id)}
                  disabled={isClassifying}
                  className="flex-1"
                >
                  {isClassifying ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Clasificar con IA
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
