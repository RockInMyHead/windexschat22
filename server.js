import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ProxyAgent } from 'undici';
import { DatabaseService } from './src/lib/database.js';
import { marketRouter } from './src/routes/market.js';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import JSON5 from 'json5';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 1062;

// Локальная БД для prepared statements
const DB_PATH = path.join(process.cwd(), 'windexs_chat.db');
const db = new Database(DB_PATH);
const checkSessionOwnerStmt = db.prepare(`
  SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?
`);

// Middleware для проверки аутентификации
function requireUser(req, res, next) {
  const userId = Number(req.header("x-user-id"));
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = { id: userId };
  next();
}

// Стоимость токенов за 1M токенов в долларах (DeepSeek models only)
const getTokenPrices = (model) => {
  // Фиксированная стоимость: 1 рубль за сообщение
  // Конвертируем в USD (курс 85 рублей за доллар)
  const fixedCostUSD = 1 / 85; // 1 рубль = 1/85 USD

  // Распределяем стоимость между input и output (примерно 30% на input, 70% на output)
  const prices = {
    'deepseek-chat': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 },
    'deepseek-reasoner': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 }
  };
  return prices[model] || prices['deepseek-chat'];
};

// Детектор market queries
const isMarketQuery = (query) => {
  if (!query || typeof query !== 'string') return false;
  const lowerQuery = query.toLowerCase();

  // Проверяем на упоминание биткойна в различных формах
  const hasBitcoin = lowerQuery.includes('биткойн') ||
                     lowerQuery.includes('биткоин') ||
                     lowerQuery.includes('bitcoin') ||
                     lowerQuery.includes('btc');

  // Проверяем на слова, указывающие на запрос цены/курса
  const hasPriceQuery = lowerQuery.includes('курс') ||
                       lowerQuery.includes('цена') ||
                       lowerQuery.includes('стоимость') ||
                       lowerQuery.includes('стоит') ||
                       lowerQuery.includes('сколько') ||
                       lowerQuery.includes('rate') ||
                       lowerQuery.includes('price') ||
                       lowerQuery.includes('cost');

  return hasBitcoin && hasPriceQuery;
};

// Получение market snapshot для сервера
const getMarketSnapshot = async () => {
  try {
    console.log('📊 Server: Fetching market snapshot...');
    const response = await fetch('http://localhost:1062/api/market/quote?vs=usd,eur,rub', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('⚠️ Server: Market snapshot fetch failed:', response.status);
      return '[MARKET_DATA_UNAVAILABLE]';
    }

    const data = await response.json();
    console.log('📊 Server: Market snapshot received');

    // Форматируем данные для AI
    const quote = data.quote;
    const asOf = new Date(data.asOf).toISOString();

    return `MARKET_SNAPSHOT (Source: ${data.provider}, AsOf: ${asOf}):
BTC/USD: ${quote.usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
BTC/EUR: ${quote.eur?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
BTC/RUB: ${quote.rub?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
24h Change: ${quote.usd_24h_change?.toFixed(2) || 'N/A'}%
Market Cap: ${quote.usd_market_cap ? '$' + (quote.usd_market_cap / 1e9).toFixed(2) + 'B' : 'N/A'}
24h Volume: ${quote.usd_24h_vol ? '$' + (quote.usd_24h_vol / 1e9).toFixed(2) + 'B' : 'N/A'}
Cached: ${data.cached}`;
  } catch (error) {
    console.error(`❌ Market Snapshot Error | Error: ${error.message || error} | Stack: ${error.stack?.substring(0, 200) || 'none'}...`);
    return '[MARKET_DATA_ERROR]';
  }
};

// Настройка прокси для Undici (встроенный fetch в Node.js)
const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = PROXY_URL ? new ProxyAgent({
  uri: PROXY_URL
}) : null;

// Middleware
app.use(cors({
  origin: [
    'https://ai.windexs.ru',
    'https://www.ai.windexs.ru',
    'http://ai.windexs.ru',
    'http://www.ai.windexs.ru',
    'https://ai.windexs.ru',
    'http://127.0.0.1:8081'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
// Увеличиваем лимит размера тела запроса до 10MB для больших контекстов
app.use(express.json({ limit: '10mb' }));

// Market API Routes
app.use('/api/market', marketRouter);

// API Routes

// Создать новую сессию чата
app.post('/api/sessions', requireUser, (req, res) => {
  try {
    const { title = 'Новый чат' } = req.body;
    console.log(`📝 POST /api/sessions | User: ${req.user.id} | Title: "${title}" | Origin: ${req.headers.origin || 'none'}`);
    const sessionId = DatabaseService.createSession(title, req.user.id);
    console.log(`✅ Session created | ID: ${sessionId} | User: ${req.user.id} | Title: "${title}"`);
    res.json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Получить все сессии
app.get('/api/sessions', requireUser, (req, res) => {
  try {
    const sessions = DatabaseService.getAllSessions(req.user.id);
    console.log(`📋 GET /api/sessions | User: ${req.user.id} | Origin: ${req.headers.origin || 'none'} | Returning ${sessions.length} session(s)`);
    res.json(sessions);
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Получить сообщения сессии
app.get('/api/sessions/:sessionId/messages', requireUser, (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionIdNum = parseInt(sessionId);

    console.log(`📨 GET /api/sessions/${sessionId}/messages | User: ${req.user.id} | Session: ${sessionIdNum}`);

    // Проверяем, что сессия принадлежит пользователю
    const ok = checkSessionOwnerStmt.get(sessionIdNum, req.user.id);
    console.log(`🔍 Session ownership check: ${ok ? 'OK' : 'FAILED'} for user ${req.user.id} session ${sessionIdNum}`);

    if (!ok) {
      return res.status(404).json({ error: "Session not found" });
    }

    const messages = DatabaseService.loadMessages(sessionIdNum);
    console.log(`✅ Loaded ${messages.length} messages`);
    res.json(messages);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Сохранить сообщение
app.post('/api/messages', requireUser, (req, res) => {
  try {
    const { sessionId, role, content, artifactId } = req.body;

    if (!sessionId || !role || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const messageId = DatabaseService.saveMessage(sessionId, req.user.id, role, content, artifactId || null);
    res.json({ messageId });
  } catch (error) {
    if (error?.code === "SESSION_NOT_FOUND") {
      return res.status(404).json({ error: "Session not found" });
    }
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Обновить заголовок сессии
app.patch('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    DatabaseService.updateSessionTitle(parseInt(sessionId), title);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session title:', error);
    res.status(500).json({ error: 'Failed to update session title' });
  }
});

// Удалить сессию
app.delete('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    DatabaseService.deleteSession(parseInt(sessionId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// === Wallet API ===

// Получить информацию о кошельке пользователя
app.get('/api/wallet/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const user = DatabaseService.getUserById(parseInt(userId));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Получаем статистику использования API
    const apiUsage = DatabaseService.getTotalApiUsageByUser(parseInt(userId));

    res.json({
      user: user,
      apiUsage: apiUsage
    });
  } catch (error) {
    console.error('Wallet API error:', error);
    res.status(500).json({ error: 'Failed to get wallet info' });
  }
});

// Получить транзакции пользователя
app.get('/api/wallet/:userId/transactions', (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const transactions = DatabaseService.getTransactionsByUser(parseInt(userId), limit);
    res.json({ transactions });
  } catch (error) {
    console.error('Transactions API error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Получить историю использования API
app.get('/api/wallet/:userId/api-usage', (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const apiUsage = DatabaseService.getApiUsageByUser(parseInt(userId), limit);
    res.json({ apiUsage });
  } catch (error) {
    console.error('API usage API error:', error);
    res.status(500).json({ error: 'Failed to get API usage' });
  }
});

// Пополнить баланс (демо эндпоинт)
app.post('/api/wallet/:userId/deposit', (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    DatabaseService.updateUserBalance(parseInt(userId), amount);
    DatabaseService.createTransaction(
      parseInt(userId),
      'deposit',
      amount,
      description || 'Balance deposit',
      `deposit_${Date.now()}`
    );

    const updatedUser = DatabaseService.getUserById(parseInt(userId));
    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Deposit API error:', error);
    res.status(500).json({ error: 'Failed to deposit funds' });
  }
});

// Получить/создать текущего пользователя
app.post('/api/users/current', (req, res) => {
  try {
    const { id, name, email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log('👤 Getting/creating user:', name, email);

    // Сначала пытаемся найти существующего пользователя по email
    let user = DatabaseService.getUserByEmail(email);

    if (user) {
      console.log('✅ Existing user found:', user.id, user.email);
    } else {
      // Создаем нового пользователя
      const initialBalance = 10.0; // $10 для новых пользователей
      const username = name || email;

      // Генерируем гарантированно уникальный email если нужно
      let uniqueEmail = email;
      let counter = 0;
      const baseEmail = email.split('@')[0];
      const domain = email.split('@')[1];

      while (DatabaseService.getUserByEmail(uniqueEmail)) {
        counter++;
        uniqueEmail = `${baseEmail}_${counter}@${domain}`;
      }

      const userId = DatabaseService.createUser(username, uniqueEmail, initialBalance);
      console.log('✅ New user created with ID:', userId, 'email:', uniqueEmail);

      if (!userId) {
        console.error('❌ Failed to create user - no ID returned');
        return res.status(500).json({ error: 'Failed to create user' });
    }

      user = DatabaseService.getUserById(userId);
    if (!user) {
        console.error('❌ Failed to retrieve created user');
        return res.status(500).json({ error: 'Failed to retrieve user' });
      }

      console.log('✅ New user retrieved:', user.id, user.email);
    }

    // Всегда возвращаем пользователя с оригинальным email (не unique)
    const responseUser = {
      ...user,
      email: email // оригинальный email
    };

    console.log('✅ User response prepared:', responseUser.id, responseUser.email);
    res.json(responseUser);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get current user' });
  }
});

// Создать демо пользователя (для тестирования)
app.post('/api/users/create-demo', (req, res) => {
  try {
    const { email = 'demo@example.com', username = 'Demo User' } = req.body;
    const initialBalance = 10.0; // $10 для тестирования

    // Проверяем, существует ли уже пользователь
    let user = DatabaseService.getUserByEmail(email);

    if (!user) {
      console.log('📝 Creating new demo user:', email);
      const userId = DatabaseService.createUser(username, email, initialBalance);

      if (userId) {
        DatabaseService.createTransaction(
          userId,
          'deposit',
          initialBalance,
          'Initial demo balance',
          'demo_setup'
        );
      }
      user = DatabaseService.getUserById(userId);
    } else {
      console.log('✅ Demo user already exists:', email);
    }

    res.json({ user });
  } catch (error) {
    console.error('Create demo user error:', error);
    res.status(500).json({ error: 'Failed to create demo user' });
  }
});

// === Artifacts API ===

// Генерировать артефакт через DeepSeek
app.post('/api/artifacts/generate', async (req, res) => {
  try {
    const { prompt, model = 'deepseek-chat' } = req.body;
    console.log(`🎨 Artifact Generation | Model: ${model} | Prompt length: ${prompt?.length || 0} chars | Prompt: "${prompt?.substring(0, 150) || 'none'}..."`);

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const hasKey = !!apiKey;
    console.log(`🔑 DeepSeek API Key Status | Configured: ${hasKey} | Key prefix: ${apiKey ? apiKey.substring(0, 7) + '...' : 'none'}`);
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const systemPrompt = `Создай простой сайт на React + TypeScript + Tailwind CSS.

Верни ТОЛЬКО JSON объект без markdown:

{
  "assistantText": "Описание сайта",
  "artifact": {
    "title": "Название",
    "files": {
      "/index.html": "<!DOCTYPE html><html><body><div id='root'></div></body></html>",
      "/src/main.tsx": "import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
      "/src/App.tsx": "код компонента App",
      "/src/index.css": "@tailwind base; @tailwind components; @tailwind utilities;"
    },
    "deps": {"react": "^18.2.0", "react-dom": "^18.2.0", "tailwindcss": "^3.4.0"}
  }
}`;

    const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      ...(proxyAgent && { dispatcher: proxyAgent }),
      body: JSON.stringify({
        model: model === 'lite' ? 'deepseek-chat' : model === 'pro' ? 'deepseek-reasoner' : model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000, // Ограничиваем длину ответа для стабильности
      }),
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error(`❌ DeepSeek API Error [Artifacts] | Status: ${deepseekResponse.status} ${deepseekResponse.statusText} | Model: ${model} | Error: ${errorText.substring(0, 500)}`);
      return res.status(deepseekResponse.status).json({
        error: 'DeepSeek API error',
        details: errorText
      });
    }

    const data = await deepseekResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'No content in DeepSeek response' });
    }

    // Парсим JSON из ответа (улучшенный парсинг для DeepSeek)
    let parsedData;
    try {
      console.log('🔄 Raw DeepSeek response:', content.substring(0, 200) + '...');

      // Пытаемся извлечь JSON из markdown блока, если есть
      let jsonString = content;

      // Удаляем markdown блоки
      if (content.includes('```json')) {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonString = jsonMatch[1];
        }
      } else if (content.includes('```')) {
        const jsonMatch = content.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonString = jsonMatch[1];
        }
      }

      // Если это не чистый JSON, пробуем найти начало и конец JSON объекта
      jsonString = jsonString.trim();

      // Находим начало JSON (первая {)
      const startIndex = jsonString.indexOf('{');
      if (startIndex !== -1) {
        jsonString = jsonString.substring(startIndex);

        // Пробуем найти конец JSON объекта, считая скобки с учетом экранирования
        let braceCount = 0;
        let endIndex = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonString.length; i++) {
          const char = jsonString[i];

          // Обработка экранирования в строках
          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          // Обработка кавычек строк
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          // Считаем скобки только вне строк
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIndex = i + 1;
                break;
              }
            }
          }
        }

        if (endIndex !== -1 && endIndex < jsonString.length) {
          console.log('✂️ Truncated JSON at position:', endIndex);
          jsonString = jsonString.substring(0, endIndex);
        }
      }

      console.log('🔧 Final JSON string length:', jsonString.length);

      // Улучшенный парсинг JSON с правильным учетом экранированных строк
      function extractValidJson(text) {
        let braceCount = 0;
        let startIndex = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];

          // Обработка экранирования - следующий символ экранирован
          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          // Начинаем экранирование
          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          // Обработка кавычек - переключаем режим строки
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          // Считаем скобки только вне строк
          if (!inString) {
            if (char === '{') {
              if (startIndex === -1) startIndex = i;
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                return text.substring(startIndex, i + 1);
              }
            }
          }
        }

        return null;
      }

      // Пытаемся парсить JSON с JSON5 (более мягкий парсер)
      try {
        // Стратегия 1: JSON5 парсинг (более permissive)
        parsedData = JSON5.parse(jsonString);
        console.log('✅ JSON5 parsed successfully (direct)');
      } catch (json5Error) {
        console.log('🔄 JSON5 parsing failed, trying extraction...');

        // Стратегия 2: Извлекаем JSON и пробуем JSON5
        const extractedJson = extractValidJson(jsonString);
        if (extractedJson) {
          console.log('🔍 Extracted JSON length:', extractedJson.length);
          try {
            parsedData = JSON5.parse(extractedJson);
            console.log('✅ JSON5 parsed successfully (extracted)');
          } catch (extractError) {
            console.log('🔄 JSON5 extraction failed, trying manual fixes...');

            // Стратегия 3: Ручное исправление проблем
            let fixedJson = extractedJson;

            // Исправляем распространенные проблемы:
            // 1. Убираем лишние экранирования в конце строк
            fixedJson = fixedJson.replace(/\\n"([^"]*)"([^"]*)"\\n/g, '\\n"$1$2"\\n');

            // 2. Исправляем неправильные экранированные кавычки
            fixedJson = fixedJson.replace(/([^\\])\\"/g, '$1"');

            // 3. Исправляем двойные кавычки в строках
            fixedJson = fixedJson.replace(/"([^"]*)"([^"]*)""/g, '"$1$2"');

            try {
              parsedData = JSON5.parse(fixedJson);
              console.log('✅ JSON5 parsed successfully (manual fixes)');
            } catch (fixError) {
              console.log('🔄 All JSON5 attempts failed, falling back...');
              throw fixError;
            }
          }
        } else {
          throw json5Error;
        }
      }

      console.log('🎯 Parsed JSON keys:', Object.keys(parsedData));

    } catch (parseError) {
      console.error(`❌ Artifact Parse Failed | Prompt: "${prompt?.substring(0, 100)}..." | Error: ${parseError.message} | Content length: ${content.length} chars`);
      console.error(`📄 Content Preview (first 800 chars): ${content.substring(0, 800)}`);

      // Emergency fallback - создаем простой сайт
      console.log('🚨 Creating emergency fallback website...');
      parsedData = {
        assistantText: "Извините, возникла ошибка при генерации сайта. Создан простой сайт-заглушка. Попробуйте снова с более простой формулировкой.",
        artifact: {
          title: "Простой сайт",
          files: {
            "/index.html": "<!DOCTYPE html><html><head><title>Мой сайт</title></head><body><h1>Привет!</h1><p>Это простой сайт</p></body></html>",
            "/src/main.tsx": "import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
            "/src/App.tsx": "import React from 'react'; export default function App() { return <div><h1>Привет мир!</h1><p>Это простой сайт</p></div>; }",
            "/src/index.css": "@tailwind base; @tailwind components; @tailwind utilities;"
          },
          deps: { "react": "^18.2.0", "react-dom": "^18.2.0", "tailwindcss": "^3.4.0" }
        }
      };
      console.log('✅ Emergency fallback website created');
    }

    // Валидация структуры
    if (!parsedData.artifact || !parsedData.artifact.files) {
      return res.status(500).json({ error: 'Invalid artifact structure' });
    }

    // Проверка обязательных файлов
    const requiredFiles = ['/index.html', '/src/App.tsx', '/src/main.tsx', '/src/index.css'];
    const missingFiles = requiredFiles.filter(file => !parsedData.artifact.files[file]);

    if (missingFiles.length > 0) {
      return res.status(500).json({
        error: 'Missing required files',
        missingFiles
      });
    }

    res.json(parsedData);

  } catch (error) {
    console.error(`❌ Artifact Generation Failed | Prompt: "${req.body?.prompt?.substring(0, 100) || 'none'}..." | Model: ${req.body?.model || 'deepseek-chat'} | Error: ${error.message || error} | Stack: ${error.stack?.substring(0, 200) || 'none'}...`);
    res.status(500).json({
      error: 'Failed to generate artifact',
      details: error.message
    });
  }
});

// Создать артефакт
app.post('/api/artifacts', (req, res) => {
  try {
    const { sessionId, type, title, files, deps } = req.body;

    if (!sessionId || !type || !title || !files) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Валидация типа
    if (type !== 'website') {
      return res.status(400).json({ error: 'Invalid artifact type. Only "website" is supported.' });
    }

    // Валидация файлов
    if (typeof files !== 'object' || Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'Files must be a non-empty object' });
    }

    // Проверка обязательных файлов
    const requiredFiles = ['/index.html', '/src/App.tsx', '/src/main.tsx', '/src/index.css'];
    const missingFiles = requiredFiles.filter(file => !files[file]);
    if (missingFiles.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required files', 
        missingFiles 
      });
    }

    // Проверка размера (максимум 400KB)
    const totalSize = Object.values(files).reduce((sum, content) => sum + content.length, 0);
    const maxSize = 400 * 1024; // 400KB
    if (totalSize > maxSize) {
      return res.status(400).json({ 
        error: 'Artifact too large', 
        maxSize: '400KB',
        actualSize: `${Math.round(totalSize / 1024)}KB`
      });
    }

    const artifactId = DatabaseService.createArtifact(
      parseInt(sessionId),
      type,
      title,
      files,
      deps || null
    );

    res.json({ artifactId });
  } catch (error) {
    console.error('Error creating artifact:', error);
    res.status(500).json({ error: 'Failed to create artifact' });
  }
});

// Получить артефакт по ID
app.get('/api/artifacts/:artifactId', (req, res) => {
  try {
    const { artifactId } = req.params;
    const artifact = DatabaseService.getArtifact(parseInt(artifactId));
    
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json(artifact);
  } catch (error) {
    console.error('Error getting artifact:', error);
    res.status(500).json({ error: 'Failed to get artifact' });
  }
});

// Обновить артефакт
app.put('/api/artifacts/:artifactId', (req, res) => {
  try {
    const { artifactId } = req.params;
    const { title, files, deps } = req.body;

    if (!title || !files) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Валидация файлов
    if (typeof files !== 'object' || Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'Files must be a non-empty object' });
    }

    // Проверка размера
    const totalSize = Object.values(files).reduce((sum, content) => sum + content.length, 0);
    const maxSize = 400 * 1024;
    if (totalSize > maxSize) {
      return res.status(400).json({ 
        error: 'Artifact too large', 
        maxSize: '400KB',
        actualSize: `${Math.round(totalSize / 1024)}KB`
      });
    }

    DatabaseService.updateArtifact(
      parseInt(artifactId),
      title,
      files,
      deps || null
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating artifact:', error);
    res.status(500).json({ error: 'Failed to update artifact' });
  }
});

// Получить все артефакты сессии
app.get('/api/sessions/:sessionId/artifacts', (req, res) => {
  try {
    const { sessionId } = req.params;
    const artifacts = DatabaseService.getArtifactsBySession(parseInt(sessionId));
    res.json(artifacts);
  } catch (error) {
    console.error('Error getting artifacts:', error);
    res.status(500).json({ error: 'Failed to get artifacts' });
  }
});

// Веб-поиск через backend (обход CORS ограничений)
app.get('/api/web-search', async (req, res) => {
  try {
    const { q: query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const encodedQuery = encodeURIComponent(query);
    const lowerQuery = query.toLowerCase();
    let searchResults = '';

    // 0. Поиск погоды (приоритетный запрос)
    const isWeatherQuery = lowerQuery.includes('погод') || lowerQuery.includes('weather') || 
        lowerQuery.includes('температур') || lowerQuery.includes('temperature') ||
        lowerQuery.includes('метеоролог') || lowerQuery.includes('метео');
    
    if (isWeatherQuery) {
      try {
        // Извлекаем название города из запроса
        // Паттерны: "погода в Москве", "погода Москва", "weather in Moscow"
        let city = 'Moscow'; // По умолчанию Москва
        let cityName = 'Москве'; // Для отображения
        
        // Улучшенное извлечение города
        const patterns = [
          /(?:погод|weather|температур|temperature).*?(?:в|in)\s+([А-Яа-яЁёA-Za-z\s-]+)/i,
          /(?:в|in)\s+([А-Яа-яЁёA-Za-z\s-]+)/i,
          /([А-Яа-яЁё][А-Яа-яЁё\s-]+?)(?:\s|$|,|\.|!|\?)/i
        ];
        
        for (const pattern of patterns) {
          const match = query.match(pattern);
          if (match && match[1]) {
            let extractedCity = match[1].trim();
            // Убираем лишние слова
            extractedCity = extractedCity.replace(/\s+(сегодня|сейчас|завтра|погода|weather|какая|какой)$/i, '').trim();
            
            if (extractedCity.length > 2) {
              cityName = extractedCity;
              
              // Транслитерация русских названий городов
              const cityMap = {
                'москва': 'Moscow',
                'москве': 'Moscow',
                'москвой': 'Moscow',
                'санкт-петербург': 'Saint Petersburg',
                'питер': 'Saint Petersburg',
                'новосибирск': 'Novosibirsk',
                'екатеринбург': 'Yekaterinburg',
                'казань': 'Kazan',
                'нижний новгород': 'Nizhny Novgorod',
                'челябинск': 'Chelyabinsk',
                'самара': 'Samara',
                'омск': 'Omsk',
                'ростов-на-дону': 'Rostov-on-Don',
                'уфа': 'Ufa',
                'красноярск': 'Krasnoyarsk',
                'воронеж': 'Voronezh',
                'пермь': 'Perm',
                'волгоград': 'Volgograd'
              };
              
              const cityLower = extractedCity.toLowerCase();
              if (cityMap[cityLower]) {
                city = cityMap[cityLower];
                break;
              } else if (/^[A-Za-z]/.test(extractedCity)) {
                // Если город на английском, используем как есть
                city = extractedCity;
                break;
              }
            }
          }
        }
        
        console.log('🌤️ Weather query detected, city:', city, 'cityName:', cityName);
        
        // Пробуем несколько источников погоды
        let weatherFound = false;
        
        // 1. Пробуем DuckDuckGo Instant Answer (более надежный)
        try {
          const duckResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(`weather ${city}`)}&format=json&no_redirect=1&no_html=1`, {
            ...(proxyAgent && { dispatcher: proxyAgent }),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; WindexsAI/1.0)',
              'Accept': 'application/json'
            }
          });
          
          if (duckResponse.ok) {
            const duckData = await duckResponse.json();
            if (duckData.Answer) {
              searchResults += `🌤️ Погода в ${city}:\n${duckData.Answer}\n\n`;
              weatherFound = true;
            }
            if (duckData.AbstractText && !weatherFound) {
              searchResults += `${duckData.AbstractText}\n\n`;
              weatherFound = true;
            }
          }
        } catch (duckError) {
          console.error('DuckDuckGo weather error:', duckError);
        }
        
        // 2. Если DuckDuckGo не дал результатов, пробуем wttr.in
        if (!weatherFound) {
          try {
            // Используем текстовый формат - он более надежный
            const wttrUrl = `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h+%p&lang=ru`;
            const weatherResponse = await fetch(wttrUrl, {
              ...(proxyAgent && { dispatcher: proxyAgent }),
              headers: {
                'User-Agent': 'curl/7.68.0'
              }
            });
            
            if (weatherResponse && weatherResponse.ok) {
              const weatherText = await weatherResponse.text();
              if (weatherText && !weatherText.includes('Sorry') && weatherText.trim().length > 0) {
                // Формат: "Погода Температура Ветер Влажность Давление"
                const parts = weatherText.trim().split(/\s+/);
                if (parts.length >= 2) {
                  searchResults += `🌤️ Погода в ${cityName}:\n\n`;
                  if (parts[0]) searchResults += `☁️ Условия: ${parts[0]}\n`;
                  if (parts[1]) searchResults += `🌡️ Температура: ${parts[1]}\n`;
                  if (parts[2]) searchResults += `💨 Ветер: ${parts[2]}\n`;
                  if (parts[3]) searchResults += `💧 Влажность: ${parts[3]}\n`;
                  if (parts[4]) searchResults += `🌡️ Давление: ${parts[4]}\n\n`;
                  weatherFound = true;
                }
              }
            }
          } catch (wttrError) {
            console.error('wttr.in weather error:', wttrError.message || wttrError);
          }
        }
        
        // Если ничего не найдено, возвращаем базовую информацию
        if (!searchResults || searchResults.trim() === '') {
          // Пробуем получить климатические данные из Wikipedia
          try {
            const wikiQuery = `Климат ${cityName}`;
            const wikiResponse = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiQuery)}`, {
              ...(proxyAgent && { dispatcher: proxyAgent })
            });
            if (wikiResponse.ok) {
              const wikiData = await wikiResponse.json();
              if (wikiData.extract && (wikiData.extract.includes('температур') || wikiData.extract.includes('климат'))) {
                searchResults = `Климатические данные о ${cityName}:\n${wikiData.extract.substring(0, 400)}...\n\n`;
                searchResults += `Для получения актуальной погоды рекомендую проверить специализированные погодные сервисы: Яндекс.Погода, Gismeteo или Weather.com.`;
              } else {
                searchResults = `Для получения актуальной погоды в ${cityName} рекомендую проверить специализированные погодные сервисы, такие как Яндекс.Погода, Gismeteo или Weather.com.`;
              }
            } else {
              searchResults = `Для получения актуальной погоды в ${cityName} рекомендую проверить специализированные погодные сервисы, такие как Яндекс.Погода, Gismeteo или Weather.com.`;
            }
          } catch (wikiError) {
            console.error('Wikipedia fallback error:', wikiError);
            searchResults = `Для получения актуальной погоды в ${cityName} рекомендую проверить специализированные погодные сервисы, такие как Яндекс.Погода, Gismeteo или Weather.com.`;
          }
        }
      } catch (weatherError) {
        console.error('Weather search error:', weatherError);
      }
    }

    // 1. Поиск курсов криптовалют (расширенная логика)
    // Нормализуем запрос для распознавания разных вариантов написания
    const normalizedQuery = lowerQuery.replace(/биткойн/gi, 'биткоин');
    const isCryptoQuery = normalizedQuery.includes('курс') || normalizedQuery.includes('цена') || normalizedQuery.includes('стоимость') ||
        normalizedQuery.includes('крипто') || normalizedQuery.includes('биткоин') || normalizedQuery.includes('ethereum') ||
        normalizedQuery.includes('bitcoin') || normalizedQuery.includes('микро') || /\b(mbc|btc|eth)\b/i.test(normalizedQuery);

    // Поиск курсов криптовалют
    if (isCryptoQuery) {
      try {

        // Известные криптовалюты
        let cryptoIds = [];
        if (normalizedQuery.includes('биткоин') || normalizedQuery.includes('bitcoin') || normalizedQuery.includes('btc') || lowerQuery.includes('btc')) cryptoIds.push('bitcoin');
        if (normalizedQuery.includes('ethereum') || normalizedQuery.includes('эфир') || normalizedQuery.includes('eth') || lowerQuery.includes('eth')) cryptoIds.push('ethereum');

        // Специальные случаи
        if (normalizedQuery.includes('микро') && normalizedQuery.includes('биткоин')) {
          cryptoIds.push('microbitcoin');
        }
        
        // Если запрос содержит "курс" и не указана конкретная криптовалюта, добавляем биткоин по умолчанию
        if (cryptoIds.length === 0 && (normalizedQuery.includes('курс') || normalizedQuery.includes('цена')) && (normalizedQuery.includes('крипто') || normalizedQuery.includes('криптовалют'))) {
          cryptoIds.push('bitcoin');
        }


        if (cryptoIds.length > 0) {
          const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd,rub,eur&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, {
            ...(proxyAgent && { dispatcher: proxyAgent }),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; WindexsAI/1.0)',
              'Accept': 'application/json'
            }
          });

          if (cryptoResponse.ok) {
            const cryptoData = await cryptoResponse.json();

            searchResults += `Курсы и данные криптовалют:\n\n`;

            for (const cryptoId of cryptoIds) {
              if (cryptoData[cryptoId]) {
                const data = cryptoData[cryptoId];
                const name = cryptoId.charAt(0).toUpperCase() + cryptoId.slice(1);
                searchResults += `${name}:\n`;
                searchResults += `💰 Цена: $${data.usd} / ₽${data.rub} / €${data.eur}\n`;

                if (data.usd_24h_change !== undefined) {
                  const change = data.usd_24h_change.toFixed(2);
                  const changeIcon = parseFloat(change) >= 0 ? '📈' : '📉';
                  searchResults += `${changeIcon} Изменение 24ч: ${change}%\n`;
                }

                if (data.usd_market_cap) {
                  searchResults += `📊 Капитализация: $${data.usd_market_cap.toLocaleString()}\n`;
                }

                if (data.usd_24h_vol) {
                  searchResults += `📊 Объем 24ч: $${data.usd_24h_vol.toLocaleString()}\n`;
                }

                searchResults += '\n';
              }
            }
          }
        }
      } catch (cryptoError) {
        console.error('Crypto API error:', cryptoError);
      }
    }

    // 2. Все остальные запросы идут через MCP сервер
    if (!searchResults) {
      try {
        console.log('🌐 All searches via MCP server for:', query);
        const mcpResponse = await fetch('https://ai.windexs.ru/api/mcp/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            max_results: 3 // Ограничиваем количество результатов для экономии места
          })
        });

        if (mcpResponse.ok) {
          const mcpData = await mcpResponse.json();
          console.log('🌐 MCP search successful, results:', mcpData.results ? mcpData.results.length : 0);

          if (mcpData.results && mcpData.results.length > 0) {
            // Ограничиваем длину каждого результата и общее количество
            const maxResultLength = 600; // Максимум 600 символов на результат
            const limitedResults = mcpData.results.slice(0, 3).map((result) => {
              const truncatedContent = result.content && result.content.length > maxResultLength
                ? result.content.substring(0, maxResultLength) + '...'
                : result.content;
              return `${result.title}\n${truncatedContent}`;
            });

            searchResults = limitedResults.join('\n\n');

            // Если есть summary/answer от MCP, добавляем его
            if (mcpData.answer && mcpData.answer.trim()) {
              searchResults = `${mcpData.answer}\n\nИсточники:\n${searchResults}`;
            }
          } else {
            searchResults = 'Информация не найдена.';
          }
        } else {
          const errorText = await mcpResponse.text();
          console.error('❌ MCP search failed:', mcpResponse.status, errorText);
          searchResults = 'Ошибка при поиске информации.';
        }
      } catch (mcpError) {
        console.error('MCP search error:', mcpError);
        searchResults = 'Ошибка подключения к поисковой системе.';
      }
    }

    // 3. Поиск в Wikipedia
    try {
      const wikiQuery = query.replace(/\s+/g, '_');

      // Сначала пробуем русский
      let wikiResponse = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`, {
        ...(proxyAgent && { dispatcher: proxyAgent })
      });
      if (!wikiResponse.ok) {
        // Если русский не найден, пробуем английский
        wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`, {
          ...(proxyAgent && { dispatcher: proxyAgent })
        });
      }

      if (wikiResponse.ok) {
        const wikiData = await wikiResponse.json();
        if (wikiData.extract) {
          searchResults += `Из Wikipedia: ${wikiData.extract}\n\n`;
          if (wikiData.description) {
            searchResults += `Описание: ${wikiData.description}\n\n`;
          }
        }
      }
    } catch (wikiError) {
      console.error('Wikipedia search error:', wikiError);
    }


    // Возвращаем результаты или сообщение об отсутствии результатов
    const finalResult = searchResults || '[NO_RESULTS_FOUND]';

    res.json({
      query,
      results: finalResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Web search API error:', error);
    res.status(500).json({
      error: 'Failed to perform web search',
      details: error.message
    });
  }
});

// MCP server proxy for web search - использует локальный поиск вместо внешнего API
app.post('/api/mcp/search', async (req, res) => {
  try {
    const { q: query, max_results = 3 } = req.body;
    console.log(`🔍 MCP search proxy request | Query: "${query}" | Max results: ${max_results}`);

    if (!query || typeof query !== 'string') {
      console.error('❌ MCP search error: Query parameter is required');
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Используем локальный веб-поиск вместо внешнего API
    const searchResults = await performWebSearch(query);
    console.log(`✅ MCP search completed | Query: "${query}" | Results length: ${searchResults.length} chars`);

    res.json({
      answer: searchResults,
      results: [] // Для совместимости с интерфейсом
    });

  } catch (error) {
    console.error(`❌ MCP proxy error | Query: "${req.body?.q || 'none'}" | Error: ${error.message || error}`);
    res.status(500).json({
      error: 'MCP search failed',
      details: error.message
    });
  }
});

// Локальная функция веб-поиска (упрощенная версия из основного endpoint)
async function performWebSearch(query) {
  const lowerQuery = query.toLowerCase();

  // Поиск криптовалют
  if (lowerQuery.includes('биткоин') || lowerQuery.includes('bitcoin') || lowerQuery.includes('btc')) {
    try {
      const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,rub,eur&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, {
        ...(proxyAgent && { dispatcher: proxyAgent }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WindexsAI/1.0)',
          'Accept': 'application/json'
        }
      });

      if (cryptoResponse.ok) {
        const cryptoData = await cryptoResponse.json();
        const data = cryptoData.bitcoin;
        if (data) {
          return `Bitcoin:\n💰 Цена: $${data.usd} / ₽${data.rub} / €${data.eur}\n📊 Капитализация: $${data.usd_market_cap?.toLocaleString()}\n📈 Изменение 24ч: ${data.usd_24h_change?.toFixed(2)}%`;
        }
      }
    } catch (cryptoError) {
      console.error('Crypto API error:', cryptoError);
    }
  }

  // Погода
  if (lowerQuery.includes('погод') || lowerQuery.includes('weather')) {
    try {
      const weatherResponse = await fetch(`https://wttr.in/Moscow?format=%C+%t+%w+%h+%p&lang=ru`, {
        ...(proxyAgent && { dispatcher: proxyAgent }),
        headers: {
          'User-Agent': 'curl/7.68.0'
        }
      });

      if (weatherResponse.ok) {
        const weatherText = await weatherResponse.text();
        return `Погода в Москве: ${weatherText}`;
      }
    } catch (weatherError) {
      console.error('Weather API error:', weatherError);
    }
  }

  // Поиск в Wikipedia
  try {
    const wikiQuery = query.replace(/\s+/g, '_');
    const wikiResponse = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`, {
      ...(proxyAgent && { dispatcher: proxyAgent })
    });

    if (wikiResponse.ok) {
      const wikiData = await wikiResponse.json();
      if (wikiData.extract) {
        return `Из Wikipedia: ${wikiData.extract.substring(0, 800)}...`;
      }
    }
  } catch (wikiError) {
    console.error('Wikipedia search error:', wikiError);
  }

  // DuckDuckGo Instant Answer
  try {
    const duckResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`, {
      ...(proxyAgent && { dispatcher: proxyAgent }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WindexsAI/1.0)',
        'Accept': 'application/json'
      }
    });

    if (duckResponse.ok) {
      const duckData = await duckResponse.json();
      if (duckData.Answer) {
        return duckData.Answer;
      }
      if (duckData.AbstractText) {
        return duckData.AbstractText;
      }
    }
  } catch (duckError) {
    console.error('DuckDuckGo search error:', duckError);
  }

  return 'Информация не найдена.';
}

// DeepSeek Chat API proxy (обход CORS ограничений)
app.post('/api/chat', async (req, res) => {
  try {
    const lastMessage = req.body?.messages?.[req.body.messages.length - 1];
    console.log(`🔥 API /chat | Requested: ${req.body?.model || 'lite'} | Stream: ${req.body?.stream || false} | User: ${req.body?.userId || 'none'} | Session: ${req.body?.sessionId || 'none'} | Messages: ${req.body?.messages?.length || 0} | Last message: "${lastMessage?.content?.substring(0, 100) || 'none'}..."`);
    const { messages, model = 'lite', stream = false, userId, sessionId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const actualUserId = userId || 1; // Fallback to demo user if no userId provided

    // Проверяем на market query и добавляем данные
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    let enhancedMessages = messages;

    if (lastUserMessage && isMarketQuery(lastUserMessage.content)) {
      console.log('📊 Server: Market query detected, adding market data to context');
      const marketSnapshot = await getMarketSnapshot();

      // Добавляем market данные в системное сообщение или создаем новое
      const systemMessageIndex = messages.findIndex(m => m.role === 'system');
      if (systemMessageIndex >= 0) {
        // Добавляем к существующему системному сообщению
        enhancedMessages = [...messages];
        enhancedMessages[systemMessageIndex].content += `\n\nАКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`;
      } else {
        // Создаем новое системное сообщение
        enhancedMessages = [
          {
            role: 'system',
            content: `Ты полезный AI-ассистент. Используй предоставленные актуальные данные по Bitcoin для ответа на вопросы пользователя.\n\nАКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`
          },
          ...messages
        ];
      }
    }

    // Получаем DeepSeek API ключ
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'DeepSeek API key not configured on server' });
    }

    // Для pro модели используем deepseek-reasoner, для остальных deepseek-chat
    const actualModel = (model === 'pro') ? 'deepseek-reasoner' : 'deepseek-chat';
    const priceInfo = getTokenPrices(actualModel);

    console.log(`🎯 Model Mapping | Requested: "${model}" → Actual: "${actualModel}" | Price: $${priceInfo.input}/1M in, $${priceInfo.output}/1M out | Stream: ${stream} | Messages: ${messages.length}`);

    // DeepSeek API
    const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      ...(proxyAgent && { dispatcher: proxyAgent }),
      body: JSON.stringify({
        model: actualModel,
        messages: enhancedMessages,
        stream: stream,
        temperature: 0.7,
      }),
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error(`❌ DeepSeek API Error [Artifacts] | Status: ${deepseekResponse.status} ${deepseekResponse.statusText} | Model: ${model} | Error: ${errorText.substring(0, 500)}`);
      return res.status(deepseekResponse.status).json({
        error: 'DeepSeek API error',
        details: errorText
      });
    }

    if (stream) {
      // Для потоковых ответов обрабатываем поток для получения информации о токенах
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = deepseekResponse.body.getReader();
      const decoder = new TextDecoder();
      let usageInfo = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          // Проверяем, содержит ли чанк информацию об использовании токенов
          if (chunk.includes('"usage"')) {
            try {
              // Парсим JSON для извлечения информации об использовании
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line.includes('"usage"')) {
                  const jsonStr = line.slice(6);
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.usage) {
                    usageInfo = parsed.usage;
                  }
                }
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }

          res.write(chunk);
        }

        // После завершения стрима добавляем информацию о токенах
        if (usageInfo) {
          const prices = getTokenPrices(actualModel);
          const inputTokens = usageInfo.prompt_tokens || 0;
          const outputTokens = usageInfo.completion_tokens || 0;
          const totalTokens = usageInfo.total_tokens || (inputTokens + outputTokens);

          const inputCost = (inputTokens / 1000000) * prices.input;
          const outputCost = (outputTokens / 1000000) * prices.output;
          const totalCost = inputCost + outputCost;

          const tokenCostData = {
            inputTokens,
            outputTokens,
            totalTokens,
            inputCost,
            outputCost,
            totalCost,
            model: actualModel
          };

          // Отправляем информацию о токенах в отдельном чанке
          const tokenChunk = `data: ${JSON.stringify({ tokenCost: tokenCostData })}\n\n`;
          res.write(tokenChunk);

          // Записываем использование API в базу данных
          try {
            console.log(`📊 API Usage [STREAM] | User: ${actualUserId} | Model: ${actualModel} | Session: ${sessionId || 'none'} | Tokens: ${inputTokens} in + ${outputTokens} out = ${totalTokens} total | Cost: $${totalCost.toFixed(6)} | Input: $${inputCost.toFixed(6)} | Output: $${outputCost.toFixed(6)}`);
            DatabaseService.recordApiUsage(
              actualUserId,
              sessionId || null,
              actualModel,
              inputTokens,
              outputTokens,
              totalCost,
              'chat'
            );

            // Списываем средства с баланса пользователя
            console.log("💳 Deduct attempt:", { actualUserId, totalCost, sessionId });
            DatabaseService.updateUserBalance(actualUserId, -totalCost);

            const userAfter = DatabaseService.getUserById(actualUserId);
            console.log("✅ Balance after deduct:", userAfter?.balance);
            
            // Создаем транзакцию
            const lastUserMsg = messages.filter(m => m.role === 'user').pop();
            const description = lastUserMsg 
              ? `Chat: ${lastUserMsg.content.substring(0, 50)}...`
              : 'Chat request';
              
            DatabaseService.createTransaction(
              actualUserId,
              'spend',
              -totalCost,
              description,
              `chat_${Date.now()}`
            );
          } catch (dbError) {
            console.error(`❌ DB Error [Stream Usage] | User: ${actualUserId} | Session: ${sessionId || 'none'} | Cost: $${totalCost.toFixed(6)} | Error: ${dbError.message || dbError}`);
          }
        }

      } finally {
        res.end();
      }
    } else {
      // Для обычных ответов возвращаем JSON
      const data = await deepseekResponse.json();

      // Добавляем расчет стоимости токенов
      if (data.usage) {
        const prices = getTokenPrices(actualModel);
        const inputTokens = data.usage.prompt_tokens || 0;
        const outputTokens = data.usage.completion_tokens || 0;
        const totalTokens = data.usage.total_tokens || (inputTokens + outputTokens);

        const inputCost = (inputTokens / 1000000) * prices.input;
        const outputCost = (outputTokens / 1000000) * prices.output;
        const totalCost = inputCost + outputCost;

        data.tokenCost = {
          inputTokens,
          outputTokens,
          totalTokens,
          inputCost,
          outputCost,
          totalCost,
          model: actualModel,
          currency: 'USD',
          provider: 'DeepSeek'
        };

        // Записываем использование API в базу данных
        try {
          console.log(`📊 API Usage [NON-STREAM] | User: ${actualUserId} | Model: ${actualModel} | Session: ${sessionId || 'none'} | Tokens: ${inputTokens} in + ${outputTokens} out = ${totalTokens} total | Cost: $${totalCost.toFixed(6)} | Input: $${inputCost.toFixed(6)} | Output: $${outputCost.toFixed(6)}`);
          DatabaseService.recordApiUsage(
            actualUserId,
            sessionId || null,
            actualModel,
            inputTokens,
            outputTokens,
            totalCost,
            'chat'
          );

          // Списываем средства с баланса пользователя
          DatabaseService.updateUserBalance(actualUserId, -totalCost);
          
          // Создаем транзакцию
          const lastUserMsg = messages.filter(m => m.role === 'user').pop();
          const description = lastUserMsg 
            ? `Chat: ${lastUserMsg.content.substring(0, 50)}...`
            : 'Chat request';
            
          DatabaseService.createTransaction(
            actualUserId,
            'spend',
            -totalCost,
            description,
            `chat_${Date.now()}`
          );
        } catch (dbError) {
          console.error(`❌ DB Error [Non-Stream Usage] | User: ${actualUserId} | Session: ${sessionId || 'none'} | Cost: $${totalCost.toFixed(6)} | Error: ${dbError.message || dbError}`);
        }
      }

      // Возвращаем ответ в стандартном формате
      res.json(data);
    }

  } catch (error) {
    console.error(`❌ Chat API Proxy Error | Model: ${req.body?.model || 'unknown'} | Messages: ${req.body?.messages?.length || 0} | Stream: ${req.body?.stream || false} | Error: ${error.message || error} | Stack: ${error.stack?.substring(0, 200) || 'none'}...`);
    res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message
    });
  }
});

// TTS functionality removed - using only DeepSeek models

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/users/:id/balance
app.get("/api/users/:id/balance", (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const user = DatabaseService.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({ balance: Number(user.balance) });
  } catch (e) {
    console.error("GET /api/users/:id/balance failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/:id/deduct-tokens (списываем USD totalCost)
app.post("/api/users/:id/deduct-tokens", (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const { totalCost, model, inputTokens, outputTokens, totalTokens } = req.body || {};
    const cost = Number(totalCost);

    // totalCost должен быть числом > 0
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ error: "Invalid totalCost" });
    }

    // Рекомендуемая нормализация из-за REAL/float: храним до 6 знаков
    const round6 = (x) => Math.round(x * 1e6) / 1e6;

    const user = DatabaseService.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const current = Number(user.balance ?? 0);
    const next = round6(current - cost);

    if (next < 0) {
      return res.status(402).json({ error: "Insufficient balance", balance: current });
    }

    // Списываем средства
    DatabaseService.updateUserBalance(userId, -cost);

    // Создаем транзакцию для аудита
    DatabaseService.createTransaction(
      userId,
      'spend',
      cost,
      `AI usage: ${model || 'unknown'} (${totalTokens || 0} tokens)`,
      null
    );

    const updatedUser = DatabaseService.getUserById(userId);

    return res.json({ success: true, newBalance: Number(updatedUser.balance) });
  } catch (e) {
    console.error("POST /api/users/:id/deduct-tokens failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      deepseek_key_configured: !!deepseekKey,
      openai_key_configured: !!openaiKey,
      deepseek_key_prefix: deepseekKey ? deepseekKey.substring(0, 10) + '...' : null,
    },
    database: {
      path: DB_PATH,
      initialized: true
    }
  });
});

// Debug endpoint for checking server status
app.get('/api/debug', (req, res) => {
  try {
    // Проверяем базу данных
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM chat_sessions').get().count;
    const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

    res.json({
      status: 'debug_ok',
      timestamp: new Date().toISOString(),
      database: {
        users: userCount,
        sessions: sessionCount,
        messages: messageCount
      },
      environment: {
        deepseek_key: process.env.DEEPSEEK_API_KEY ? 'configured' : 'missing',
        openai_key: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        node_env: process.env.NODE_ENV,
        port: process.env.PORT
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'debug_error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint for context checking
app.post('/api/test-context', (req, res) => {
  const { messages } = req.body;
  console.log('🧪 Test context endpoint called');
  console.log('📜 Received messages:', messages?.length || 0);
  if (messages) {
    messages.forEach((msg, i) => {
      console.log(`  ${i}: ${msg.role} - ${msg.content?.substring(0, 100)}${msg.content?.length > 100 ? '...' : ''}`);
    });
  }
  res.json({
    status: 'ok',
    messageCount: messages?.length || 0,
    messages: messages
  });
});

// Test market query detection
app.post('/api/test-market-query', (req, res) => {
  const { query } = req.body;
  const lowerQuery = query.toLowerCase();

  // Проверяем на упоминание биткойна в различных формах
  const hasBitcoin = lowerQuery.includes('биткойн') ||
                     lowerQuery.includes('биткоин') ||
                     lowerQuery.includes('bitcoin') ||
                     lowerQuery.includes('btc');

  // Проверяем на слова, указывающие на запрос цены/курса
  const hasPriceQuery = lowerQuery.includes('курс') ||
                       lowerQuery.includes('цена') ||
                       lowerQuery.includes('стоимость') ||
                       lowerQuery.includes('стоит') ||
                       lowerQuery.includes('сколько') ||
                       lowerQuery.includes('rate') ||
                       lowerQuery.includes('price') ||
                       lowerQuery.includes('cost');

  const isMarketQuery = hasBitcoin && hasPriceQuery;

  console.log('🧪 Market query test:', { query, hasBitcoin, hasPriceQuery, isMarketQuery });

  res.json({
    query,
    hasBitcoin,
    hasPriceQuery,
    isMarketQuery
  });
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - all non-API routes should return index.html
app.use((req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // For all other routes, serve index.html
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT} (accessible from all interfaces)`);
  console.log(`📦 Serving static files from dist/`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down API server...');
  DatabaseService.close();
  process.exit(0);
});

// Отладочный маршрут для тестирования генерации сайтов
app.post('/api/debug-generate-site', async (req, res) => {
  try {
    console.log('🔍 DEBUG GENERATE SITE REQUEST:', req.body);
    const { prompt } = req.body;

    // Импортируем функцию генерации
    const { generateWebsiteArtifact } = await import('./src/lib/openai.js');

    console.log('🚀 Calling generateWebsiteArtifact...');
    const result = await generateWebsiteArtifact(prompt || 'создай сайт', 'deepseek-chat');

    console.log('✅ generateWebsiteArtifact succeeded');
    res.json({
      success: true,
      artifact: result.artifact,
      assistantText: result.assistantText
    });

  } catch (error) {
    console.error('❌ Debug generate site error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Generate site failed',
      message: error.message,
      stack: error.stack?.substring(0, 1000)
    });
  }
});

// Отладочный маршрут для тестирования генерации сайтов
app.post('/api/debug-generate-site', async (req, res) => {
  try {
    console.log('🔍 DEBUG GENERATE SITE REQUEST:', req.body);
    const { prompt } = req.body;

    // Импортируем функцию генерации
    const { generateWebsiteArtifact } = await import('./src/lib/openai.js');

    console.log('🚀 Calling generateWebsiteArtifact...');
    const result = await generateWebsiteArtifact(prompt || 'создай сайт', 'deepseek-chat');

    console.log('✅ generateWebsiteArtifact succeeded');
    res.json({
      success: true,
      artifact: result.artifact,
      assistantText: result.assistantText
    });

  } catch (error) {
    console.error('❌ Debug generate site error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Generate site failed',
      message: error.message,
      stack: error.stack?.substring(0, 1000)
    });
  }
});

// Отладочный маршрут для тестирования Vite структуры
app.post('/api/debug-vite-structure', async (req, res) => {
  try {
    const { prompt } = req.body;

    const testArtifact = {
      title: "Тестовый сайт с Vite структурой",
      files: {
        "/index.html": `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Тестовый сайт</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
        "/src/main.tsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
        "/src/App.tsx": `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <div className="text-6xl mb-6">🎯</div>
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Структура исправлена!
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          Файлы теперь в правильных папках Vite
        </p>
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">✅ Исправлено:</h2>
          <ul className="text-left space-y-2 text-gray-600">
            <li>• index.html ссылается на /src/main.tsx</li>
            <li>• main.tsx в папке /src/</li>
            <li>• App.tsx в папке /src/</li>
            <li>• index.css в папке /src/</li>
            <li>• Правильные импорты между файлами</li>
          </ul>
        </div>
      </div>
    </div>
  )
}`,
        "/src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;`
      },
      deps: {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      }
    };

    res.json({
      success: true,
      artifact: testArtifact,
      assistantText: 'Тестовый сайт с правильной Vite структурой создан!'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
});

// Тест исправленной структуры файлов
app.post('/api/test-structure-fix', async (req, res) => {
  try {
    const { prompt } = req.body;

    // Имитируем артефакт как от AI (файлы без путей)
    const rawArtifact = {
      title: "Тест исправленной структуры",
      files: {
        "index.html": `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Тестовый сайт</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
        "main.tsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
        "App.tsx": `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <div className="text-6xl mb-6">✅</div>
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Структура исправлена!
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          Файлы автоматически перемещены в правильные папки
        </p>
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Исправления:</h2>
          <ul className="text-left space-y-2 text-gray-600">
            <li>• main.tsx → /src/main.tsx</li>
            <li>• App.tsx → /src/App.tsx</li>
            <li>• index.css → /src/index.css</li>
            <li>• index.html с правильной ссылкой</li>
          </ul>
        </div>
      </div>
    </div>
  )
}`,
        "index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;`
      },
      deps: {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      }
    };

    // Исправляем структуру файлов для Vite
    const correctedFiles = {
      '/index.html': rawArtifact.files['index.html'] || '<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      '/src/main.tsx': rawArtifact.files['main.tsx'] || 'console.log("main.tsx")',
      '/src/App.tsx': rawArtifact.files['App.tsx'] || 'export default function App() { return <div>Hello</div>; }',
      '/src/index.css': rawArtifact.files['index.css'] || 'body { margin: 0; }'
    };

    const correctedArtifact = {
      ...rawArtifact,
      files: correctedFiles
    };

    res.json({
      success: true,
      artifact: correctedArtifact,
      assistantText: 'Структура файлов автоматически исправлена для Vite!',
      debug: {
        originalFiles: Object.keys(rawArtifact.files),
        correctedFiles: Object.keys(correctedFiles)
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down API server...');
  DatabaseService.close();
  process.exit(0);
});
