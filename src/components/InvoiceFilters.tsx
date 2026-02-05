import { InvoiceType, OperationType, OPERATION_TYPE_LABELS, INVOICE_TYPE_LABELS, ClassificationStatus } from '@/types/invoice';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface Filters {
  invoiceType: InvoiceType | 'all';
  operationType: OperationType | 'all';
  status: ClassificationStatus | 'all';
}

interface InvoiceFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function InvoiceFilters({ filters, onChange }: InvoiceFiltersProps) {
  const hasFilters = filters.invoiceType !== 'all' || filters.operationType !== 'all' || filters.status !== 'all';

  const clearFilters = () => {
    onChange({ invoiceType: 'all', operationType: 'all', status: 'all' });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.invoiceType}
        onValueChange={(value) => onChange({ ...filters, invoiceType: value as InvoiceType | 'all' })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los tipos</SelectItem>
          {Object.entries(INVOICE_TYPE_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.operationType}
        onValueChange={(value) => onChange({ ...filters, operationType: value as OperationType | 'all' })}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Operación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las operaciones</SelectItem>
          {Object.entries(OPERATION_TYPE_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(value) => onChange({ ...filters, status: value as ClassificationStatus | 'all' })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="classified">Clasificada</SelectItem>
          <SelectItem value="error">Error</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="w-4 h-4 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
