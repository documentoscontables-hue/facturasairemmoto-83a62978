import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface UserStats {
  user_id: string;
  email: string;
  created_at: string;
  total_invoices: number;
  classified_invoices: number;
  pending_invoices: number;
}

interface TeamData {
  id: string;
  name: string;
  created_at: string;
}

interface UserRoleData {
  user_id: string;
  role: string;
}

interface ProfileData {
  user_id: string;
  email: string;
  team_id: string | null;
}

export function useAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: adminRole, isLoading: isCheckingAdmin } = useQuery({
    queryKey: ['adminRole', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'superadmin']);
      
      if (error || !data || data.length === 0) return null;
      
      // Return highest role
      const roles = data.map(d => d.role);
      if (roles.includes('superadmin')) return 'superadmin';
      if (roles.includes('admin')) return 'admin';
      return null;
    },
    enabled: !!user,
  });

  const isAdmin = !!adminRole;
  const isSuperAdmin = adminRole === 'superadmin';

  const { data: userStats = [], isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_stats');
      if (error) throw error;
      return (data as UserStats[]) || [];
    },
    enabled: isAdmin,
  });

  // Teams
  const { data: teams = [], refetch: refetchTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data as TeamData[];
    },
    enabled: isAdmin,
  });

  // All user roles
  const { data: allUserRoles = [], refetch: refetchRoles } = useQuery({
    queryKey: ['allUserRoles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('user_id, role');
      if (error) throw error;
      return data as UserRoleData[];
    },
    enabled: isAdmin,
  });

  // All profiles
  const { data: allProfiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, email, team_id');
      if (error) throw error;
      return data as ProfileData[];
    },
    enabled: isAdmin,
  });

  // Create user
  const createUserMutation = useMutation({
    mutationFn: async ({ email, password, role, teamId }: { email: string; password: string; role: string; teamId?: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password, role, teamId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Usuario creado correctamente');
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Usuario eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update user role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'user' | 'superadmin' | 'coordinador' }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rol actualizado');
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update user team
  const updateTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: string; teamId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ team_id: teamId })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equipo actualizado');
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Create team
  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('teams').insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equipo creado');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete team
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      // Unassign users first
      await supabase.from('profiles').update({ team_id: null }).eq('team_id', teamId);
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equipo eliminado');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    isAdmin,
    isSuperAdmin,
    isCheckingAdmin,
    userStats,
    isLoadingStats,
    refetchStats,
    teams,
    refetchTeams,
    allUserRoles,
    allProfiles,
    createUser: createUserMutation.mutate,
    isCreatingUser: createUserMutation.isPending,
    deleteUser: deleteUserMutation.mutate,
    isDeletingUser: deleteUserMutation.isPending,
    updateRole: updateRoleMutation.mutate,
    updateTeam: updateTeamMutation.mutate,
    createTeam: createTeamMutation.mutate,
    deleteTeam: deleteTeamMutation.mutate,
  };
}
