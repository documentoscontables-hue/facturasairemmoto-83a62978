import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AppRole = 'superadmin' | 'admin' | 'coordinador' | 'user';

export function useAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get current user's role
  const { data: roleData, isLoading: isCheckingRole } = useQuery({
    queryKey: ['userRole', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      return data?.role || 'user';
    },
    enabled: !!user,
  });

  const userRole = (roleData || 'user') as AppRole;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isSuperAdmin = userRole === 'superadmin';
  const isCoordinator = userRole === 'coordinador';

  // User stats (admin only)
  const { data: userStats = [], isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_stats');
      if (error) throw error;

      // Get roles for all users
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const { data: profiles } = await supabase.from('profiles').select('user_id, team_id');

      const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
      const teamMap = new Map((profiles || []).map(p => [p.user_id, p.team_id]));

      return (data || []).map(u => ({
        ...u,
        role: roleMap.get(u.user_id) || 'user',
        team_id: teamMap.get(u.user_id) || null,
      }));
    },
    enabled: isAdmin,
  });

  // Teams
  const { data: teams = [], isLoading: isLoadingTeams, refetch: refetchTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

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
      const { data } = await supabase
        .from('coordinator_teams')
        .select('team_id')
        .eq('user_id', user.id);
      return (data || []).map(ct => ct.team_id);
    },
    enabled: isCoordinator,
  });

  // Team members for coordinator
  const { data: teamMembers = [], isLoading: isLoadingTeamMembers } = useQuery({
    queryKey: ['teamMembers', coordinatorTeams],
    queryFn: async () => {
      if (coordinatorTeams.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('user_id, email, team_id')
        .in('team_id', coordinatorTeams);
      return data || [];
    },
    enabled: isCoordinator && coordinatorTeams.length > 0,
  });

  // Create team
  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('teams').insert({ name });
      if (error) throw error;
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
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Equipo eliminado');
    },
    onError: (err) => toast.error(err.message),
  });

  // Create user via edge function
  const createUserMutation = useMutation({
    mutationFn: async (params: { email: string; password: string; role: string; team_id?: string; coordinator_team_ids?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('create-user', { body: params });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Usuario creado exitosamente');
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete user via edge function
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: userId } });
      if (error) throw error;
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
      const { error } = await supabase
        .from('profiles')
        .update({ team_id: teamId })
        .eq('user_id', userId);
      if (error) throw error;
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
      const { error } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      toast.success('Rol actualizado');
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    userRole,
    isCheckingRole,
    isAdmin,
    isSuperAdmin,
    isCoordinator,
    isCheckingAdmin: isCheckingRole,
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
