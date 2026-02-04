import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, FileText, CheckCircle, Clock, ArrowLeft, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminPanelProps {
  onBack: () => void;
}

export function AdminPanel({ onBack }: AdminPanelProps) {
  const { user } = useAuth();
  const { userStats, isLoadingStats, refetchStats } = useAdmin();

  const totals = {
    users: userStats.length,
    totalInvoices: userStats.reduce((sum, u) => sum + Number(u.total_invoices), 0),
    classifiedInvoices: userStats.reduce((sum, u) => sum + Number(u.classified_invoices), 0),
    pendingInvoices: userStats.reduce((sum, u) => sum + Number(u.pending_invoices), 0),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Panel de Administración</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchStats()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Usuarios</p>
              </div>
              <p className="text-3xl font-bold text-primary">{totals.users}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Total Facturas</p>
              </div>
              <p className="text-3xl font-bold">{totals.totalInvoices}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Clasificadas</p>
              </div>
              <p className="text-3xl font-bold text-emitida">{totals.classifiedInvoices}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pendientes</p>
              </div>
              <p className="text-3xl font-bold text-warning">{totals.pendingInvoices}</p>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Usuarios Registrados</CardTitle>
            <CardDescription>
              Lista de todos los usuarios y sus estadísticas de facturas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : userStats.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No hay usuarios registrados
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Fecha de registro</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Clasificadas</TableHead>
                    <TableHead className="text-center">Pendientes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userStats.map((userStat) => (
                    <TableRow key={userStat.user_id}>
                      <TableCell className="font-medium">{userStat.email}</TableCell>
                      <TableCell>
                        {format(new Date(userStat.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{userStat.total_invoices}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emitida/10 text-emitida hover:bg-emitida/20">
                          {userStat.classified_invoices}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-warning/10 text-warning hover:bg-warning/20">
                          {userStat.pending_invoices}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
