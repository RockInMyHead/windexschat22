import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/lib/api';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  pendingMessage: string | null;
  setPendingMessage: (message: string | null) => void;
  initialChatMessage: string | null;
  setInitialChatMessage: (message: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [initialChatMessage, setInitialChatMessage] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const me = await apiClient.me();
        setUser(me);
        setIsAuthenticated(true);
        setShowAuthModal(false);
        console.log('✅ AuthContext: User restored from session:', me);
      } catch {
        // TEMP: Create demo user and session for testing instead of skipping auth
        try {
          console.log('🔧 AuthContext: Creating demo user with session...');
          const response = await apiClient.post('/auth/demo', {
            email: 'demo@example.com',
            username: 'Demo User'
          });
          setUser(response.user);
          setIsAuthenticated(true);
          setShowAuthModal(false);
          console.log('✅ AuthContext: Demo user with session created:', response.user);
        } catch (demoError) {
          console.error('❌ AuthContext: Demo auth failed:', demoError);
          // Fallback to old behavior
          setUser({ id: 1, email: 'demo@example.com', name: 'Demo User' });
        setIsAuthenticated(true);
        setShowAuthModal(false);
          console.log('🔧 AuthContext: Fallback to local demo user');
        }
      } finally {
        setIsLoading(false);
      }
    };
    boot();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setIsAuthenticated(true);
    console.log('✅ AuthContext: User logged in:', userData.id);
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('❌ AuthContext: Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      console.log('👋 AuthContext: User logged out');
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    showAuthModal,
    setShowAuthModal,
    pendingMessage,
    setPendingMessage,
    initialChatMessage,
    setInitialChatMessage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
