import { useState } from 'react';
import { useAdmin } from '@/hooks/useAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

export function TeamManagement() {
  const { teams, isLoadingTeams, allUsers, createTeam, deleteTeam } = useAdmin();
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTeamName.trim()) {
      toast.error('El nombre del equipo es requerido');
      return;
    }
    setIsCreating(true);
    try {
      await createTeam(newTeamName.trim());
      setNewTeamName('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el equipo "${name}"? Los usuarios de este equipo quedarán sin equipo.`)) return;
    await deleteTeam(id);
  };

  const getMemberCount = (teamId: string) => {
    return allUsers.filter((u: any) => u.team_id === teamId).length;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Gestión de Equipos</h2>
        <p className="text-muted-foreground text-sm">Crear y administrar los equipos de trabajo</p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del nuevo equipo"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={isCreating} className="gradient-primary shrink-0">
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoadingTeams ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay equipos creados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="text-center">Miembros</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{getMemberCount(t.id)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(t.created_at), 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(t.id, t.name)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
