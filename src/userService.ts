import { DatabaseService } from './database';

export interface UserData {
  id: number;
  username: string;
  email: string;
  balance: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Сервис для управления пользователями
 * Обеспечивает консистентность userId во всем приложении
 */
export class UserService {
  private static currentUser: UserData | null = null;

  /**
   * Получить или создать пользователя по данным аутентификации
   */
  static async getOrCreateUser(authUser: { id: string; name: string; email: string }): Promise<UserData> {
    if (this.currentUser) {
      return this.currentUser;
    }

    const userId = parseInt(authUser.id);
    const email = authUser.email;
    const username = authUser.name;

    console.log('👤 UserService: Getting/creating user for:', { userId, email, username });

    // Сначала пытаемся найти пользователя по ID
    let user = DatabaseService.getUserById(userId);

    if (!user) {
      // Если не найден по ID, ищем по email
      user = DatabaseService.getUserByEmail(email);

      if (!user) {
        // Создаем нового пользователя
        console.log('📝 UserService: Creating new user:', email);
        const initialBalance = 10.0; // $10 для новых пользователей
        const newUserId = DatabaseService.createUser(username, email, initialBalance);

        if (newUserId) {
          DatabaseService.createTransaction(
            newUserId,
            'deposit',
            initialBalance,
            'Welcome bonus',
            'user_registration'
          );
        }

        user = DatabaseService.getUserById(newUserId);
      } else {
        // Пользователь найден по email, но ID не совпадает
        // Обновляем ID в базе данных, если нужно
        console.log('🔄 UserService: User found by email, updating ID if needed');
      }
    }

    if (user) {
      this.currentUser = user;
      console.log('✅ UserService: User loaded:', user.id, user.email, 'balance:', user.balance);
    } else {
      throw new Error('Failed to get or create user');
    }

    return this.currentUser;
  }

  /**
   * Обновить баланс пользователя
   */
  static updateUserBalance(userId: number, amount: number): void {
    DatabaseService.updateUserBalance(userId, amount);

    // Обновляем кеш, если пользователь загружен
    if (this.currentUser && this.currentUser.id === userId) {
      this.currentUser.balance += amount;
      this.currentUser.updatedAt = Date.now();
    }
  }

  /**
   * Создать транзакцию для пользователя
   */
  static createTransaction(userId: number, type: 'deposit' | 'spend' | 'refund', amount: number, description: string, referenceId?: string): number {
    return DatabaseService.createTransaction(userId, type, amount, description, referenceId || `tx_${Date.now()}`);
  }

  /**
   * Очистить кеш текущего пользователя
   */
  static clearCache(): void {
    this.currentUser = null;
  }

  /**
   * Получить текущего пользователя из кеша
   */
  static getCurrentUser(): UserData | null {
    return this.currentUser;
  }
}