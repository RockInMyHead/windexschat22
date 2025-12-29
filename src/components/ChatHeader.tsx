import { Button } from "@/components/ui/button";
import { Plus, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ChatHeaderProps {
  onNewChat: () => void;
  internetEnabled: boolean;
  onToggleInternet: () => void;
  userBalance?: number | null;
  balanceLoading?: boolean;
  usdToRubRate?: number;
}

const ChatHeader = ({
  onNewChat,
  internetEnabled,
  onToggleInternet,
  userBalance,
  balanceLoading = false
}: ChatHeaderProps) => {
  const navigate = useNavigate();

  // Форматируем баланс в рублях
  const formatBalance = (balance: number | null) => {
    if (balance === null) return "0 ₽";
    return `${balance.toFixed(2)} ₽`;
  };

  return (
    <header className="border-b border-border bg-background sticky top-0 z-10">
      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Заголовок WindexsAI убран по запросу пользователя */}
        </div>
        <div className="flex items-center gap-2">
          {/* Баланс пользователя */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/profile')}
            className="gap-2 bg-green-50 hover:bg-green-100 border-green-200"
            title="Перейти в кошелек"
          >
            {balanceLoading ? (
              <span className="hidden sm:inline">Загрузка...</span>
            ) : (
              <span className="hidden sm:inline font-medium text-green-700">
                {formatBalance(userBalance)}
              </span>
            )}
          </Button>

          <Button
            variant={internetEnabled ? "default" : "outline"}
            size="sm"
            onClick={onToggleInternet}
            className={`gap-2 ${internetEnabled ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
            title={internetEnabled ? "Интернет-поиск включен" : "Интернет-поиск отключен"}
          >
            {internetEnabled ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewChat}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Новый чат</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default ChatHeader;
