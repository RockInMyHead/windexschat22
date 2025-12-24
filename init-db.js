import { DatabaseService, initDatabase } from './src/lib/database.js';

console.log('🗄️  Initializing database...');

// Инициализируем таблицы
initDatabase();

// Проверяем, существует ли тестовый пользователь
let testUser = DatabaseService.getUserByEmail('test@example.com');
let testUserId;

if (testUser) {
  console.log(`✅ Test user already exists with ID: ${testUser.id}`);
  testUserId = testUser.id;
} else {
  // Создаем тестового пользователя
  testUserId = DatabaseService.createUser('Test User', 'test@example.com', 100.0);
  if (testUserId > 0) {
    console.log(`✅ Created test user with ID: ${testUserId}`);
  } else {
    console.error('❌ Failed to create test user');
    process.exit(1);
  }
}

// Создаем тестовую сессию для проверки
const sessionId = DatabaseService.createSession('Test Session', testUserId);
console.log(`✅ Created test session with ID: ${sessionId}`);

// Сохраняем тестовые сообщения
const msg1Id = DatabaseService.saveMessage(sessionId, testUserId, 'user', 'Hello, AI!');
const msg2Id = DatabaseService.saveMessage(sessionId, testUserId, 'assistant', 'Hello! How can I help you today?');

console.log(`✅ Saved test messages: ${msg1Id}, ${msg2Id}`);

// Загружаем сообщения
const messages = DatabaseService.loadMessages(sessionId);
console.log(`✅ Loaded ${messages.length} messages from session ${sessionId}`);

// Проверяем сессии пользователя
const sessions = DatabaseService.getAllSessions(testUserId);
console.log(`✅ Loaded ${sessions.length} sessions for user ${testUserId}`);

console.log('🎉 Database initialized successfully!');
DatabaseService.close();
