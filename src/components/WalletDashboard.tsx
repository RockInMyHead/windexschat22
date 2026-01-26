import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, CreditCard, TrendingUp, TrendingDown, History, DollarSign } from 'lucide-react';

interface User {
  id: number;
  username: string;
  email: string;
  balance: number;
  createdAt: number;
  updatedAt: number;
}

interface ApiUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
}

interface Transaction {
  id: number;
  type: 'deposit' | 'spend' | 'refund';
  amount: number;
  description: string;
  referenceId: string | null;
  createdAt: number;
}

interface WalletData {
  user: User;
  apiUsage: ApiUsage;
}

interface WalletDashboardProps {
  embedded?: boolean; // Флаг для встраивания в профиль
  userId?: number; // ID пользователя (если не передан, используется из контекста или демо)
}

export function WalletDashboard({ embedded = false, userId: propUserId }: WalletDashboardProps) {
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Используем переданный userId или получаем из UserService
  const userId = propUserId; // Убираем fallback, чтобы избежать несоответствия ID

  console.log('💰 WalletDashboard: Using userId:', userId, 'propUserId:', propUserId);

  // Функция форматирования суммы в рублях
  const formatAmount = (amount: number) => {
    return `${amount.toFixed(2)} ₽`;
  };

  useEffect(() => {
    if (userId) {
      loadWalletData();
    }
  }, [userId]);

  const loadWalletData = async () => {
    try {
      console.log('💰 WalletDashboard: Loading wallet data for userId:', userId);

      // Загружаем данные кошелька
      const [walletResponse, transactionsResponse] = await Promise.all([
        fetch(`/api/wallet/${userId}`),
        fetch(`/api/wallet/${userId}/transactions?limit=10`)
      ]);

      if (walletResponse.ok && transactionsResponse.ok) {
        const walletData = await walletResponse.json();
        const transactionsData = await transactionsResponse.json();

        setWalletData(walletData);
        setTransactions(transactionsData.transactions);

        console.log('✅ WalletDashboard: Wallet data loaded, balance:', walletData.user.balance);
      } else {
        console.error('Failed to load wallet data - user not found');
        // Попробуем создать пользователя через UserService
        if (propUserId) {
          console.log('Attempting to create user via UserService...');
          // Здесь можно вызвать UserService, но поскольку мы в компоненте,
          // лучше дать пользователю инструкцию или обработать в Profile.tsx
        }
      }
    } catch (error) {
      console.error('Failed to load wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    const amount = prompt('Введите сумму для пополнения (в долларах):');
    if (!amount || isNaN(Number(amount))) return;

    try {
      const response = await fetch(`/api/wallet/${userId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          description: 'Manual deposit'
        })
      });

      if (response.ok) {
        loadWalletData(); // Перезагрузить данные
        alert('Баланс успешно пополнен!');
      }
    } catch (error) {
      console.error('Deposit failed:', error);
      alert('Ошибка при пополнении баланса');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Пользователь не авторизован</p>
      </div>
    );
  }

  if (!walletData) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Не удалось загрузить данные кошелька</p>
        <Button onClick={loadWalletData} className="mt-4">
          Попробовать снова
        </Button>
      </div>
    );
  }

  const { user, apiUsage } = walletData;

  return (
    <div className={`${embedded ? 'space-y-4' : 'space-y-6 p-6'}`}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            Личный кабинет
          </h1>
          <Button onClick={handleDeposit} className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Пополнить баланс
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Кошелек
          </h2>
          <Button onClick={handleDeposit} size="sm" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Пополнить
          </Button>
        </div>
      )}

      {/* Основная информация */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Баланс</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(user.balance)}</div>
            <p className="text-xs text-muted-foreground">
              Доступно для использования
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего запросов</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiUsage.totalRequests}</div>
            <p className="text-xs text-muted-foreground">
              API запросов выполнено
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Потрачено токенов</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiUsage.totalTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Всего использовано
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Общая стоимость</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(apiUsage.totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              За все время
            </p>
          </CardContent>
        </Card>
      </div>


      {/* История транзакций */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            История транзакций
          </CardTitle>
          <CardDescription>
            Последние операции с балансом
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {transactions.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Транзакций пока нет</p>
            ) : (
              transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      transaction.type === 'spend' ? 'bg-red-100 text-red-600' :
                      'bg-blue-100 text-blue-600'
                    }`} style={transaction.type === 'deposit' ? { backgroundColor: '#1e983a1a', color: '#1e983a' } : {}}>
                      {transaction.type === 'deposit' ? <TrendingUp className="h-4 w-4" /> :
                       transaction.type === 'spend' ? <TrendingDown className="h-4 w-4" /> :
                       <DollarSign className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(transaction.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                  <Badge variant={transaction.amount > 0 ? "default" : "secondary"}>
                    {transaction.amount > 0 ? '+' : ''}{formatAmount(Math.abs(transaction.amount))}
                  </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Информация о пользователе */}
      <Card>
        <CardHeader>
          <CardTitle>Информация о пользователе</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Имя пользователя</label>
              <p className="text-lg">{user.username}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Email</label>
              <p className="text-lg">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Дата регистрации</label>
              <p className="text-lg">{new Date(user.createdAt).toLocaleDateString('ru-RU')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Последнее обновление</label>
              <p className="text-lg">{new Date(user.updatedAt).toLocaleDateString('ru-RU')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}