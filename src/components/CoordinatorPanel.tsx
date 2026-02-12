import { useState } from 'react';
import { useAdmin } from '@/hooks/useAdmin';
import { useAdminInvoices } from '@/hooks/useAdminInvoices';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Users, Eye } from 'lucide-react';
import { AdminUserInvoices } from './AdminUserInvoices';
import logo from '@/assets/logo.png';
import { LogOut } from 'lucide-react';

interface CoordinatorPanelProps {
  onBack: () => void;
}

export function CoordinatorPanel({ onBack }: CoordinatorPanelProps) {
  const { user, signOut } = useAuth();
  const { teams, coordinatorTeams, teamMembers, isLoadingTeamMembers } = useAdmin();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');

  const { userInvoices, isLoading: isLoadingInvoices } = useAdminInvoices(selectedUserId || undefined);

  const assignedTeams = teams.filter(t => coordinatorTeams.includes(t.id));

  if (selectedUserId) {
    const invoices = userInvoices[0]?.invoices || [];
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Remmoto" className="h-8 w-auto" />
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
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
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Panel de Coordinador</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {isLoadingTeamMembers ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : assignedTeams.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tienes equipos asignados</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={assignedTeams[0]?.id}>
            <TabsList className="mb-4">
              {assignedTeams.map(t => (
                <TabsTrigger key={t.id} value={t.id}>{t.name}</TabsTrigger>
              ))}
            </TabsList>
            {assignedTeams.map(team => {
              const members = teamMembers.filter(m => m.team_id === team.id);
              return (
                <TabsContent key={team.id} value={team.id} className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    {team.name}
                    <Badge variant="secondary">{members.length} miembros</Badge>
                  </h3>
                  {members.length === 0 ? (
                    <Card className="glass-card">
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No hay miembros en este equipo
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {members.map(member => (
                        <Card key={member.user_id} className="glass-card">
                          <CardContent className="p-4 flex items-center justify-between">
                            <span className="font-medium">{member.email}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUserId(member.user_id);
                                setSelectedUserEmail(member.email);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver historial
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </main>
    </div>
  );
}
