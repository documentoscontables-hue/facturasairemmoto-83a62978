import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Dashboard } from '@/components/Dashboard';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Dashboard />;
}
