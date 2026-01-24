import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface UseChatSessionOptions {
  initialMessage?: string;
}

interface UseChatSessionReturn {
  sessionId: number | null;
  isLoading: boolean;
  createSession: (title: string) => Promise<{ sessionId: number }>;
  loadSession: (sessionId: number) => Promise<void>;
  resetSession: () => void;
}

export const useChatSession = ({ initialMessage }: UseChatSessionOptions = {}): UseChatSessionReturn => {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const createSession = async (title: string): Promise<{ sessionId: number }> => {
    setIsLoading(true);
    try {
      const result = await apiClient.createSession(title);
      setSessionId(result.sessionId);
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const loadSession = async (sessionId: number): Promise<void> => {
    setIsLoading(true);
    try {
      setSessionId(sessionId);
      // Дополнительная логика загрузки сессии может быть здесь
    } finally {
      setIsLoading(false);
    }
  };

  const resetSession = (): void => {
    setSessionId(null);
    setIsLoading(false);
  };

  // Инициализация сессии при наличии initialMessage
  useEffect(() => {
    if (initialMessage && !sessionId) {
      const title = initialMessage.length > 50 ? initialMessage.substring(0, 47) + "..." : initialMessage;
      createSession(title);
    }
  }, [initialMessage]);

  return {
    sessionId,
    isLoading,
    createSession,
    loadSession,
    resetSession,
  };
};
