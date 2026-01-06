import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Mic, Square, Paperclip } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatMessage from "@/components/ChatMessage";
import ChatHeader from "@/components/ChatHeader";
import { ChatSidebar } from "@/components/ChatSidebar";
import { TokenCostDisplay } from "@/components/TokenCostDisplay";
import { BtcWidget } from "@/components/BtcWidget";
import { WebsiteArtifactCard } from "@/components/WebsiteArtifactCard";
import { WebsiteExecutionProgress } from "@/components/WebsiteExecutionProgress";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type PlanStep, type TokenCost } from "@/lib/openai";
import { apiClient, type Message } from "@/lib/api";
import { FileProcessor } from "@/lib/fileProcessor";
import { useAuth } from "@/contexts/AuthContext";
import { type MarketQuote, type MarketChart } from "@/lib/market";
import { useChatSession } from "@/hooks/useChatSession";
import { useBalance } from "@/hooks/useBalance";
import { useSmartScroll } from "@/hooks/useSmartScroll";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useArtifacts } from "@/hooks/useArtifacts";
import { useChatSend } from "@/hooks/useChatSend";

// Типы для market widget
type MarketWidgetState = {
  quote: MarketQuote;
  chart: MarketChart;
  vs: string;
  range: "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
};


const Chat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, initialChatMessage, setInitialChatMessage, setShowAuthModal } = useAuth();


  // Состояния
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("lite");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [responsePlan, setResponsePlan] = useState<PlanStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningCompleted, setPlanningCompleted] = useState(false);
  const [searchProgress, setSearchProgress] = useState<string[]>([]);
  const [thinkingMessages, setThinkingMessages] = useState<string[]>([]);
  const [lastTokenCost, setLastTokenCost] = useState<TokenCost | null>(null);
  const [marketWidget, setMarketWidget] = useState<MarketWidgetState | null>(null);
  const [internetEnabled, setInternetEnabled] = useState<boolean>(() => {
    // Загружаем настройку из localStorage
    const saved = localStorage.getItem('windexsai-internet-enabled');
    return saved !== null ? JSON.parse(saved) : true; // По умолчанию включено
  });

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Используем хуки для разделения ответственности
  const chatSession = useChatSession({ initialMessage: initialChatMessage || location.state?.initialMessage });
  const balance = useBalance({ user });
  const scroll = useSmartScroll();
  const artifacts = useArtifacts();

  // Хук для отправки сообщений (после объявления всех состояний)
  const chatSend = useChatSend({
    sessionId: chatSession.sessionId,
    selectedModel,
    internetEnabled,
    user,
    onMessageUpdate: setMessages,
    onArtifactCreated: (artifact) => {
      artifacts.setArtifacts(prev => {
        const next = new Map(prev);
        next.set(artifact.id!, artifact);
        return next;
      });
    },
    onArtifactUpdated: (artifact) => {
      artifacts.setArtifacts(prev => {
        const next = new Map(prev);
        next.set(artifact.id!, artifact);
        return next;
      });
    },
    onMarketWidgetUpdate: setMarketWidget,
    onThinkingUpdate: setThinkingMessages,
    onPlanningUpdate: (plan, currentStep, isPlanning) => {
      setResponsePlan(plan);
      setCurrentStep(currentStep);
      setIsPlanning(isPlanning);
    },
    onSearchProgress: setSearchProgress,
    onTokenCost: setLastTokenCost,
    onBalanceUpdate: () => {
      console.log('🔄 Refreshing balance after successful request...');
      balance.refreshBalance();
    },
    onScrollToBottom: scroll.scrollToBottom,
  });

  // Voice input state
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(true);

  // Voice input callbacks - use useCallback to prevent re-initialization
  const handleVoiceTranscript = useCallback((transcript: string) => {
    console.log('🎤 Voice transcript received:', transcript);
    setVoiceInputEnabled(true); // Re-enable after transcript
    if (transcript.trim()) {
      chatSend.sendMessage(transcript, messages);
    }
  }, [chatSend, messages]);

  // Автоматическое исчезновение плана после завершения планирования
  useEffect(() => {
    if (planningCompleted && responsePlan.length > 0) {
      console.log('⏰ Plan completed, will disappear in 3 seconds...');
      const timer = setTimeout(() => {
        console.log('✨ Plan disappeared');
        setResponsePlan([]);
        setCurrentStep(-1);
        setIsPlanning(false);
        setPlanningCompleted(false);
      }, 3000); // План исчезает через 3 секунды после завершения

      return () => clearTimeout(timer);
    }
  }, [planningCompleted, responsePlan.length]);

  // Эффект конвейера: постепенное увеличение currentStep для имитации выполнения шагов
  useEffect(() => {
    console.log('🔄 Conveyor effect triggered:', { isPlanning, planningCompleted, responsePlanLength: responsePlan.length, currentStep });

    // Не запускаем конвейер, если планирование уже завершено
    if (planningCompleted) {
      console.log('🛑 Planning already completed, skipping conveyor');
      return;
    }

    if (isPlanning && responsePlan.length > 0 && currentStep === -1) {
      console.log('🚀 Starting conveyor with first step in 1 second...');
      // Начинаем с первого шага через 1 секунду после генерации плана
      const startTimer = setTimeout(() => {
        console.log('✅ Setting currentStep to 0, showing conveyor');
        setCurrentStep(0);
      }, 1000);

      return () => clearTimeout(startTimer);
    }

    if (isPlanning && responsePlan.length > 0 && currentStep >= 0 && currentStep < responsePlan.length) {
      console.log(`⏱️ Step ${currentStep + 1}/${responsePlan.length} active, next step in 2 seconds...`);
      // Автоматически переходим к следующему шагу каждые 2 секунды
      const stepTimer = setTimeout(() => {
        if (currentStep < responsePlan.length - 1) {
          console.log(`➡️ Moving to step ${currentStep + 2}/${responsePlan.length}`);
          setCurrentStep(prev => prev + 1);
        } else {
          console.log('🎯 All steps completed, planning completed');
          // Все шаги выполнены, отмечаем завершение планирования
          setPlanningCompleted(true);
        }
      }, 2000);

      return () => clearTimeout(stepTimer);
    }
  }, [isPlanning, planningCompleted, responsePlan.length, currentStep]);

  const handleVoiceError = useCallback((error: string, message?: string) => {
    console.error('🎤 Voice input error:', { error, message });
    setVoiceInputEnabled(true); // Re-enable on error
    if (error === "aborted") {
      console.log('🎤 Aborted error ignored');
      return; // Игнорируем штатные aborted
    }
    if (error === "not-allowed") {
      alert("Нужно разрешить доступ к микрофону в настройках браузера");
    } else if (error === "no-speech") {
      alert("Речь не обнаружена. Попробуйте еще раз.");
    } else if (error === "start-failed") {
      alert("Не удалось начать запись голоса. Проверьте доступ к микрофону.");
    } else {
      alert(`Ошибка распознавания речи: ${error}${message ? ` (${message})` : ''}`);
    }
  }, []);

  // Voice input hook (после chatSend)
  const voiceInput = useVoiceInput({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError
  });

  // Track voice recording state changes
  useEffect(() => {
    if (!voiceInput.isRecording && !voiceInputEnabled) {
      // Recording just ended, re-enable voice input
      const timer = setTimeout(() => setVoiceInputEnabled(true), 500);
      return () => clearTimeout(timer);
    }
  }, [voiceInput.isRecording, voiceInputEnabled]);

  // Check browser support (only API availability, not permissions)
  const isSpeechRecognitionSupported = (() => {
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  })();
  


  // Функция для переключения интернет-поиска
  const handleToggleInternet = () => {
    const newValue = !internetEnabled;
    setInternetEnabled(newValue);
    localStorage.setItem('windexsai-internet-enabled', JSON.stringify(newValue));
  };
  const initialMessageSentRef = useRef(false);

  // Mobile keyboard handling
  useEffect(() => {
    const handleResize = () => {
      // Force recalculation of viewport height
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    const handleFocus = (e: FocusEvent) => {
      // On mobile, scroll to input when focused
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          const target = e.target as HTMLElement;
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    // Set initial viewport height
    handleResize();

    // Listen for viewport changes (keyboard open/close)
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Handle input focus on mobile
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('focus', handleFocus);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      inputs.forEach(input => {
        input.removeEventListener('focus', handleFocus);
      });
    };
  }, []);

  // Инициализация сессии и загрузка сообщений
  useEffect(() => {
    // Ждем завершения загрузки аутентификации
    if (isLoading) {
      console.log('⏳ Waiting for authentication to load...');
      return;
    }

    console.log('🔄 Initializing session, user authenticated:', !!user);

    const initializeSession = async () => {
      // Проверяем аутентификацию пользователя
      if (!user) {
        console.log('User not authenticated, showing auth modal...');
        setShowAuthModal(true);
        return;
      }

      // Проверяем, есть ли initialMessage
      const initialMessage = initialChatMessage || location.state?.initialMessage;

      // Проверяем, не была ли уже обработана эта initialMessage
      const hasProcessedInitialMessage = sessionStorage.getItem('processedInitialMessage') === (initialMessage || 'none');

      if (!chatSession.sessionId || (initialMessage && !hasProcessedInitialMessage)) {
        try {
          // Если есть initialMessage, всегда создаем новый чат
          if (initialMessage) {
            console.log('Creating new session for initial message...');
            // Создаем новую сессию с заголовком на основе первого сообщения
            const title = initialMessage.length > 50 ? initialMessage.substring(0, 47) + "..." : initialMessage;
            await chatSession.createSession(title);

            // Отправляем initialMessage как первое сообщение
            setTimeout(async () => {
              await chatSend.sendMessage(initialMessage, messages);
              // Очищаем initialMessage после использования
              setInitialChatMessage(null);
              // Помечаем сообщение как обработанное
              sessionStorage.setItem('processedInitialMessage', initialMessage);
              // Также очищаем location.state если он был использован
              if (window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }, 100);
          } else if (!chatSession.sessionId) {
            console.log('Creating new empty session...');
            // Создаем новую пустую сессию
            await chatSession.createSession("Новый чат");
          } else {
            // Загружаем существующие сообщения
            console.log('Loading existing session messages...');
            const savedMessages = await apiClient.getMessages(chatSession.sessionId);
            setMessages(savedMessages);

            // Загружаем артефакты для сообщений, у которых есть artifactId
            const artifactIds = savedMessages
              .filter(msg => msg.artifactId)
              .map(msg => msg.artifactId as number);

            if (artifactIds.length > 0) {
              await artifacts.loadArtifacts(artifactIds);
            }
          }
        } catch (error) {
          console.error('Error initializing session:', error);
        }
      }
    };

    // Вызываем инициализацию только при первом рендере или при изменении пользователя
    if (!isLoading && user) {
      initializeSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);


  // Очистка ресурсов при размонтировании
  useEffect(() => {
    return () => {
      FileProcessor.cleanup();
    };
  }, []);

  // Детектор market запросов
  const isMarketIntent = (text: string) =>
    /\b(курс|цена|котировк|биткоин|bitcoin|btc|график|chart)\b/i.test(text);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = input.trim();
    console.log('handleSubmit called:', {
      messageText,
      isLoading: chatSend.isLoading,
      isSending: chatSend.isSending,
      hasText: !!messageText
    });

    if (!chatSend.isLoading && !chatSend.isSending && messageText) {
      console.log('Sending message:', messageText);
      try {
        await chatSend.sendMessage(messageText, messages);
        console.log('Message sent successfully, clearing input');
        setInput(''); // Очищаем поле ввода после успешной отправки
      } catch (error) {
        console.error('Failed to send message:', error);
        // Не очищаем поле при ошибке, чтобы пользователь мог попробовать снова
      }
    } else {
      console.log('Submit blocked:', {
        loading: chatSend.isLoading,
        sending: chatSend.isSending,
        empty: !messageText
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверяем, поддерживается ли тип файла
    if (!FileProcessor.isSupportedFileType(file)) {
      alert(`Неподдерживаемый тип файла.\n${FileProcessor.getSupportedFileTypesDescription()}`);
      return;
    }

    // Проверяем размер файла (макс 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('Файл слишком большой. Максимальный размер: 10MB');
      return;
    }

    setIsProcessingFile(true);

    try {
      // Обрабатываем файл
      const processedFile = await FileProcessor.processFile(file);

      if (processedFile.success && processedFile.text.trim()) {
        // Создаем сообщение с содержимым файла
        const fileMessage = `📄 **${processedFile.fileName}**\n\n${processedFile.text}`;

        // Автоматически отправляем сообщение с содержимым файла
        await chatSend.sendMessage(`Проанализируй этот документ и дай краткое содержание:\n\n${fileMessage}`, messages);
      } else {
        // Показываем ошибку
        alert(processedFile.error || 'Не удалось обработать файл');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Произошла ошибка при обработке файла');
    } finally {
      setIsProcessingFile(false);
      // Сбрасываем input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleNewChat = async () => {
    try {
      // Прерываем текущий запрос, если он есть
      chatSend.abortCurrentRequest();

      // Очищаем все состояние перед созданием нового чата
      setMessages([]);
      setResponsePlan([]);
      setCurrentStep(-1);
      setIsPlanning(false);
      setPlanningCompleted(false);
      setSearchProgress([]);
      setThinkingMessages([]);
      setLastTokenCost(null);
      setMarketWidget(null); // Сбрасываем market widget
      artifacts.resetArtifacts(); // Очищаем артефакты

      // Создаем новую сессию
      const { sessionId: newSessionId } = await chatSession.createSession("Новый чат");

      // Обновляем sidebar для отображения новой сессии
      setSidebarRefreshTrigger(prev => prev + 1);
      // Очищаем input поле
      setInput("");

      console.log('New chat created with sessionId:', newSessionId);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  const handleSelectChat = async (sessionId: number) => {
    if (chatSend.isLoading || chatSession.sessionId === sessionId) return; // Предотвращаем одновременные операции и перезагрузку того же чата

    try {
      // Очищаем состояние перед загрузкой нового чата
      setResponsePlan([]);
      setCurrentStep(-1);
      setIsPlanning(false);
      setPlanningCompleted(false);
      setThinkingMessages([]);
      setLastTokenCost(null);
      setMarketWidget(null); // Сбрасываем market widget
      artifacts.resetArtifacts(); // Очищаем артефакты

      // Загружаем сессию
      await chatSession.loadSession(sessionId);

      // Загружаем сообщения выбранного чата
      const chatMessages = await apiClient.getMessages(sessionId);
      setMessages(chatMessages);

      // Загружаем артефакты для сообщений, у которых есть artifactId
      const artifactIds = chatMessages
        .filter(msg => msg.artifactId)
        .map(msg => msg.artifactId as number);

      if (artifactIds.length > 0) {
        const uniqueArtifactIds = [...new Set(artifactIds)];
        await artifacts.loadArtifacts(uniqueArtifactIds);
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  // Показываем индикатор загрузки пока проверяется аутентификация
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Проверяем авторизацию...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <ChatSidebar
          onSelectChat={handleSelectChat}
          currentSessionId={chatSession.sessionId}
          refreshTrigger={sidebarRefreshTrigger}
          onChatDeleted={() => setSidebarRefreshTrigger(prev => prev + 1)}
        />

        <SidebarInset className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <ChatHeader
            onNewChat={handleNewChat}
            internetEnabled={internetEnabled}
            onToggleInternet={handleToggleInternet}
            userBalance={balance.balance}
            balanceLoading={balance.isLoading}
          />

          <div className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0">
            <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
              {messages.length === 0 && (
                <div className="text-center py-12 sm:py-20 animate-fade-in">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-foreground mb-4">
                    Начните разговор с WindexsAI
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Задайте вопрос, загрузите файл или используйте голосовой ввод
                  </p>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-3 justify-center max-w-lg mx-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInput("Расскажи о себе")}
                      className="text-xs"
                    >
                      📖 О проекте
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInput("Какие у тебя возможности?")}
                      className="text-xs"
                    >
                      ⚡ Возможности
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInput("Создай простой веб-сайт с формой контактов")}
                      className="text-xs"
                    >
                      🌐 Создать сайт
                    </Button>
                  </div>
                </div>
              )}

              {/* Сообщения */}
              {messages.map((message, index) => (
                <div key={index} className="mb-4">
                  <ChatMessage
                    message={message}
                    selectedModel={selectedModel}
                  />

                  {/* Artifact display */}
                  {message.artifactId && artifacts.artifacts.has(message.artifactId) && (
                    <WebsiteArtifactCard
                      artifact={artifacts.artifacts.get(message.artifactId)!}
                    />
                  )}
                </div>
              ))}

              {/* Thinking messages */}
              {thinkingMessages.filter(msg => !msg.startsWith('📋 Генерирую план ответа')).map((thinking, index) => {
                // Фильтруем индикатор строки плана (он станет видим только если что-то реально долго "думает" без финального плана)
                return (
                  <div key={`thinking-${index}`} className="mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground whitespace-pre-line">
                          {thinking}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Website execution progress */}
              <WebsiteExecutionProgress
                steps={chatSend.executionSteps}
                isVisible={chatSend.isExecutingWebsite}
              />

              {/* Response plan - конвейер из 4 шагов */}
              {responsePlan.length > 0 && currentStep >= 0 && (isPlanning || planningCompleted) && (
                <div className="mb-4 p-4 bg-secondary/50 rounded-lg border">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    📋 План выполнения ({responsePlan.length} шагов)
                  </h4>
                  <div className="space-y-2">
                    {responsePlan.slice(Math.max(0, currentStep), Math.max(0, currentStep) + 4).map((step, displayIndex) => {
                      // Корректируем индекс относительно полного массива
                      const actualIndex = Math.max(0, currentStep) + displayIndex;
                      const isActive = actualIndex === currentStep;
                      const isCompleted = actualIndex < currentStep;

                      // Конвертируем шаг в текстовый формат: "step : description. searchQueries[0].query"
                      const firstSearchQuery = step.searchQueries?.[0]?.query || '';
                      const planText = `${step.step} : ${step.description}. ${firstSearchQuery}`;

                      return (
                        <div
                          key={actualIndex}
                          className={`text-sm flex items-start gap-2 ${
                            isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                            isCompleted ? 'bg-green-500' :
                            isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                          }`} />
                          <span className="flex-1 whitespace-pre-line">{planText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Market widget */}
              {marketWidget && (
                <div className="mb-4">
                  <BtcWidget />
                </div>
              )}

              {/* Loading indicator */}
              {chatSend.isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="flex-1">
                      <div className="bg-secondary rounded-lg p-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Invisible element for scrolling */}
              <div ref={scroll.messagesEndRef} />
            </div>
          </div>

          {/* Token cost display */}
          {lastTokenCost && (
            <div className="px-4 py-2 border-t bg-secondary/20">
              <TokenCostDisplay
                tokenCost={lastTokenCost}
              />
            </div>
          )}

          {/* Input area */}
          <div className="w-full border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="w-full max-w-5xl mx-auto px-2 sm:px-4">
              <form onSubmit={handleSubmit} className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Введите сообщение..."
                    className="min-h-[44px] max-h-32 resize-none pr-12"
                    disabled={chatSend.isLoading || chatSend.isSending || isProcessingFile}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                      }
                    }}
                  />

                  {/* File upload button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 bottom-2 h-8 w-8 p-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatSend.isLoading || chatSend.isSending || isProcessingFile}
                    title="Прикрепить файл"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  type="button"
                  onClick={input.trim() ? (e) => {
                    console.log('🎤 Click: sending message');
                    e.preventDefault();
                    handleSubmit(e as any);
                  } : (e) => {
                    console.log('🎤 Click on voice button, input empty:', !input.trim(), 'supported:', isSpeechRecognitionSupported);
                    e.preventDefault();
                    if (!isSpeechRecognitionSupported) {
                      alert('Голосовой ввод не поддерживается в этом браузере');
                      return;
                    }
                    if (voiceInput.isRecording) {
                      voiceInput.stopRecording();
                    } else {
                      setVoiceInputEnabled(false);
                      const started = voiceInput.startRecording();
                      if (!started) {
                        setVoiceInputEnabled(true);
                        return;
                      }
                      // Auto-stop after 5 seconds for safety
                      setTimeout(() => {
                        voiceInput.stopRecording();
                        setVoiceInputEnabled(true);
                      }, 5000);
                    }
                  }}
                  disabled={chatSend.isLoading || isProcessingFile || (!input.trim() && (!isSpeechRecognitionSupported || !voiceInputEnabled))}
                  className={`h-10 w-10 sm:h-[52px] sm:w-[52px] shrink-0 ${
                    input.trim() ? "" : voiceInput.isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : (!voiceInput.isSupported ? "opacity-50" : "")
                  }`}
                  title={
                    !isSpeechRecognitionSupported && !input.trim() ? "Голосовой ввод не поддерживается" :
                    input.trim() ? "Отправить сообщение" :
                    voiceInput.isRecording ? "Нажмите для остановки записи" : "Нажмите для голосового ввода"
                  }
                >
                  {input.trim() ? (
                    <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : voiceInput.isRecording ? (
                    <Square className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  ) : !isSpeechRecognitionSupported ? (
                    <Mic className="h-4 w-4 sm:h-5 sm:w-5 opacity-50" />
                  ) : (
                    <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </Button>
              </form>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.bmp,.tiff,.webp,application/pdf,text/plain,image/*"
              />

              <p className="text-xs text-muted-foreground text-center mt-2">
                WindexsAI может допускать ошибки. Проверяйте важную информацию.
              </p>
            </div>
          </div>
      </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Chat;

