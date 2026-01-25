import { MessageSquare, User, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { apiClient, type ChatSession } from "@/lib/api";

interface ChatSidebarProps {
  onSelectChat: (sessionId: number) => void;
  currentSessionId?: number | null;
  refreshTrigger?: number;
  onChatDeleted?: () => void;
}

export function ChatSidebar({ onSelectChat, currentSessionId, refreshTrigger, onChatDeleted }: ChatSidebarProps) {
  const { state } = useSidebar();
  const { user, isAuthenticated, isLoading } = useAuth();
  const collapsed = state === "collapsed";
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadChatSessions = async () => {
      // Ждем завершения загрузки аутентификации
      if (isLoading) {
        console.log('⏳ ChatSidebar: Waiting for auth to load...');
        return;
      }

      // Проверяем аутентификацию
      if (!isAuthenticated || !user) {
        console.log('ℹ️ ChatSidebar: User not authenticated, skipping session load');
        setLoading(false);
        return;
      }

      try {
        console.log('📥 ChatSidebar: Loading sessions for user:', user.id);
        setLoading(true);
        const sessions = await apiClient.getAllSessions();
        setChatSessions(sessions);
        console.log('✅ ChatSidebar: Loaded sessions:', sessions.length);
      } catch (error) {
        console.error('❌ ChatSidebar: Error loading chat sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChatSessions();
  }, [refreshTrigger, user, isAuthenticated, isLoading]);

  const formatDate = (timestamp: number): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дня назад`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const handleChatClick = (sessionId: number) => {
    onSelectChat(sessionId);
  };

  const handleDeleteChat = async (sessionId: number, sessionTitle: string) => {
    console.log('Attempting to delete chat:', sessionId, sessionTitle);

    if (currentSessionId === sessionId) {
      alert('Нельзя удалить активный чат. Сначала переключитесь на другой чат.');
      return;
    }

    if (chatSessions.length <= 1) {
      alert('Нельзя удалить последний чат. Создайте новый чат перед удалением этого.');
      return;
    }


    try {
      console.log('Calling apiClient.deleteSession for sessionId:', sessionId);
      const result = await apiClient.deleteSession(sessionId);
      console.log('Delete result:', result);

      const updatedSessions = await apiClient.getAllSessions();
      console.log('Updated sessions after delete:', updatedSessions);

      setChatSessions(updatedSessions);
      if (onChatDeleted) onChatDeleted();

      console.log('Chat deleted successfully');
    } catch (error) {
      console.error('Error deleting chat session:', error);
      alert(`Ошибка при удалении чата: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleStartEdit = (sessionId: number, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
    // Фокусируемся на инпуте после рендера
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleSaveEdit = async (sessionId: number) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) {
      alert('Название не может быть пустым');
      return;
    }

    try {
      await apiClient.updateSessionTitle(sessionId, trimmedTitle);
      const updatedSessions = await apiClient.getAllSessions();
      setChatSessions(updatedSessions);
      setEditingSessionId(null);
      setEditingTitle("");
    } catch (error) {
      console.error('Error updating session title:', error);
      alert(`Ошибка при обновлении названия: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  // Обработка нажатия Enter и Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sessionId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(sessionId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  return (
    <Sidebar
      side="left"
      collapsible="icon"
      className="shrink-0"
      style={{
        "--sidebar-width": "16rem",       // аналог w-64
        "--sidebar-width-icon": "3.5rem", // аналог w-14
      } as React.CSSProperties}
    >
      <SidebarContent className="bg-background border-r border-border">
        <div className="p-4 flex items-center justify-between">
          {!collapsed && (
            <h2 className="text-lg font-semibold text-foreground">WindexsAI</h2>
          )}
          <SidebarTrigger className="ml-auto" />
        </div>

        {/* Кнопка "Новый чат" убрана по запросу пользователя */}
        {/* <div className="px-2 mb-4">
          <Button
            onClick={onNewChat}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            size={collapsed ? "icon" : "default"}
          >
            <Plus className="h-4 w-4" />
            {!collapsed && <span>Новый чат</span>}
          </Button>
        </div> */}

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-muted-foreground px-4">
              История чатов
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {!user ? (
                <div className="px-2 py-4 text-center text-muted-foreground">
                  {!collapsed && <span className="text-xs">Войдите в систему</span>}
                </div>
              ) : loading ? (
                <div className="px-2 py-4 text-center text-muted-foreground">
                  {!collapsed && <span className="text-xs">Загрузка...</span>}
                </div>
              ) : chatSessions.length === 0 ? (
                <div className="px-2 py-4 text-center text-muted-foreground">
                  {!collapsed && <span className="text-xs">Нет чатов</span>}
                </div>
              ) : (
                chatSessions.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    <div className={`relative group ${!collapsed ? 'w-full' : ''}`}>
                      {editingSessionId === session.id ? (
                        // Режим редактирования
                        <div className="flex items-center gap-1 px-2 py-1.5 w-full">
                          <Input
                            ref={inputRef}
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, session.id!)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 text-sm px-2 flex-1"
                            placeholder="Название чата"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEdit(session.id!);
                            }}
                            className="p-1 rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                            title="Сохранить"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Отмена"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        // Обычный режим
                        <>
                          <SidebarMenuButton
                            onDoubleClick={(e) => {
                              if (!collapsed) {
                                e.stopPropagation();
                                handleStartEdit(session.id!, session.title);
                              }
                            }}
                            onClick={() => handleChatClick(session.id!)}
                            className={`hover:bg-muted/50 flex items-center gap-2 w-full ${
                              currentSessionId === session.id ? 'bg-muted text-primary' : ''
                            }`}
                          >
                            <MessageSquare className="h-4 w-4 shrink-0" />
                            {!collapsed && (
                              <div className="flex-1 overflow-hidden">
                                <p className="text-sm truncate">{session.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(session.updated_at)}
                                </p>
                              </div>
                            )}
                          </SidebarMenuButton>

                          {!collapsed && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(session.id!, session.title);
                                }}
                                className="absolute right-8 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-all duration-200"
                                title="Переименовать чат"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteChat(session.id!, session.title);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
                                title="Удалить чат"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                          {collapsed && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteChat(session.id!, session.title);
                              }}
                              className="absolute -right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
                              title="Удалить чат"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Личный кабинет - всегда внизу */}
        <div className="sticky bottom-0 p-2 border-t border-border bg-background">
          <SidebarMenuButton asChild>
            <NavLink
              to="/profile"
              className="hover:bg-muted/50 flex items-center gap-2 w-full"
              activeClassName="bg-muted text-primary"
            >
              <User className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Личный кабинет</span>}
            </NavLink>
          </SidebarMenuButton>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
