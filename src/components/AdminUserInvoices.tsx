import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Calendar, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Invoice, OPERATION_TYPE_LABELS, INVOICE_TYPE_LABELS } from '@/types/invoice';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AdminUserInvoicesProps {
  userId: string;
  userEmail: string;
  invoices: Invoice[];
  isLoading: boolean;
  onBack: () => void;
}

interface GroupedInvoices {
  date: string;
  invoices: Invoice[];
}

function groupInvoicesByDate(invoices: Invoice[]): GroupedInvoices[] {
  const grouped: Record<string, Invoice[]> = {};
  
  invoices.forEach(invoice => {
    const date = format(new Date(invoice.created_at), 'yyyy-MM-dd');
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(invoice);
  });

  return Object.entries(grouped)
    .map(([date, invoices]) => ({ date, invoices }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function InvoiceTypeBadge({ type }: { type: Invoice['invoice_type'] }) {
  if (!type) return <Badge variant="secondary">Sin clasificar</Badge>;
  
  const colors: Record<string, string> = {
    emitida: 'bg-emitida/10 text-emitida',
    recibida: 'bg-recibida/10 text-recibida',
    proforma: 'bg-muted text-muted-foreground',
  };

  return (
    <Badge className={colors[type] || ''}>
      {INVOICE_TYPE_LABELS[type]}
    </Badge>
  );
}

function DateGroup({ group, defaultOpen = false }: { group: GroupedInvoices; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const stats = {
    total: group.invoices.length,
    emitidas: group.invoices.filter(i => i.invoice_type === 'emitida').length,
    recibidas: group.invoices.filter(i => i.invoice_type === 'recibida').length,
    proformas: group.invoices.filter(i => i.invoice_type === 'proforma').length,
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Card className="glass-card cursor-pointer hover:bg-muted/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
                <Calendar className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">
                    {format(new Date(group.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stats.total} factura{stats.total !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {stats.emitidas > 0 && (
                  <Badge className="bg-emitida/10 text-emitida">{stats.emitidas} emitidas</Badge>
                )}
                {stats.recibidas > 0 && (
                  <Badge className="bg-recibida/10 text-recibida">{stats.recibidas} recibidas</Badge>
                )}
                {stats.proformas > 0 && (
                  <Badge variant="secondary">{stats.proformas} proformas</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-4 border-l-2 border-muted pl-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Archivo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Receptor</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.invoices.map((invoice) => {
                const extracted = invoice.classification_details?.extracted_data;
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]" title={invoice.file_name}>
                          {invoice.file_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{invoice.client_name || '-'}</TableCell>
                    <TableCell>
                      <InvoiceTypeBadge type={invoice.invoice_type} />
                    </TableCell>
                    <TableCell>
                      {invoice.operation_type ? (
                        <span className="text-sm">
                          {OPERATION_TYPE_LABELS[invoice.operation_type]}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium truncate max-w-[120px]" title={extracted?.nombre_emisor}>
                          {extracted?.nombre_emisor || '-'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {extracted?.id_emisor || ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium truncate max-w-[120px]" title={extracted?.nombre_receptor}>
                          {extracted?.nombre_receptor || '-'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {extracted?.id_receptor || ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {extracted?.total ? (
                        `${extracted.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${extracted.moneda || 'EUR'}`
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdminUserInvoices({ userId, userEmail, invoices, isLoading, onBack }: AdminUserInvoicesProps) {
  const groupedInvoices = groupInvoicesByDate(invoices);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Historial de Facturas</h2>
          <p className="text-muted-foreground">{userEmail}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : groupedInvoices.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Este usuario no tiene facturas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedInvoices.map((group, index) => (
            <DateGroup 
              key={group.date} 
              group={group} 
              defaultOpen={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
