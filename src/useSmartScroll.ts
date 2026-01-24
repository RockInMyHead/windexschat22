import { useRef, useEffect, useCallback } from 'react';

interface UseSmartScrollOptions {
  threshold?: number; // Расстояние от низа для авто-прокрутки (в пикселях)
  scrollDelay?: number; // Задержка перед прокруткой (мс)
  userScrollTimeout?: number; // Время после которого сбрасывается флаг пользовательской прокрутки (мс)
}

interface UseSmartScrollReturn {
  messagesEndRef: React.RefObject<HTMLDivElement>;
  scrollToBottom: (force?: boolean) => void;
  isUserScrolling: boolean;
}

export const useSmartScroll = ({
  threshold = 100,
  scrollDelay = 10,
  userScrollTimeout = 2000
}: UseSmartScrollOptions = {}): UseSmartScrollReturn => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback((force = false) => {
    if (!messagesEndRef.current) return;

    const container = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]');
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container as HTMLElement;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;

    // Прокручиваем только если пользователь у низа или принудительно
    if (force || (isNearBottom && !isUserScrollingRef.current)) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, scrollDelay);
    }
  }, [threshold, scrollDelay]);

  // Отслеживаем пользовательскую прокрутку
  useEffect(() => {
    const container = messagesEndRef.current?.closest('[data-radix-scroll-area-viewport]');
    if (!container) return;

    const handleScroll = () => {
      isUserScrollingRef.current = true;

      // Сбрасываем флаг пользовательской прокрутки через заданное время
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, userScrollTimeout);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [userScrollTimeout]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    messagesEndRef,
    scrollToBottom,
    isUserScrolling: isUserScrollingRef.current,
  };
};
