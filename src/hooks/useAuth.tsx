import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from 'react';
import { apiFetch, getToken, setToken, removeToken, getSavedUser, saveUser } from '@/lib/api';

interface VpsUser {
  id: string;
  email: string;
  role: string;
  team_id: string | null;
}

interface AuthContextType {
  user: VpsUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<VpsUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for existing token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Try to validate token by calling /me
    apiFetch<VpsUser>('/api/auth/me')
      .then((userData) => {
        saveUser(userData);
        setUser(userData);
      })
      .catch(() => {
        // Token expired or invalid
        removeToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiFetch<{ token: string; user: VpsUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setToken(data.token);
      saveUser(data.user);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const signOut = useCallback(async () => {
    removeToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
