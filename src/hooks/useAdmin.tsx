import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AppRole = 'superadmin' | 'admin' | 'coordinador' | 'user';

interface UserWithStats {
  user_id: string;
  email: string;
  team_id: string | null;
  created_at: string;
  role: string;
  total_invoices: number;
  classified_invoices: number;
  pending_invoices: number;
}

interface Team {
  id: string;
  name: string;
  created_at: string;
}

export function useAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userRole = (user?.role || 'user') as AppRole;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isSuperAdmin = userRole === 'superadmin';
  const isCoordinator = userRole === 'coordinador';

  // User stats (admin only) - combined endpoint
  const { data: userStats = [], isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: async () => {
      const data = await apiFetch<UserWithStats[]>('/api/admin/users');
      return data;
    },
    enabled: isAdmin,
  });

  // Teams
  const { data: teams = [], isLoading: isLoadingTeams, refetch: refetchTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => apiFetch<Team[]>('/api/admin/teams'),
    enabled: isAdmin,
  });

  // All users (reuse userStats since admin/users returns everything)
  const allUsers = userStats.map(u => ({
    user_id: u.user_id,
    email: u.email,
    team_id: u.team_id,
    created_at: u.created_at,
    role: u.role || 'user',
  }));

  // Coordinator teams
  const { data: coordinatorTeams = [] } = useQuery({
    queryKey: ['coordinatorTeams', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return apiFetch<string[]>(`/api/admin/coordinator-teams/${user.id}`);
    },
    enabled: isCoordinator,
  });

  // Team members for coordinator
  const { data: teamMembers = [], isLoading: isLoadingTeamMembers } = useQuery({
    queryKey: ['teamMembers', coordinatorTeams],
    queryFn: async () => {
      if (coordinatorTeams.length === 0) return [];
      // Get all users and filter by coordinator's teams
      const users = await apiFetch<UserWithStats[]>('/api/admin/users');
      return users
        .filter(u => u.team_id && coordinatorTeams.includes(u.team_id))
        .map(u => ({ user_id: u.user_id, email: u.email, team_id: u.team_id }));
    },
    enabled: isCoordinator && coordinatorTeams.length > 0,
  });

  // Create team
  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiFetch('/api/admin/teams', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Equipo creado');
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete team
  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Equipo eliminado');
    },
    onError: (err) => toast.error(err.message),
  });

  // Create user
  const createUserMutation = useMutation({
    mutationFn: async (params: { email: string; password: string; role: string; team_id?: string; coordinator_team_ids?: string[] }) => {
      const data = await apiFetch('/api/admin/create-user', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Usuario creado exitosamente');
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const data = await apiFetch('/api/admin/delete-user', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Usuario eliminado');
    },
    onError: (err) => toast.error(err.message),
  });

  // Update user team
  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: string; teamId: string | null }) => {
      await apiFetch(`/api/admin/users/${userId}/team`, {
        method: 'PUT',
        body: JSON.stringify({ team_id: teamId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Equipo actualizado');
    },
    onError: (err) => toast.error(err.message),
  });

  // Update user role
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Rol actualizado');
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    userRole,
    isCheckingRole: false,
    isAdmin,
    isSuperAdmin,
    isCoordinator,
    isCheckingAdmin: false,
    userStats,
    isLoadingStats,
    refetchStats,
    teams,
    isLoadingTeams,
    refetchTeams,
    allUsers,
    isLoadingUsers: isLoadingStats,
    refetchUsers: refetchStats,
    coordinatorTeams,
    teamMembers,
    isLoadingTeamMembers,
    createTeam: createTeamMutation.mutateAsync,
    deleteTeam: deleteTeamMutation.mutateAsync,
    createUser: createUserMutation.mutateAsync,
    isCreatingUser: createUserMutation.isPending,
    deleteUser: deleteUserMutation.mutateAsync,
    isDeletingUser: deleteUserMutation.isPending,
    updateUserTeam: updateUserTeamMutation.mutateAsync,
    updateUserRole: updateUserRoleMutation.mutateAsync,
  };
}
