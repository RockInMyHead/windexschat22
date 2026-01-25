import { useState, useRef, useCallback, useEffect } from 'react';
import { sendChatMessage, type PlanStep, type TokenCost, detectWebsiteIntent, generateWebsiteArtifact } from '@/lib/openai';
import { apiClient, type Message, type Artifact } from '@/lib/api';
import { type MarketQuote, type MarketChart } from '@/lib/market';

// Throttling utility for streaming updates
const throttle = <T extends any[]>(func: (...args: T) => void, delay: number) => {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastExecTime = 0;

  return (...args: T) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
};

// Execution events types
type ExecutionEvent =
  | { type: "step_start"; id: string; label: string }
  | { type: "step_done"; id: string }
  | { type: "step_error"; id: string; error: string }
  | { type: "fatal"; error: string }
  | { type: "ping"; ts?: number }
  | { type: "done"; artifactId: number };

// Execution step type for UI
type ExecutionStep = {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  error?: string;
};

// Website execution stream function
async function executeWebsiteStream(
  prompt: string,
  sessionId: number,
  onEvent: (event: ExecutionEvent) => void
): Promise<{ artifactId: number }> {
  // Тайминги - увеличены для стабильности
  const IDLE_TIMEOUT_MS = 300_000;       // 5 минут без данных
  const HARD_TIMEOUT_MS = 45 * 60_000;   // 45 минут абсолютный потолок

  const controller = new AbortController();
  const decoder = new TextDecoder();

  let settled = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    idleTimer = null;
    hardTimer = null;
  };

  const cleanup = async () => {
    clearTimers();
    try { controller.abort(); } catch {}
    try { await reader?.cancel(); } catch {}
  };

  const armIdle = (rejectFn: (e: Error) => void) => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      rejectFn(new Error(`Website generation idle timeout (${Math.round(IDLE_TIMEOUT_MS / 1000)}s)`));
    }, IDLE_TIMEOUT_MS);
  };

  return new Promise(async (resolve, reject) => {
    const safeResolve = async (v: { artifactId: number }) => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve(v);
    };

    const safeReject = async (e: unknown) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(e);
    };

    // HARD timeout (абсолютный)
    hardTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new Error(`Website generation timeout (${Math.round(HARD_TIMEOUT_MS / 60000)} minutes)`));
    }, HARD_TIMEOUT_MS);

    try {
      // стартуем idle timeout
      armIdle((e) => reject(e));

      const response = await fetch("/api/website/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sessionId }),
        signal: controller.signal, // ✅ критично
      });

      if (!response.ok) {
        await safeReject(new Error(`HTTP error! status: ${response.status}`));
        return;
      }

      reader = response.body?.getReader() || null;
      if (!reader) {
        await safeReject(new Error("No response body reader"));
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('📡 Stream done signal received');
          break;
        }

        // пришли данные — сбрасываем idle timeout
        armIdle((e) => reject(e));

        buffer += decoder.decode(value, { stream: true });
        console.log(`📦 Received chunk, buffer size: ${buffer.length}`);

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        console.log(`📋 Processing ${lines.length} lines from buffer`);

        for (const line of lines) {
          if (settled) {
            console.log('⚠️ Already settled, ignoring line');
            return;
          }

          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          let event: ExecutionEvent | null = null;
          try {
            event = JSON.parse(trimmedLine);
            console.log(`✅ Parsed event:`, event.type, event);
          } catch (e) {
            console.warn("Failed to parse execution event:", trimmedLine, e);
            continue;
          }

          // событие пришло — сбрасываем idle timeout
          armIdle((e) => reject(e));

          // Специально логируем ping события
          if (event.type === "ping") {
            console.log(`🏓 Ping received at ${new Date().toISOString()}`);
            continue; // Не передаем ping в onEvent
          }

          // ✅ не дергаем onEvent после settle
          if (!settled) {
            console.log(`📤 Calling onEvent for:`, event.type);
            try {
              onEvent(event);
            } catch (onEventError) {
              console.error(`❌ Error in onEvent handler:`, onEventError);
              // Не прерываем стрим из-за ошибки в обработчике
            }
          }

          if (event.type === "done") {
            console.log(`✅ Done event received, artifactId: ${event.artifactId}`);
            await safeResolve({ artifactId: event.artifactId });
            return;
          }

          if (event.type === "step_error" || event.type === "fatal") {
            console.error(`❌ Error event received:`, (event as any).error);
            await safeReject(new Error((event as any).error || "Website generation failed"));
            return;
          }
        }
      }

      console.log('🔚 While loop ended, checking buffer...');

      // Пытаемся разобрать хвост буфера (если сервер не закончил \n)
      const tail = buffer.trim();
      if (!settled && tail) {
        console.log(`🔍 Checking tail buffer: ${tail.substring(0, 100)}`);
        try {
          const event: ExecutionEvent = JSON.parse(tail);
          console.log(`✅ Parsed tail event:`, event.type, event);
          if (!settled) onEvent(event);
          if (event.type === "done") {
            await safeResolve({ artifactId: event.artifactId });
            return;
          }
          if (event.type === "step_error" || event.type === "fatal") {
            await safeReject(new Error((event as any).error || "Website generation failed"));
            return;
          }
        } catch (e) {
          console.warn('❌ Failed to parse tail:', e);
        }
      }

      if (!settled) {
        console.error('❌ Stream ended without done/error event');
        await safeReject(new Error("Stream ended without completion"));
      }
    } catch (error) {
      // Если это AbortError (мы сами отменили) — пробрасываем как есть/как timeout
      await safeReject(error);
    }
  });
}

interface MarketWidgetState {
  quote: MarketQuote;
  chart: MarketChart;
  vs: string;
  range: "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
}

interface UseChatSendOptions {
  sessionId: number | null;
  selectedModel: string;
  internetEnabled: boolean;
  user?: User;
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onArtifactCreated?: (artifact: Artifact) => void;
  onArtifactUpdated?: (artifact: Artifact) => void;
  onMarketWidgetUpdate: (widget: MarketWidgetState | null) => void;
  onThinkingUpdate: (messages: string[]) => void;
  onPlanningUpdate: (plan: PlanStep[], currentStep: number, isPlanning: boolean) => void;
  onSearchProgress: (queries: string[]) => void;
  onTokenCost: (cost: TokenCost) => void;
  onBalanceUpdate?: () => void;
  onScrollToBottom: () => void;
}

interface UseChatSendReturn {
  isLoading: boolean;
  isSending: boolean;
  executionSteps: ExecutionStep[];
  isExecutingWebsite: boolean;
  abortController: AbortController | null;
  sendMessage: (messageText: string, messages: Message[]) => Promise<void>;
  abortCurrentRequest: () => void;
}

export const useChatSend = ({
  sessionId,
  selectedModel,
  internetEnabled,
  user,
  onMessageUpdate,
  onArtifactCreated,
  onArtifactUpdated,
  onMarketWidgetUpdate,
  onThinkingUpdate,
  onPlanningUpdate,
  onSearchProgress,
  onTokenCost,
  onBalanceUpdate,
  onScrollToBottom,
}: UseChatSendOptions): UseChatSendReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isExecutingWebsite, setIsExecutingWebsite] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);

  // Throttled message update for streaming
  const throttledMessageUpdate = useCallback(
    throttle((updater: (prev: Message[]) => Message[]) => {
      onMessageUpdate(updater);
    }, 50), // Update UI every 50ms max
    [onMessageUpdate]
  );

  // Throttled scroll to bottom
  const throttledScrollToBottom = useCallback(
    throttle(() => {
      onScrollToBottom();
    }, 100), // Scroll every 100ms max
    [onScrollToBottom]
  );

  const abortCurrentRequest = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('Aborting current request...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    isSendingRef.current = false;
  }, []);

  // Generate chat title using simple text truncation (production-ready)
  const generateChatTitle = useCallback(async (userMessage: string, sessionId: number) => {
    try {
      // Simple text truncation - production ready approach
      const newTitle = userMessage.length > 50
        ? userMessage.substring(0, 47) + "..."
        : userMessage;

      if (newTitle && newTitle.trim().length > 0) {
        await apiClient.updateSessionTitle(sessionId, newTitle.trim());
      }
    } catch (error) {
      console.error('Failed to update chat title:', error);
    }
  }, []);

  const detectMarketIntent = useCallback((text: string) =>
    /\b(курс|цена|котировк|биткоин|bitcoin|btc|график|chart)\b/i.test(text),
  []);

  const sendMessage = useCallback(async (messageText: string, currentMessages: Message[]) => {
    console.log('🚀 sendMessage called with:', messageText, 'sessionId:', sessionId);

    // Сбрасываем market widget по умолчанию
    onMarketWidgetUpdate(null);

    // Определяем sessionId для использования (избегаем race condition)
    let sessionIdToUse = sessionId;

    // Если сессия не существует, создаем новую
    if (!sessionIdToUse) {
      try {
        console.log('No session found, creating new session...');
        const title = messageText.length > 50 ? messageText.substring(0, 47) + "..." : messageText;
        const { sessionId: newSessionId } = await apiClient.createSession(title);
        console.log('New session created with ID:', newSessionId);
        sessionIdToUse = newSessionId;
        // Note: sessionId update should be handled by parent component
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }

    if (!messageText.trim() || isLoading || isSendingRef.current) {
      console.log('🚫 sendMessage blocked:', {
        hasText: !!messageText.trim(),
        textLength: messageText.length,
        isLoading,
        isSending: isSendingRef.current,
        sessionIdToUse,
        abortControllerExists: !!abortControllerRef.current
      });
      return;
    }

    // Устанавливаем флаг отправки
    isSendingRef.current = true;

    const userMessage: Message = { role: "user", content: messageText, timestamp: Date.now() };

    // Ограничиваем контекст до последних 20 сообщений
    const MAX_CONTEXT_MESSAGES = 20;
    const recentMessages = currentMessages.length > MAX_CONTEXT_MESSAGES
      ? currentMessages.slice(-MAX_CONTEXT_MESSAGES)
      : currentMessages;

    // Ограничиваем размер каждого сообщения
    const MAX_MESSAGE_SIZE = 50 * 1024; // 50KB
    const truncateMessage = (content: string) => {
      if (content.length > MAX_MESSAGE_SIZE) {
        console.warn(`Message too large (${content.length} chars), truncating to ${MAX_MESSAGE_SIZE} chars`);
        return content.substring(0, MAX_MESSAGE_SIZE) + '\n\n[Сообщение сокращено из-за превышения лимита размера]';
      }
      return content;
    };

    userMessage.content = truncateMessage(userMessage.content);
    const processedMessages = recentMessages.map(msg => ({
      ...msg,
      content: truncateMessage(msg.content)
    }));

    const allMessages = [...processedMessages, userMessage] as any[];

    // Сохраняем только пользовательское сообщение в состоянии
    onMessageUpdate(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Принудительная прокрутка при начале ответа
    setTimeout(() => throttledScrollToBottom(), 100);

    // Хелпер на поиск последнего артефакта в текущем чате
    const getLastArtifactId = (msgs: Message[]) => {
      for (let i = msgs.length - 1; i >= 0; i--) {
        const a = (msgs[i] as any)?.artifactId;
        if (a) return Number(a);
      }
      return null;
    };

    try {
      // Проверяем, хочет ли пользователь создать сайт
      const isWebsiteRequest = detectWebsiteIntent(messageText);
      console.log('🔍 Website intent detection:', { messageText, isWebsiteRequest });

      if (isWebsiteRequest) {
        console.log('🎯 WEBSITE REQUEST DETECTED - will generate artifact');

        // ✅ state доступен и onEvent, и catch
        const execState = { done: false, artifactId: null as number | null };

        try {
          await apiClient.saveMessage(Number(sessionIdToUse), "user", messageText);

          console.log('🔧 Calling executeWebsiteStream...');
          setIsExecutingWebsite(true);
          setExecutionSteps([]);

          const { artifactId } = await executeWebsiteStream(
            messageText,
            sessionIdToUse,
            (event) => {
              // ваш текущий onEvent/update
              console.log('🎯 Execution event:', event);

              try {
                if (event?.type === "done" && typeof (event as any).artifactId === "number") {
                  execState.done = true;
                  execState.artifactId = (event as any).artifactId;
                }

                setExecutionSteps(prev => {
                  try {
                    const existingStep = prev.find(s => s.id === event.id);
                    if (existingStep) {
                      // Обновляем существующий шаг
                      return prev.map(s =>
                        s.id === event.id
                          ? {
                              ...s,
                              status: event.type === 'step_start' ? 'active' :
                                     event.type === 'step_done' ? 'completed' :
                                     event.type === 'step_error' ? 'error' : s.status,
                              error: event.type === 'step_error' ? event.error : s.error
                            }
                          : s
                      );
                    } else if (event.type === 'step_start') {
                      // Добавляем новый шаг
                      return [...prev, {
                        id: event.id,
                        label: event.label,
                        status: 'active' as const
                      }];
                    }
                    return prev;
                  } catch (setStateError) {
                    console.error('❌ Error in setExecutionSteps:', setStateError);
                    return prev; // Возвращаем предыдущее состояние при ошибке
                  }
                });
              } catch (onEventError) {
                console.error('❌ Error in onEvent handler:', onEventError);
                // Не прерываем стрим из-за ошибки в обработчике
              }
            }
          );

          console.log('✅ Website execution completed, artifactId:', artifactId);

          // Получаем созданный артефакт из БД
          const artifact = await apiClient.getArtifact(artifactId);

          // Создаем полноценный объект Artifact для немедленного отображения
          const createdArtifact: Artifact = {
            id: artifactId,
            sessionId: sessionIdToUse,
            type: 'website',
            title: artifact.title,
            files: artifact.files,
            deps: artifact.deps,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // Сообщаем наверх — пусть владелец состояния обновит Map
          try {
            onArtifactCreated?.(createdArtifact);
          } catch (e) {
            console.error("❌ onArtifactCreated handler failed:", e);
          }

          // Создаем сообщение ассистента с артефактом
          const assistantText = `Создал сайт "${artifact.title}" с ${Object.keys(artifact.files).length} файлами!`;
          const assistantMessage = {
            role: 'assistant' as const,
            content: assistantText,
            timestamp: Date.now(),
            artifactId: artifactId
          };

          onMessageUpdate(prev => [...prev, assistantMessage]);

          // Сохраняем сообщение ассистента с привязкой к артефакту
          console.log('🔍 Artifact saveMessage payload:', {
            sessionId: Number(sessionIdToUse),
            role: 'assistant',
            content: assistantText,
            contentLength: assistantText?.length,
            contentTrimmed: assistantText?.trim()?.length,
            artifactId
          });
          await apiClient.saveMessage(Number(sessionIdToUse), 'assistant', assistantText, artifactId);

          return;
        } catch (artifactError: any) {
          console.error("❌ Failed to generate artifact:", artifactError);

          // Специальная обработка 401 ошибки (сессия истекла)
          if (artifactError?.status === 401 || artifactError?.message?.includes('401')) {
            const authErrorMessage = "❌ Сессия истекла. Пожалуйста, войдите в систему заново.";
            onMessageUpdate(prev => [...prev, {
              role: "assistant",
              content: authErrorMessage,
              timestamp: Date.now()
            }]);
            return;
          }

          // ✅ DONE побеждает таймаут/ошибку
          if (execState.done && execState.artifactId) {
            const successMessage = `Сайт создан. Artifact ID: ${execState.artifactId}`;
            onMessageUpdate(prev => [...prev, { role: "assistant", content: successMessage, timestamp: Date.now() }]);
            await apiClient.saveMessage(Number(sessionIdToUse), "assistant", successMessage);
            return;
          }

          // (опционально) late check — если done не поймали, но артефакт создался
          try {
            const artifacts = await apiClient.getArtifactsBySession(Number(sessionIdToUse));
            const last = Array.isArray(artifacts) ? artifacts[artifacts.length - 1] : null;
            if (last?.id) {
              const successMessage = `Сайт создан. Artifact ID: ${last.id}`;
              onMessageUpdate(prev => [...prev, { role: "assistant", content: successMessage, timestamp: Date.now() }]);
              await apiClient.saveMessage(Number(sessionIdToUse), "assistant", successMessage);
              return;
            }
          } catch {}

          // ❌ только если реально не создалось
          const errorMessage = "Извините, не удалось создать веб-сайт. Попробуйте переформулировать запрос или попробуйте снова.";
          onMessageUpdate(prev => [...prev, { role: "assistant", content: errorMessage, timestamp: Date.now() }]);
          await apiClient.saveMessage(Number(sessionIdToUse), "assistant", errorMessage);
          return;
        } finally {
          // ✅ ГАРАНТИРОВАННО сбрасываем состояние загрузки, чтобы UI не зависал
          setIsExecutingWebsite(false);
        }
      }

      // Проверяем, является ли это редактированием существующего сайта
      const lastArtifactId = getLastArtifactId(currentMessages);
      const isWebsiteEdit = !isWebsiteRequest && Boolean(lastArtifactId);

      if (isWebsiteEdit && lastArtifactId) {
        console.log("🛠️ WEBSITE EDIT DETECTED", { lastArtifactId });

        try {
          const sid = Number(sessionIdToUse);

          // ✅ Сохраняем user-message в БД сразу
          await apiClient.saveMessage(sid, "user", messageText, lastArtifactId);

          // requestId для идемпотентности
          const editRequestId = crypto.randomUUID();

          // Вызываем endpoint редактирования
          const { artifact, assistantText } = await apiClient.editWebsiteArtifact(
            lastArtifactId,
            messageText,
            selectedModel,
            editRequestId
          );

          // Обновляем артефакт в UI
          const updatedArtifact: Artifact = {
            id: lastArtifactId,
            sessionId: sessionIdToUse,
            type: "website",
            title: artifact.title,
            files: artifact.files,
            deps: artifact.deps,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          // Сообщаем наверх об обновлении артефакта
          onArtifactUpdated?.(updatedArtifact);

          // Добавляем сообщение ассистента с artifactId
          const assistantMessage = {
            role: "assistant" as const,
            content: assistantText,
            timestamp: Date.now(),
            artifactId: lastArtifactId,
          };

          onMessageUpdate(prev => [...prev, assistantMessage]);

          // Сохраняем assistant-message в БД с artifactId
          await apiClient.saveMessage(sid, "assistant", assistantText, lastArtifactId);

          return;
        } catch (e) {
          console.error("❌ Website edit failed:", e);
          const errorMessage =
            "Извините, не удалось применить правки к сайту. Попробуйте переформулировать запрос или повторите попытку.";

          onMessageUpdate(prev => [
            ...prev,
            { role: "assistant", content: errorMessage, timestamp: Date.now() },
          ]);

          await apiClient.saveMessage(Number(sessionIdToUse), "assistant", errorMessage, lastArtifactId);
          return;
        }
      }

      // Очищаем промежуточные сообщения и состояния (кроме thinking messages - они очистятся после ответа)
      onPlanningUpdate([], -1, false);
      onSearchProgress([]);

      // Создаем новый AbortController для этого запроса
      const controller = new window.AbortController();
      abortControllerRef.current = controller;

      let assistantContent = "";
      let hasStartedAssistantMessage = false;

      // Включаем market widget если запрос касается рынка
      if (internetEnabled && detectMarketIntent(messageText)) {
        console.log('Market intent detected, loading market data...');
        try {
          const quote = await apiClient.get<MarketQuote>("/api/market/quote?vs=usd");
          const chart = await apiClient.get<MarketChart>("/api/market/chart?vs=usd&days=1");

          onMarketWidgetUpdate({
            quote,
            chart,
            vs: "usd",
            range: "1D"
          });
          console.log('Market widget data loaded successfully');
        } catch (error) {
          console.error('Failed to load market data:', error);
        }
      }

      // Генерируем requestId для защиты от двойных списаний
      const requestId = crypto.randomUUID();

      console.log('About to call sendChatMessage with messages:', allMessages.length, 'requestId:', requestId);
      const returnedAssistantText = await sendChatMessage(
        allMessages as import("@/lib/openai").Message[],
        (chunk: string) => {
          assistantContent += chunk;

          if (!hasStartedAssistantMessage) {
            throttledMessageUpdate((prev) => [
              ...prev,
              { role: "assistant", content: assistantContent, timestamp: Date.now() },
            ]);
            hasStartedAssistantMessage = true;
          } else {
            throttledMessageUpdate((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1].content = assistantContent;
              return newMessages;
            });
          }

          throttledScrollToBottom();
        },
        // Колбэк для генерации плана
        (plan: PlanStep[]) => {
          // Не показываем план сразу, только сохраняем его в состоянии
          onPlanningUpdate(plan, -1, true);
          if (plan.length > 0) {
            // Создаем подробное текстовое описание плана вместо JSON
            const planText = `📋 Сформирован план выполнения задачи (${plan.length} шагов):\n\n` +
              plan.map((step, idx) => {
                const stepNumber = idx + 1;
                let stepText = `${stepNumber}. ${step.step}\n`;
                if (step.description) {
                  stepText += `   ${step.description}`;
                }
                if (step.searchQueries && step.searchQueries.length > 0) {
                  const searchCount = step.searchQueries.length;
                  const highPriority = step.searchQueries.filter(sq => sq.priority === 'high').length;
                  const mediumPriority = step.searchQueries.filter(sq => sq.priority === 'medium').length;
                  stepText += `\n   🔍 Планируется ${searchCount} поисковых запросов (${highPriority} высокоприоритетных, ${mediumPriority} среднеприоритетных)`;
                }
                return stepText;
              }).join('\n\n');

            console.log('📋 Plan converted to text and sent to thinking messages');
            onThinkingUpdate([planText]);
          }
        },
        // Колбэк для начала выполнения этапа
        (stepIndex: number, step: PlanStep, plan: PlanStep[]) => {
          onPlanningUpdate(plan, stepIndex, false);
        },
        // Колбэк для прогресса поиска
        (queries: string[]) => {
          onSearchProgress(queries);
          if (queries.length > 0) {
            onThinkingUpdate(prev => {
              const newQueries = queries.filter(q => !prev.some(msg => msg.includes(`"${q}"`)));
              if (newQueries.length > 0) {
                return [
                  ...prev,
                  ...newQueries.map(q => `🔍 Поиск: "${q}"`)
                ];
              }
              return prev;
            });
          }
        },
        // internetEnabled (важный параметр - должен быть boolean!)
        internetEnabled,
        // Колбэк для стоимости токенов
        (cost: TokenCost) => {
          onTokenCost(cost);
        },
        controller.signal,
        sessionIdToUse,
        requestId,
        (text: string) => {
          onThinkingUpdate([text]);
        }
      );

      // ✅ финальный текст: сперва return value, затем накопленный стрим, затем пусто
      const finalAssistantText = String(returnedAssistantText ?? assistantContent ?? "").trim();

      // Сохраняем сообщение пользователя в базу данных
      console.log('Saving user message to database...');
      const sid = Number(sessionIdToUse);
      if (!Number.isFinite(sid) || sid <= 0) {
        throw new Error(`Invalid sessionIdToUse: ${sessionIdToUse}`);
      }
      await apiClient.saveMessage(sid, "user", messageText);

      // Если это первое сообщение пользователя в чате, генерируем заголовок
      if (currentMessages.length === 0 && sessionIdToUse) {
        await generateChatTitle(messageText, sessionIdToUse);
      }

      // ✅ сохраняем ассистента только если есть контент
      console.log('Saving assistant message to database...');
      console.log("assistant save payload:", {
        sessionIdToUse,
        sid,
        typeofReturned: typeof returnedAssistantText,
        returnedLen: typeof returnedAssistantText === "string" ? returnedAssistantText.length : null,
        assistantContentLen: assistantContent?.length ?? null,
        finalLen: finalAssistantText.length,
        finalAssistantText,
      });
      if (finalAssistantText.length > 0) {
        const saveResult = await apiClient.saveMessage(sid, "assistant", finalAssistantText);
        
        // Обновляем последнее сообщение ассистента, чтобы оно получило ID из БД
        if (saveResult?.messageId) {
          onMessageUpdate(prev => {
            const newMessages = [...prev];
            // Находим последнее сообщение ассистента и обновляем его ID
            for (let i = newMessages.length - 1; i >= 0; i--) {
              if (newMessages[i].role === 'assistant' && !newMessages[i].id) {
                newMessages[i] = { ...newMessages[i], id: saveResult.messageId };
                break;
              }
            }
            return newMessages;
          });
        }

        // ✅ Обновляем баланс после успешного ответа (списание средств на сервере)
        if (onBalanceUpdate) {
          console.log('🔄 Updating balance after successful response...');
          onBalanceUpdate();
        }

        // ✅ Очищаем состояния планирования и thinking messages после успешного ответа
        onThinkingUpdate([]);
        onPlanningUpdate([], -1, false);
        onSearchProgress([]);
      } else {
        console.warn("⚠️ Assistant reply is empty — skipping saveMessage(assistant)");
      }

    } catch (error: any) {
      console.error('Error in sendMessage:', error);

      // Обрабатываем прерывание запроса
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }

      // ✅ Фильтруем ReferenceError — не показываем в чате
      if (error.name === 'ReferenceError' || error.message?.includes("Can't find variable")) {
        console.error('ReferenceError suppressed in UI:', error);
        return;
      }

      // ✅ Специальная обработка нехватки средств (ошибка 402)
      if (error?.status === 402 || 
          error?.message?.includes('Insufficient funds') || 
          error?.message?.includes('insufficient_funds') || 
          error?.message?.includes('402') ||
          error?.message?.includes('Payment Required')) {
        console.log('💰 Insufficient funds detected, showing balance update message', { error });
        
        // Пытаемся получить информацию о балансе из деталей ошибки
        let balanceInfo = '';
        if (error?.details?.balance !== undefined) {
          balanceInfo = ` Текущий баланс: ${error.details.balance.toFixed(2)} ₽.`;
        }
        
        const balanceMessage = `💰 Недостаточно средств для отправки сообщения.${balanceInfo} Пожалуйста, пополните баланс в разделе "Кошелёк".`;
        
        onMessageUpdate(prev => [...prev, {
          role: 'assistant',
          content: balanceMessage,
          timestamp: Date.now()
        }]);

        // Обновляем баланс в UI
        if (onBalanceUpdate) {
          onBalanceUpdate();
        }

        // Сохраняем сообщение о нехватке средств
        if (sessionIdToUse) {
          const errorSid = Number(sessionIdToUse);
          try {
            await apiClient.saveMessage(errorSid, 'assistant', balanceMessage);
          } catch (saveError) {
            console.error('Failed to save balance message:', saveError);
          }
        }

        // ✅ Очищаем состояния планирования при ошибке
        onThinkingUpdate([]);
        onPlanningUpdate([], -1, false);
        onSearchProgress([]);
        return;
      }

      // Показываем ошибку пользователю
      const errorMessage = (error.message || 'Произошла ошибка при отправке сообщения').trim();
      const fullErrorMessage = `❌ ${errorMessage}`;
      onMessageUpdate(prev => [...prev, {
        role: 'assistant',
        content: fullErrorMessage,
        timestamp: Date.now()
      }]);

      // ✅ Очищаем состояния планирования при ошибке
      onThinkingUpdate([]);
      onPlanningUpdate([], -1, false);
      onSearchProgress([]);

      // Сохраняем сообщение об ошибке
      if (sessionIdToUse && fullErrorMessage.trim()) {
        const errorSid = Number(sessionIdToUse);
        console.log('🔍 Error saveMessage payload:', {
          sessionId: errorSid,
          role: 'assistant',
          content: fullErrorMessage,
          contentLength: fullErrorMessage?.length,
          contentTrimmed: fullErrorMessage?.trim()?.length
        });
        try {
          await apiClient.saveMessage(errorSid, 'assistant', fullErrorMessage);
        } catch (saveError) {
          console.error('Failed to save error message:', saveError);
        }
      }
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [
    sessionId,
    selectedModel,
    internetEnabled,
    isLoading,
    onMessageUpdate,
    onArtifactCreated,
    onArtifactUpdated,
    onMarketWidgetUpdate,
    onThinkingUpdate,
    onPlanningUpdate,
    onSearchProgress,
    onTokenCost,
    throttledMessageUpdate,
    throttledScrollToBottom,
    generateChatTitle,
    detectMarketIntent,
  ]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      abortCurrentRequest();
    };
  }, [abortCurrentRequest]);

  return {
    isLoading,
    isSending: isSendingRef.current,
    executionSteps,
    isExecutingWebsite,
    abortController: abortControllerRef.current,
    sendMessage,
    abortCurrentRequest,
  };
};
