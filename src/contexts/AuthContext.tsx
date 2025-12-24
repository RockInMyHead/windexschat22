import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [initialChatMessage, setInitialChatMessage] = useState<string | null>(null);

  useEffect(() => {
    // Проверяем, есть ли сохраненная аутентификация при загрузке
    const savedUser = localStorage.getItem('user');
    const savedAuth = localStorage.getItem('isAuthenticated');
    const savedUserId = localStorage.getItem('userId');

    console.log('🔍 AuthContext: Checking localStorage on app start:', {
      savedUser: !!savedUser,
      savedAuth,
      savedUserId,
      currentUrl: window.location.href
    });

    if (savedUser && savedAuth === 'true') {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
        console.log('✅ AuthContext: User restored from localStorage:', parsedUser);
      } catch (error) {
        console.error('❌ AuthContext: Failed to parse saved user:', error);
        // Очищаем поврежденные данные
        localStorage.removeItem('user');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userId');
        setShowAuthModal(true);
      }
    } else {
      console.log('ℹ️ AuthContext: No authentication found, showing auth modal');
      setShowAuthModal(true);
    }
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('isAuthenticated', 'true');
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    console.log('👋 AuthContext: User logged out');
  };

  const value = {
    user,
    isAuthenticated,
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
