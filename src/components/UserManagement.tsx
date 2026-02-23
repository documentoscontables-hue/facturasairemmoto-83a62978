import { useState } from 'react';
import { useAdmin, AppRole } from '@/hooks/useAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, UserPlus } from 'lucide-react';
import { BulkUserImport } from './BulkUserImport';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  role: z.enum(['admin', 'coordinador', 'user']),
  team_id: z.string().optional(),
});

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'SuperAdmin',
  admin: 'Admin',
  coordinador: 'Coordinador',
  user: 'Usuario',
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-primary/10 text-primary',
  admin: 'bg-warning/10 text-warning',
  coordinador: 'bg-accent/10 text-accent',
  user: 'bg-muted text-muted-foreground',
};

export function UserManagement() {
  const { allUsers, teams, isLoadingUsers, isSuperAdmin, createUser, isCreatingUser, deleteUser, isDeletingUser, updateUserTeam, updateUserRole } = useAdmin();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('user');
  const [teamId, setTeamId] = useState<string>('');
  const [coordTeamIds, setCoordTeamIds] = useState<string[]>([]);

  const handleCreate = async () => {
    try {
      createUserSchema.parse({ email, password, role, team_id: teamId || undefined });
      
      await createUser({
        email,
        password,
        role,
        team_id: teamId || undefined,
        coordinator_team_ids: role === 'coordinador' ? coordTeamIds : undefined,
      });
      
      setIsDialogOpen(false);
      setEmail('');
      setPassword('');
      setRole('user');
      setTeamId('');
      setCoordTeamIds([]);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    }
  };

  const handleDelete = async (userId: string, userEmail: string, userRole: string) => {
    if (userRole === 'superadmin') {
      toast.error('No se puede eliminar al SuperAdmin');
      return;
    }
    if (!confirm(`¿Eliminar al usuario ${userEmail}? Esta acción no se puede deshacer.`)) return;
    await deleteUser(userId);
  };

  const toggleCoordTeam = (teamId: string) => {
    setCoordTeamIds(prev => 
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestión de Usuarios</h2>
          <p className="text-muted-foreground text-sm">Crear, editar y eliminar usuarios del sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <BulkUserImport />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <UserPlus className="w-4 h-4 mr-2" />
                Crear Usuario
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Usuario</DialogTitle>
              <DialogDescription>Completa los datos para crear una nueva cuenta</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@ejemplo.com" />
              </div>
              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Usuario</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="coordinador">Coordinador</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Equipo</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger>
                  <SelectContent>
                    {teams.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role === 'coordinador' && (
                <div className="space-y-2">
                  <Label>Equipos que coordina</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                    {teams.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <Checkbox 
                          checked={coordTeamIds.includes(t.id)}
                          onCheckedChange={() => toggleCoordTeam(t.id)}
                        />
                        <span className="text-sm">{t.name}</span>
                      </div>
                    ))}
                    {teams.length === 0 && <p className="text-sm text-muted-foreground">No hay equipos creados</p>}
                  </div>
                </div>
              )}
              <Button 
                className="w-full gradient-primary" 
                onClick={handleCreate} 
                disabled={isCreatingUser}
              >
                {isCreatingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Crear Usuario
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUsers.map((u: any) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[u.role] || ''}>
                        {ROLE_LABELS[u.role] || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.team_id || 'none'}
                        onValueChange={(v) => updateUserTeam({ userId: u.user_id, teamId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue placeholder="Sin equipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin equipo</SelectItem>
                          {teams.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.created_at), 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      {u.role !== 'superadmin' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(u.user_id, u.email, u.role)}
                          disabled={isDeletingUser}
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
