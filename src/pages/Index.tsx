import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, LogOut } from "lucide-react";
import AnimatedText from "@/components/AnimatedText";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user, setShowAuthModal, logout, setPendingMessage, setInitialChatMessage } = useAuth();
  const [input, setInput] = useState("");

  // Показываем индикатор загрузки пока проверяется аутентификация
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      if (isAuthenticated) {
        // Для авторизованных пользователей устанавливаем initialChatMessage напрямую
        setInitialChatMessage(input.trim());
        navigate("/chat");
      } else {
        // Сохраняем сообщение для отправки после авторизации
        setPendingMessage(input.trim());
        setShowAuthModal(true);
      }
    }
  };

  const handleLogout = () => {
    logout();
    setShowAuthModal(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-3 sm:px-4">
      <div className="w-full max-w-3xl animate-fade-in">
        {/* Кнопка выхода для аутентифицированных пользователей */}
        {isAuthenticated && (
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Привет, {user?.name}!
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>
            </div>
          </div>
        )}

        <div className="text-center mb-8 sm:mb-12">
          <img 
            src="/logo.png" 
            alt="WindexsAI" 
            className="h-10 w-auto sm:h-14 md:h-16 max-w-full object-contain mx-auto mb-2 sm:mb-3"
            style={{ 
              maxWidth: 'min(100%, 350px)',
              height: 'auto',
              display: 'block'
            }}
          />
          <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 px-2">
            Я помогу вам <AnimatedText />
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full animate-slide-up">
          <div className="relative bg-card rounded-xl sm:rounded-2xl shadow-lg border border-border p-3 sm:p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Отправьте сообщение WindexsAI..."
              className="min-h-[100px] sm:min-h-[120px] resize-none border-0 focus-visible:ring-0 text-sm sm:text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className="flex justify-end mt-2">
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="rounded-full h-9 w-9 sm:h-10 sm:w-10"
              >
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mt-3 sm:mt-4 px-2">
            WindexsAI может допускать ошибки. Проверяйте важную информацию.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Index;
