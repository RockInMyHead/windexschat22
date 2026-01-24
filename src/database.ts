import Database from 'better-sqlite3';
import path from 'path';

// Определяем интерфейсы для TypeScript
export interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id?: number;
  title: string;
  created_at: number;
  updated_at: number;
}

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
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Таблица сообщений
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
    )
  `);

  // Индексы для производительности
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp);
  `);
};

// Подготовка запросов
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (session_id, role, content, timestamp)
  VALUES (?, ?, ?, ?)
`);

const getMessagesBySessionStmt = db.prepare(`
  SELECT id, role, content, timestamp
  FROM messages
  WHERE session_id = ?
  ORDER BY timestamp ASC
`);

const getAllSessionsStmt = db.prepare(`
  SELECT id, title, created_at, updated_at
  FROM chat_sessions
  ORDER BY updated_at DESC
`);

const insertSessionStmt = db.prepare(`
  INSERT INTO chat_sessions (title, created_at, updated_at)
  VALUES (?, ?, ?)
`);

const updateSessionTimestampStmt = db.prepare(`
  UPDATE chat_sessions
  SET updated_at = ?
  WHERE id = ?
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM chat_sessions WHERE id = ?
`);

const deleteMessageStmt = db.prepare(`
  DELETE FROM messages WHERE id = ?
`);

// Инициализация таблиц при первом запуске
createTables();

// Сервис для работы с базой данных
export class DatabaseService {
  // Создание новой сессии чата
  static createSession(title: string): number {
    const now = Date.now();
    const result = insertSessionStmt.run(title, now, now);
    return result.lastInsertRowid as number;
  }

  // Сохранение сообщения
  static saveMessage(sessionId: number, role: 'user' | 'assistant', content: string): number {
    const timestamp = Date.now();
    const result = insertMessageStmt.run(sessionId, role, content, timestamp);

    // Обновляем timestamp сессии
    updateSessionTimestampStmt.run(timestamp, sessionId);

    return result.lastInsertRowid as number;
  }

  // Загрузка сообщений сессии
  static loadMessages(sessionId: number): Message[] {
    const rows = getMessagesBySessionStmt.all(sessionId) as any[];
    return rows.map(row => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: row.timestamp
    }));
  }

  // Получение всех сессий
  static getAllSessions(): ChatSession[] {
    const rows = getAllSessionsStmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  // Удаление сессии
  static deleteSession(sessionId: number): void {
    deleteSessionStmt.run(sessionId);
  }

  // Удаление сообщения
  static deleteMessage(messageId: number): void {
    deleteMessageStmt.run(messageId);
  }

  // Закрытие соединения с БД (для cleanup)
  static close(): void {
    db.close();
  }
}

// Экспортируем экземпляр базы данных для прямого доступа при необходимости
export { db };
