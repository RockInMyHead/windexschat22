import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { type TokenCost } from '@/lib/openai';

interface User {
  id: number;
  username: string;
  email: string;
}

interface UseBalanceOptions {
  user?: User;
  onTokenCost?: (cost: TokenCost) => void;
}

interface UseBalanceReturn {
  balance: number | null;
  isLoading: boolean;
  refreshBalance: () => Promise<void>;
  deductTokens: (cost: TokenCost) => Promise<boolean>;
}

export const useBalance = ({ user, onTokenCost }: UseBalanceOptions = {}): UseBalanceReturn => {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadBalance = useCallback(async (userObj: User) => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<{ balance: number }>(`/users/${userObj.id}/balance`);
      setBalance(response.balance);
    } catch (error) {
      console.error('Failed to load balance:', error);
      // Для демо устанавливаем баланс 100 USD
      setBalance(100);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (user) {
      await loadBalance(user);
    } else {
      // Для демо устанавливаем баланс без API запроса
      setBalance(100);
    }
  }, [user, loadBalance]);

  const deductTokens = useCallback(async (cost: TokenCost): Promise<boolean> => {
    if (!user) return false;

    try {
      const response = await apiClient.post<{ success: boolean; newBalance: number }>(
        `/users/${user.id}/deduct-tokens`,
        cost
      );

      if (response.success) {
        setBalance(response.newBalance);
        if (onTokenCost) {
          onTokenCost(cost);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to deduct tokens:', error);
      return false;
    }
  }, [user, onTokenCost]);

  // Загружаем баланс при изменении пользователя
  useEffect(() => {
    if (user) {
      loadBalance(user);
    } else {
      // Для демо устанавливаем баланс без API запроса
      setBalance(100);
    }
  }, [user, loadBalance]);

  return {
    balance,
    isLoading,
    refreshBalance,
    deductTokens,
  };
};
