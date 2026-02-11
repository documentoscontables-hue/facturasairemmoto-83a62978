import { useState, useMemo } from 'react';
import { useInvoices } from '@/hooks/useInvoices';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { InvoiceUploader } from './InvoiceUploader';
import { InvoiceCard } from './InvoiceCard';
import { InvoiceTable } from './InvoiceTable';
import { InvoiceFilters } from './InvoiceFilters';
import { ClassificationProgress } from './ClassificationProgress';
import { AdminPanel } from './AdminPanel';
import { AccountBookUploader } from './AccountBookUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, LogOut, Loader2, FolderOpen, Shield, Sparkles, LayoutGrid, Table } from 'lucide-react';
import logo from '@/assets/logo.png';
import { InvoiceType, OperationType, ClassificationStatus } from '@/types/invoice';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Filters {
  invoiceType: InvoiceType | 'all';
  operationType: OperationType | 'all';
  status: ClassificationStatus | 'all';
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const { isAdmin, isCheckingAdmin } = useAdmin();
  const { 
    invoices, 
    isLoading, 
    uploadInvoices, 
    isUploading,
    updateInvoice,
    classifyAllInvoices,
    isClassifyingAll,
    classificationProgress,
    submitFeedback,
    isSubmittingFeedback,
    deleteInvoice
  } = useInvoices();

  const [filters, setFilters] = useState<Filters>({
    invoiceType: 'all',
    operationType: 'all',
    status: 'all',
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      if (filters.invoiceType !== 'all' && invoice.invoice_type !== filters.invoiceType) return false;
      if (filters.operationType !== 'all' && invoice.operation_type !== filters.operationType) return false;
      if (filters.status !== 'all' && invoice.classification_status !== filters.status) return false;
      return true;
    });
  }, [invoices, filters]);

  const stats = useMemo(() => ({
    total: invoices.length,
    emitidas: invoices.filter(i => i.invoice_type === 'emitida').length,
    recibidas: invoices.filter(i => i.invoice_type === 'recibida').length,
    proformas: invoices.filter(i => i.invoice_type === 'proforma').length,
    albaranes: invoices.filter(i => i.invoice_type === 'albaran').length,
    tickets: invoices.filter(i => i.invoice_type === 'ticket').length,
    pending: invoices.filter(i => i.classification_status === 'pending').length,
  }), [invoices]);

  const pendingInvoices = useMemo(() => 
    invoices.filter(i => i.classification_status === 'pending'),
    [invoices]
  );

  // Show admin panel if toggled (moved after all hooks)
  if (showAdminPanel && isAdmin) {
    return <AdminPanel onBack={() => setShowAdminPanel(false)} />;
  }

  const handleClassifyAll = async () => {
    if (pendingInvoices.length === 0) {
      toast.error('No hay facturas pendientes para clasificar');
      return;
    }
    await classifyAllInvoices({ 
      invoiceIds: pendingInvoices.map(i => i.id),
      invoices: pendingInvoices
    });
  };

  const handleDownloadZip = async () => {
    if (filteredInvoices.length === 0) {
      toast.error('No hay facturas para descargar');
      return;
    }

    setIsDownloading(true);
    try {
      const zip = new JSZip();

      for (const invoice of filteredInvoices) {
        const { data, error } = await supabase.storage
          .from('invoices')
          .download(invoice.file_path);

        if (error) {
          console.error('Error downloading:', invoice.file_name);
          continue;
        }

        const folder = `${invoice.invoice_type || 'sin_clasificar'}/${invoice.operation_type || 'sin_operacion'}`;
        zip.file(`${folder}/${invoice.file_name}`, data);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facturas-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Descarga completada');
    } catch (error) {
      toast.error('Error al generar el ZIP');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Remmoto" className="h-8 w-auto" />
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setShowAdminPanel(true)}>
                <Shield className="w-4 h-4 mr-2" />
                Admin
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'bg-primary/10 text-primary' },
            { label: 'Emitidas', value: stats.emitidas, color: 'bg-emitida/10 text-emitida' },
            { label: 'Recibidas', value: stats.recibidas, color: 'bg-recibida/10 text-recibida' },
            { label: 'Proformas', value: stats.proformas, color: 'bg-muted text-muted-foreground' },
            { label: 'Albaranes', value: stats.albaranes, color: 'bg-muted text-muted-foreground' },
            { label: 'Tickets', value: stats.tickets, color: 'bg-muted text-muted-foreground' },
            { label: 'Pendientes', value: stats.pending, color: 'bg-warning/10 text-warning' },
          ].map((stat) => (
            <Card key={stat.label} className="glass-card">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.color.split(' ')[1]}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Subir facturas</CardTitle>
                <CardDescription>
                  Sube tus facturas y se clasificarán automáticamente con IA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InvoiceUploader onUpload={uploadInvoices} isUploading={isUploading} />
              </CardContent>
            </Card>
            
            {/* Account Book Uploader */}
            <AccountBookUploader />
          </div>

          {/* Invoice List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <InvoiceFilters filters={filters} onChange={setFilters} />
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'cards' | 'table')}>
                  <TabsList className="h-9">
                    <TabsTrigger value="cards" className="px-3">
                      <LayoutGrid className="w-4 h-4" />
                    </TabsTrigger>
                    <TabsTrigger value="table" className="px-3">
                      <Table className="w-4 h-4" />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex gap-2">
                {stats.pending > 0 && !isClassifyingAll && (
                  <Button 
                    onClick={handleClassifyAll}
                    disabled={isClassifyingAll}
                    className="gradient-primary"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Clasificar todas ({stats.pending})
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={handleDownloadZip}
                  disabled={isDownloading || filteredInvoices.length === 0}
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Descargar ZIP
                </Button>
              </div>
            </div>

            {/* Classification Progress */}
            {classificationProgress && (
              <ClassificationProgress progress={classificationProgress} />
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg">No hay facturas</h3>
                  <p className="text-muted-foreground">
                    {invoices.length === 0 
                      ? 'Sube tu primera factura para empezar'
                      : 'No se encontraron facturas con los filtros seleccionados'}
                  </p>
                </CardContent>
              </Card>
            ) : viewMode === 'cards' ? (
              <div className="space-y-4">
                {filteredInvoices.map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    onUpdate={(id, type, op) => updateInvoice({ id, invoice_type: type, operation_type: op })}
                    onDelete={deleteInvoice}
                    onFeedback={(invoiceId, isCorrect, correctedType, correctedOperation) => 
                      submitFeedback({
                        invoiceId,
                        isCorrect,
                        originalType: invoice.invoice_type,
                        originalOperation: invoice.operation_type,
                        correctedType,
                        correctedOperation,
                      })
                    }
                    isSubmittingFeedback={isSubmittingFeedback}
                  />
                ))}
              </div>
            ) : (
              <InvoiceTable 
                invoices={filteredInvoices} 
                onDelete={deleteInvoice}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
