import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Plus, Wifi, WifiOff, FileText, Volume2, VolumeX, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ChatHeaderProps {
  onNewChat: () => void;
  internetEnabled: boolean;
  onToggleInternet: () => void;
  userBalance: number | null;
  balanceLoading?: boolean;
  usdToRubRate?: number;
  onGenerateSummary?: () => void;
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  voiceCallEnabled?: boolean;
  onToggleVoiceCall?: () => void;
}

const ChatHeader = ({
  onNewChat,
  internetEnabled,
  onToggleInternet,
  userBalance,
  balanceLoading = false,
  onGenerateSummary,
  voiceEnabled = false,
  onToggleVoice,
  voiceCallEnabled = false,
  onToggleVoiceCall
}: ChatHeaderProps) => {
  const navigate = useNavigate();

  // Форматируем баланс в рублях
  const formatBalance = (balance: number | null) => {
    if (balance === null) return "0 ₽";
    return `${balance.toFixed(2)} ₽`;
  };

  return (
    <header className="border-b border-border bg-background sticky top-0 z-10" data-chat-header="true">
      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-shrink-0 min-w-[2.25rem]">
          {/* Кнопка меню для мобильных устройств */}
          <SidebarTrigger className="md:hidden" />
          <div className="hidden md:block">
             {/* Заголовок WindexsAI убран по запросу пользователя */}
          </div>
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
              <span className="text-xs sm:text-sm">Загрузка...</span>
            ) : (
              <span className="text-xs sm:text-sm font-medium text-green-700 whitespace-nowrap">
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

          {onToggleVoice && (
            <Button
              variant={voiceEnabled ? "default" : "outline"}
              size="sm"
              onClick={onToggleVoice}
              className={`gap-2 ${voiceEnabled ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
              title={voiceEnabled ? "Озвучка ответов включена" : "Озвучка ответов отключена"}
            >
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          )}

          {onToggleVoiceCall && (
            <Button
              variant={voiceCallEnabled ? "default" : "outline"}
              size="sm"
              onClick={onToggleVoiceCall}
              className={`gap-2 ${voiceCallEnabled ? 'bg-green-600 hover:bg-green-700' : ''}`}
              title={voiceCallEnabled ? "Голосовой звонок активен" : "Начать голосовой звонок"}
            >
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Звонок</span>
            </Button>
          )}

          {onGenerateSummary && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateSummary}
              className="gap-2"
              title="Создать резюме чата"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Резюме</span>
            </Button>
          )}

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
