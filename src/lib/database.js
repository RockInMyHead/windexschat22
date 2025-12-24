import Database from 'better-sqlite3';
import path from 'path';

// Определяем интерфейсы для TypeScript
export const Message = {
  // Just for reference, actual validation happens in code
};

export const ChatSession = {
  // Just for reference, actual validation happens in code
};

// Путь к файлу базы данных
const DB_PATH = path.join(process.cwd(), 'windexs_chat.db');

// Инициализация базы данных
const db = new Database(DB_PATH);

// Включаем foreign keys
db.pragma('foreign_keys = ON');

// Создание таблиц
const createTables = () => {
  // Таблица чатов/сессий
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Таблица сообщений (без artifact_id сначала)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Таблица артефактов
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('website')),
      title TEXT NOT NULL,
      files_json TEXT NOT NULL,
      deps_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
    )
  `);

  // Таблица пользователей/кошельков
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      balance REAL NOT NULL DEFAULT 0.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Таблица транзакций
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('deposit', 'spend', 'refund')),
      amount REAL NOT NULL,
      description TEXT,
      reference_id TEXT, -- ID связанного запроса/API вызова
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Таблица использования API (для учета токенов)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id INTEGER,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0.0,
      request_type TEXT NOT NULL, -- 'chat', 'planning', 'website_generation', 'tts'
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE SET NULL
    )
  `);

  // Миграция: Добавляем колонку artifact_id в messages, если её нет
  const columns = db.prepare("PRAGMA table_info(messages)").all();
  const hasArtifactId = columns.some(col => col.name === 'artifact_id');

  if (!hasArtifactId) {
    console.log('Migrating database: adding artifact_id column to messages table');
    db.exec(`ALTER TABLE messages ADD COLUMN artifact_id INTEGER`);
  }

  // Миграция: Добавляем колонку user_id в messages, если её нет
  const hasUserId = columns.some(col => col.name === 'user_id');

  if (!hasUserId) {
    console.log('Migrating database: adding user_id column to messages table');
    db.exec(`ALTER TABLE messages ADD COLUMN user_id INTEGER REFERENCES users (id)`);
  }

  // Индексы для производительности
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_artifact_id ON messages (artifact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages (user_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts (session_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
    CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage (user_id);
    CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at);
  `);
};

// Инициализация таблиц при первом запуске
createTables();

// Подготовка запросов
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (session_id, user_id, role, content, timestamp, artifact_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getMessagesBySessionStmt = db.prepare(`
  SELECT id, role, content, timestamp, artifact_id
  FROM messages
  WHERE session_id = ?
  ORDER BY timestamp ASC
`);

const getAllSessionsStmt = db.prepare(`
  SELECT id, title, created_at, updated_at
  FROM chat_sessions
  WHERE user_id = ?
  ORDER BY updated_at DESC
`);

const insertSessionStmt = db.prepare(`
  INSERT INTO chat_sessions (user_id, title, created_at, updated_at)
  VALUES (?, ?, ?, ?)
`);

const updateSessionTimestampStmt = db.prepare(`
  UPDATE chat_sessions
  SET updated_at = ?
  WHERE id = ?
`);

const checkSessionOwnerStmt = db.prepare(`
  SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?
`);

const updateSessionTitleStmt = db.prepare(`
  UPDATE chat_sessions
  SET title = ?
  WHERE id = ?
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM chat_sessions WHERE id = ?
`);

// Артефакты
const insertArtifactStmt = db.prepare(`
  INSERT INTO artifacts (session_id, type, title, files_json, deps_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getArtifactByIdStmt = db.prepare(`
  SELECT id, session_id, type, title, files_json, deps_json, created_at, updated_at
  FROM artifacts
  WHERE id = ?
`);

const updateArtifactStmt = db.prepare(`
  UPDATE artifacts
  SET title = ?, files_json = ?, deps_json = ?, updated_at = ?
  WHERE id = ?
`);

const getArtifactsBySessionStmt = db.prepare(`
  SELECT id, session_id, type, title, files_json, deps_json, created_at, updated_at
  FROM artifacts
  WHERE session_id = ?
  ORDER BY created_at DESC
`);

// Пользователи и кошелек
const insertUserStmt = db.prepare(`
  INSERT OR IGNORE INTO users (username, email, balance, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const getUserByIdStmt = db.prepare(`
  SELECT id, username, email, balance, created_at, updated_at
  FROM users
  WHERE id = ?
`);

const getUserByEmailStmt = db.prepare(`
  SELECT id, username, email, balance, created_at, updated_at
  FROM users
  WHERE email = ?
`);

const updateUserBalanceStmt = db.prepare(`
  UPDATE users
  SET balance = balance + ?, updated_at = ?
  WHERE id = ?
`);

// Транзакции
const insertTransactionStmt = db.prepare(`
  INSERT INTO transactions (user_id, type, amount, description, reference_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getTransactionsByUserStmt = db.prepare(`
  SELECT id, user_id, type, amount, description, reference_id, created_at
  FROM transactions
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

// API использование
const insertApiUsageStmt = db.prepare(`
  INSERT INTO api_usage (user_id, session_id, model, input_tokens, output_tokens, total_tokens, cost, request_type, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getApiUsageByUserStmt = db.prepare(`
  SELECT id, user_id, session_id, model, input_tokens, output_tokens, total_tokens, cost, request_type, created_at
  FROM api_usage
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const getTotalApiUsageByUserStmt = db.prepare(`
  SELECT
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(cost) as total_cost,
    COUNT(*) as total_requests
  FROM api_usage
  WHERE user_id = ?
`);

// Сервис для работы с базой данных
export class DatabaseService {
  // Создание новой сессии чата
  static createSession(title, userId) {
    const now = Date.now();
    const result = insertSessionStmt.run(userId, title, now, now);
    return result.lastInsertRowid;
  }

  // Сохранение сообщения
  static saveMessage(sessionId, userId, role, content, artifactId = null) {
    const timestamp = Date.now();

    // Проверяем, что сессия принадлежит пользователю
    const ok = checkSessionOwnerStmt.get(sessionId, userId);
    if (!ok) {
      const err = new Error("Session not found");
      err.code = "SESSION_NOT_FOUND";
      throw err;
    }

    const result = insertMessageStmt.run(sessionId, userId, role, content, timestamp, artifactId);

    // Обновляем timestamp сессии
    updateSessionTimestampStmt.run(timestamp, sessionId);

    return result.lastInsertRowid;
  }

  // Загрузка сообщений сессии
  static loadMessages(sessionId) {
    const rows = getMessagesBySessionStmt.all(sessionId);
    return rows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      artifactId: row.artifact_id
    }));
  }

  // Получение всех сессий
  static getAllSessions(userId) {
    const rows = getAllSessionsStmt.all(userId);
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  // Обновление заголовка сессии
  static updateSessionTitle(sessionId, title) {
    updateSessionTitleStmt.run(title, sessionId);
  }

  // Удаление сессии
  static deleteSession(sessionId) {
    deleteSessionStmt.run(sessionId);
  }

  // Создание артефакта
  static createArtifact(sessionId, type, title, files, deps = null) {
    const now = Date.now();
    const filesJson = JSON.stringify(files);
    const depsJson = deps ? JSON.stringify(deps) : null;
    const result = insertArtifactStmt.run(sessionId, type, title, filesJson, depsJson, now, now);
    return result.lastInsertRowid;
  }

  // Получение артефакта по ID
  static getArtifact(artifactId) {
    const row = getArtifactByIdStmt.get(artifactId);
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      title: row.title,
      files: JSON.parse(row.files_json),
      deps: row.deps_json ? JSON.parse(row.deps_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Обновление артефакта
  static updateArtifact(artifactId, title, files, deps = null) {
    const now = Date.now();
    const filesJson = JSON.stringify(files);
    const depsJson = deps ? JSON.stringify(deps) : null;
    updateArtifactStmt.run(title, filesJson, depsJson, now, artifactId);
  }

  // Получение всех артефактов сессии
  static getArtifactsBySession(sessionId) {
    const rows = getArtifactsBySessionStmt.all(sessionId);
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      title: row.title,
      files: JSON.parse(row.files_json),
      deps: row.deps_json ? JSON.parse(row.deps_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // Работа с пользователями и кошельком
  static createUser(username, email, initialBalance = 0.0) {
    try {
    const now = Date.now();
    const result = insertUserStmt.run(username, email, initialBalance, now, now);
      console.log('🗄️ createUser result:', { changes: result.changes, lastInsertRowid: result.lastInsertRowid });
    return result.lastInsertRowid;
    } catch (error) {
      console.error('❌ createUser error:', error);
      return 0;
    }
  }

  static getUserById(userId) {
    const row = getUserByIdStmt.get(userId);
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      balance: row.balance,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static getUserByEmail(email) {
    const row = getUserByEmailStmt.get(email);
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      balance: row.balance,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static updateUserBalance(userId, amount) {
    const now = Date.now();
    updateUserBalanceStmt.run(amount, now, userId);
  }

  // Работа с транзакциями
  static createTransaction(userId, type, amount, description = '', referenceId = null) {
    const now = Date.now();
    const result = insertTransactionStmt.run(userId, type, amount, description, referenceId, now);
    return result.lastInsertRowid;
  }

  static getTransactionsByUser(userId, limit = 50) {
    const rows = getTransactionsByUserStmt.all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      amount: row.amount,
      description: row.description,
      referenceId: row.reference_id,
      createdAt: row.created_at
    }));
  }

  // Работа с API использованием
  static recordApiUsage(userId, sessionId, model, inputTokens, outputTokens, cost, requestType) {
    const now = Date.now();
    const totalTokens = inputTokens + outputTokens;
    const result = insertApiUsageStmt.run(userId, sessionId, model, inputTokens, outputTokens, totalTokens, cost, requestType, now);
    return result.lastInsertRowid;
  }

  static getApiUsageByUser(userId, limit = 100) {
    const rows = getApiUsageByUserStmt.all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      cost: row.cost,
      requestType: row.request_type,
      createdAt: row.created_at
    }));
  }

  static getTotalApiUsageByUser(userId) {
    const row = getTotalApiUsageByUserStmt.get(userId);
    return {
      totalInputTokens: row.total_input_tokens || 0,
      totalOutputTokens: row.total_output_tokens || 0,
      totalTokens: row.total_tokens || 0,
      totalCost: row.total_cost || 0,
      totalRequests: row.total_requests || 0
    };
  }

  // Закрытие соединения с БД (для cleanup)
  static close() {
    db.close();
  }
}

// Экспортируем экземпляр базы данных для прямого доступа при необходимости
export { db };
