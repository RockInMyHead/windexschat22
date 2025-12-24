import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import Index from "./pages/Index";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Маршруты защищены автоматически через Index.tsx, который показывает модальное окно для неавторизованных пользователей

// Основной компонент приложения
const AppContent = () => {
  const navigate = useNavigate();
  const { showAuthModal, setShowAuthModal, login, pendingMessage, setInitialChatMessage, setPendingMessage } = useAuth();

  const handleAuthSuccess = (user: { id: number; name: string; email: string }, initialMessage?: string) => {
    login(user);
    setShowAuthModal(false);

    // Если есть отложенное сообщение, сохраняем его для чата
    const messageToSend = initialMessage || pendingMessage;
    if (messageToSend) {
      setInitialChatMessage(messageToSend);
      // Очищаем pendingMessage после использования
      setPendingMessage(null);
      // Переходим в чат
      setTimeout(() => {
        navigate("/chat");
      }, 100);
    }
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/profile" element={<Profile />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        initialMessage={pendingMessage || undefined}
      />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
