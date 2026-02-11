import { useState } from 'react';
import { useAdmin } from '@/hooks/useAdmin';
import { useAdminInvoices } from '@/hooks/useAdminInvoices';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Users, FileText, CheckCircle, Clock, ArrowLeft, RefreshCw, Eye, UserPlus, Trash2, Shield, UsersRound, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AdminUserInvoices } from './AdminUserInvoices';
import { toast } from 'sonner';

interface AdminPanelProps {
  onBack: () => void;
}

const PROTECTED_EMAIL = 'ai01@remmoto.co';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'SuperAdmin',
  admin: 'Admin',
  coordinador: 'Coordinador',
  user: 'Usuario',
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-destructive/10 text-destructive',
  admin: 'bg-primary/10 text-primary',
  coordinador: 'bg-warning/10 text-warning',
  user: 'bg-muted text-muted-foreground',
};

export function AdminPanel({ onBack }: AdminPanelProps) {
  const { user } = useAuth();
  const {
    isSuperAdmin,
    userStats,
    isLoadingStats,
    refetchStats,
    teams,
    allUserRoles,
    allProfiles,
    createUser,
    isCreatingUser,
    deleteUser,
    isDeletingUser,
    updateRole,
    updateTeam,
    createTeam,
    deleteTeam,
  } = useAdmin();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');

  // Create user form
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newTeamId, setNewTeamId] = useState('');

  // Create team form
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const { userInvoices, isLoading: isLoadingInvoices } = useAdminInvoices(selectedUserId || undefined);

  const totals = {
    users: userStats.length,
    totalInvoices: userStats.reduce((sum: number, u: any) => sum + Number(u.total_invoices), 0),
    classifiedInvoices: userStats.reduce((sum: number, u: any) => sum + Number(u.classified_invoices), 0),
    pendingInvoices: userStats.reduce((sum: number, u: any) => sum + Number(u.pending_invoices), 0),
  };

  const getUserRole = (userId: string) => {
    const roleEntry = allUserRoles.find((r: any) => r.user_id === userId);
    return roleEntry?.role || 'user';
  };

  const getUserTeam = (userId: string) => {
    const profile = allProfiles.find((p: any) => p.user_id === userId);
    if (!profile?.team_id) return null;
    return teams.find((t: any) => t.id === profile.team_id);
  };

  const getUserEmail = (userId: string) => {
    const profile = allProfiles.find((p: any) => p.user_id === userId);
    return profile?.email || '';
  };

  const handleCreateUser = () => {
    if (!newEmail || !newPassword) {
      toast.error('Email y contraseña son requeridos');
      return;
    }
    createUser(
      { email: newEmail, password: newPassword, role: newRole, teamId: newTeamId || undefined },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          setNewEmail('');
          setNewPassword('');
          setNewRole('user');
          setNewTeamId('');
        },
      }
    );
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) {
      toast.error('El nombre del equipo es requerido');
      return;
    }
    createTeam(newTeamName.trim(), {
      onSuccess: () => {
        setShowTeamDialog(false);
        setNewTeamName('');
      },
    });
  };

  // If viewing a specific user's invoices
  if (selectedUserId) {
    const invoices = userInvoices?.[0]?.invoices || [];
    return (
      <div className="min-h-screen bg-background">
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
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <AdminUserInvoices
            userId={selectedUserId}
            userEmail={selectedUserEmail}
            invoices={invoices}
            isLoading={isLoadingInvoices}
            onBack={() => { setSelectedUserId(null); setSelectedUserEmail(''); }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

        <Tabs defaultValue="users" className="w-full">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="teams">
              <UsersRound className="w-4 h-4 mr-2" />
              Equipos
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Gestión de Usuarios</CardTitle>
                  <CardDescription>
                    Crea, gestiona roles y revisa el historial de cada usuario.
                  </CardDescription>
                </div>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button className="gradient-primary">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Crear Usuario
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                      <DialogDescription>
                        El usuario podrá iniciar sesión con estas credenciales.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          placeholder="usuario@email.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Contraseña</Label>
                        <Input
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Rol</Label>
                        <Select value={newRole} onValueChange={setNewRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuario</SelectItem>
                            <SelectItem value="coordinador">Coordinador</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            {isSuperAdmin && <SelectItem value="superadmin">SuperAdmin</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Equipo (opcional)</Label>
                        <Select value={newTeamId} onValueChange={setNewTeamId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin equipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin equipo</SelectItem>
                            {teams.map((team: any) => (
                              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateUser} disabled={isCreatingUser}>
                        {isCreatingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Crear
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Equipo</TableHead>
                          <TableHead>Registro</TableHead>
                          <TableHead className="text-center">Facturas</TableHead>
                          <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userStats.map((userStat: any) => {
                          const role = getUserRole(userStat.user_id);
                          const team = getUserTeam(userStat.user_id);
                          const isProtected = userStat.email === PROTECTED_EMAIL;

                          return (
                            <TableRow key={userStat.user_id}>
                              <TableCell className="font-medium">{userStat.email}</TableCell>
                              <TableCell>
                                {isProtected ? (
                                  <Badge className={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Badge>
                                ) : (
                                  <Select
                                    value={role}
                                    onValueChange={(value) =>
                                      updateRole({ userId: userStat.user_id, role: value as any })
                                    }
                                  >
                                    <SelectTrigger className="w-[140px] h-8">
                                      <Badge className={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Badge>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">Usuario</SelectItem>
                                      <SelectItem value="coordinador">Coordinador</SelectItem>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      {isSuperAdmin && <SelectItem value="superadmin">SuperAdmin</SelectItem>}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell>
                                {isProtected ? (
                                  <span className="text-muted-foreground text-sm">{team?.name || '—'}</span>
                                ) : (
                                  <Select
                                    value={team?.id || 'none'}
                                    onValueChange={(value) =>
                                      updateTeam({ userId: userStat.user_id, teamId: value === 'none' ? null : value })
                                    }
                                  >
                                    <SelectTrigger className="w-[140px] h-8">
                                      <SelectValue placeholder="Sin equipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Sin equipo</SelectItem>
                                      {teams.map((t: any) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(userStat.created_at), "d MMM yyyy", { locale: es })}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Badge variant="secondary">{userStat.total_invoices}</Badge>
                                  <Badge className="bg-emitida/10 text-emitida">{userStat.classified_invoices}</Badge>
                                  <Badge className="bg-warning/10 text-warning">{userStat.pending_invoices}</Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUserId(userStat.user_id);
                                      setSelectedUserEmail(userStat.email);
                                    }}
                                    disabled={userStat.total_invoices === 0}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {!isProtected && userStat.user_id !== user?.id && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Se eliminará permanentemente a <strong>{userStat.email}</strong> y todos sus datos. Esta acción no se puede deshacer.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() => deleteUser(userStat.user_id)}
                                            disabled={isDeletingUser}
                                          >
                                            {isDeletingUser && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                            Eliminar
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-4">
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Gestión de Equipos</CardTitle>
                  <CardDescription>
                    Crea y gestiona equipos para organizar usuarios.
                  </CardDescription>
                </div>
                <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
                  <DialogTrigger asChild>
                    <Button className="gradient-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Crear Equipo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Equipo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nombre del equipo</Label>
                        <Input
                          placeholder="Ej: Contabilidad"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowTeamDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateTeam}>Crear</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {teams.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No hay equipos creados
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Miembros</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teams.map((team: any) => {
                        const members = allProfiles.filter((p: any) => p.team_id === team.id);
                        return (
                          <TableRow key={team.id}>
                            <TableCell className="font-medium">{team.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {members.length === 0 ? (
                                  <span className="text-muted-foreground text-sm">Sin miembros</span>
                                ) : (
                                  members.map((m: any) => (
                                    <Badge key={m.user_id} variant="secondary" className="text-xs">
                                      {m.email}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(team.created_at), "d MMM yyyy", { locale: es })}
                            </TableCell>
                            <TableCell className="text-center">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Se eliminará el equipo <strong>{team.name}</strong>. Los usuarios asignados quedarán sin equipo.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => deleteTeam(team.id)}
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
