import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface UserStats {
  user_id: string;
  email: string;
  created_at: string;
  total_invoices: number;
  classified_invoices: number;
  pending_invoices: number;
}

export function useAdmin() {
  const { user } = useAuth();

  const { data: isAdmin, isLoading: isCheckingAdmin } = useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
      
      return !!data;
    },
    enabled: !!user,
  });

  const { data: userStats = [], isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_stats');
      
      if (error) {
        console.error('Error fetching user stats:', error);
        throw error;
      }
      
      return (data as UserStats[]) || [];
    },
    enabled: isAdmin === true,
  });

  return {
    isAdmin,
    isCheckingAdmin,
    userStats,
    isLoadingStats,
    refetchStats,
  };
}
