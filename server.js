import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dns from 'node:dns/promises';
import { DatabaseService } from './src/lib/database.js';

// Функция для генерации превью HTML с инлайновыми ресурсами
function buildPreviewSrcDoc(rawFiles) {
  // normalizeFiles function inline
  const normalizeFiles = (files) => {
    const out = {};
    for (const [k, v] of Object.entries(files || {})) {
      const key = k.replace(/^\/+/, "");
      out[key] = String(v ?? "");
      out["/" + key] = String(v ?? "");
    }
    return out;
  };

  const f = normalizeFiles(rawFiles);
  const html = (f["index.html"] || f["/index.html"] || "").trim();
  const css = f["styles.css"] || f["/styles.css"] || "";
  const js = f["app.js"] || f["/app.js"] || "";

  if (!html) {
    return `<!doctype html><html><body><pre style="padding:16px;color:#b00">
index.html not found in artifact.files
Keys: ${(rawFiles ? Object.keys(rawFiles) : []).join(", ")}
</pre></body></html>`;
  }

  let out = html;

  // 1) base (чтобы якоря/ссылки не ломались)
  if (!/<base\b/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="/" />`);
  }

  // 2) CSS: заменить <link ...styles.css> на <style>...</style> (или вставить в </head>)
  if (/<link[^>]+href=["']\/?styles\.css["'][^>]*>/i.test(out)) {
    out = out.replace(
      /<link[^>]+href=["']\/?styles\.css["'][^>]*>\s*/i,
      `<style>\n${css}\n</style>\n`
    );
  } else {
    out = out.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
  }

  // 3) JS: инлайн + try/catch, чтобы вместо белого экрана вы видели stacktrace
  const safeJs = `try {\n${js}\n} catch (e) {\n  console.error(e);\n  document.body.innerHTML = '<pre style="padding:16px;color:#b00;white-space:pre-wrap">' + (e && e.stack ? e.stack : String(e)) + '</pre>';\n}\n`;

  if (/<script[^>]+src=["']\/?app\.js["'][^>]*>\s*<\/script>/i.test(out)) {
    out = out.replace(
      /<script[^>]+src=["']\/?app\.js["'][^>]*>\s*<\/script>/i,
      `<script>\n${safeJs}\n</script>`
    );
  } else {
    out = out.replace(/<\/body>/i, `<script>\n${safeJs}\n</script>\n</body>`);
  }

  return out;
}

// Единая модель проекта (1 источник правды)
const MODEL = "deepseek-chat";
// Load API key from environment variables
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_URL = "https://api.deepseek.com/chat/completions";

// Параметры для разных типов запросов
const MODEL_PARAMS = {
  max_tokens: 12000,
  temperature: 0.7,
};

const PLAN_PARAMS = {
  max_tokens: 1200,
  temperature: 0.2,
};

const ARTIFACT_PARAMS = {
  max_tokens: 8000, // Уменьшаем для стабильности JSON парсинга
  temperature: 0.3,
};

// Явно инициализируем базу данных при запуске сервера
console.log('🗄️ Initializing database service...');
try {
  DatabaseService.initDatabase?.();
} catch (error) {
  console.error('❌ Failed to initialize database:', error);
}
import { marketRouter } from './src/routes/market.js';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import JSON5 from 'json5';
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Decision system prompt
// Helper: детектор запросов, требующих свежих данных
function requiresFreshData(text = "") {
  return /погод|weather|курс|price|цена|новост|today|сегодня|сейчас|актуальн/i.test(text);
}

// Helper: детектор криптовалютных запросов
function isCryptoQuery(text = "") {
  const q = text.toLowerCase();
  return (
    /\b(btc|eth|sol|bnb|xrp|ada|doge|matic|link|uni|avax|dot)\b/i.test(q) ||
    /\b(usdt|usd|eur|rub|btc|eth)\b/i.test(q) ||
    /\b(курс|цена|стоимость|цена|price|rate|cost)\b/i.test(q) ||
    q.includes("/")
  );
}

// Helper: извлечение крипто-пары из запроса
function extractCryptoPair(text = "") {
  const q = text.toUpperCase().trim();

  // Прямые паттерны: SOL/USDT, BTC USD, ETH-EUR
  const directMatch = q.match(/([A-Z]{2,10})[\/\s-]([A-Z]{2,10})/);
  if (directMatch) {
    return {
      base: directMatch[1],   // SOL
      quote: directMatch[2]   // USDT
    };
  }

  // Обратные паттерны: курс SOL, цена BTC, SOL цена
  const tokenMatch = q.match(/\b(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|AVAX|LINK|UNI|CAKE)\b/i);
  if (tokenMatch) {
    const base = tokenMatch[1].toUpperCase();
    let quote = 'USD'; // по умолчанию

    // Проверяем валюту в запросе
    if (/\b(USDT|USD)\b/i.test(q)) quote = 'USDT';
    else if (/\b(EUR)\b/i.test(q)) quote = 'EUR';
    else if (/\b(RUB|руб)\b/i.test(q)) quote = 'RUB';

    return { base, quote };
  }

  return null;
}

// Helper: маппинг токенов на CoinGecko ID
function getCoinGeckoId(token) {
  const mapping = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'BNB': 'binancecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'DOT': 'polkadot',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'CAKE': 'pancakeswap-token',
    'MATIC': 'matic-network'
  };

  return mapping[token.toUpperCase()] || null;
}

const DECISION_SYSTEM_PROMPT = `Ты — WindexsAI.

У тебя есть возможность запросить инструмент web_search,
НО ты не ходишь в интернет напрямую.

ПРАВИЛА:
1. Если вопрос требует АКТУАЛЬНЫХ данных (погода, курсы, новости, события, цены) —
   ты ОБЯЗАН указать need_web = true.
2. Если интернет не нужен — need_web = false.
3. Никогда не говори, что у тебя нет доступа к интернету.
4. Отвечай ТОЛЬКО валидным JSON строго в формате:

{
  "need_web": boolean,
  "query": string (если need_web = true),
  "reason": string
}`;

const app = express();
const PORT = process.env.PORT || 1062;

const SQLiteStore = SQLiteStoreFactory(session);

// Writable директория под БД (в контейнере её нужно примонтировать volume'ом)
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "windexs_chat.db");

// Локальная БД для prepared statements
const db = new Database(DB_PATH);
const checkSessionOwnerStmt = db.prepare(`
  SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?
`);

// Настройка trust proxy для reverse proxy
app.set("trust proxy", 1);

// CORS настройки с credentials для сессий
app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (для мобильных apps, curl etc)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://ai.windexs.ru",
      "https://www.ai.windexs.ru",
      "http://ai.windexs.ru",
      "http://www.ai.windexs.ru",
      "http://127.0.0.1:8081",
      "http://localhost:8081",
      "http://localhost:3000",
      "http://localhost:5173"
    ];

    // Разрешаем все ngrok домены (*.ngrok-free.dev, *.ngrok.io etc)
    if (origin.match(/^https?:\/\/.*\.ngrok(-free)?\.dev$/)) {
      return callback(null, true);
    }

    // Разрешаем localhost для разработки
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));

// Session middleware
const isProd = process.env.NODE_ENV === "production";

// Рекомендуемый writable каталог в контейнере (под volume)
const SESSION_DIR = process.env.SESSION_DIR || (process.env.NODE_ENV === 'production' ? "/data/sessions" : path.join(process.cwd(), "data", "sessions"));
fs.mkdirSync(SESSION_DIR, { recursive: true });

// Важно для secure cookies за reverse-proxy (nginx)
if (isProd) {
  app.set("trust proxy", 1);
}

app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    db: "http_sessions.sqlite",
    dir: SESSION_DIR,
  }),
  cookie: {
    httpOnly: true,
    secure: isProd || process.env.FORCE_HTTPS === 'true',  // true в prod или принудительно для ngrok
    sameSite: isProd ? "none" : (process.env.FORCE_HTTPS === 'true' ? "none" : "lax"),  // none для кросс-ориджин (ngrok)
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

// Middleware для проверки аутентификации через сессии
function requireAuth(req, res, next) {
  try {
    if (req.method === "OPTIONS") return next(); // не блокируем preflight

    const userId = req.session?.userId;
    console.log('🔐 requireAuth check:', { userId, sessionId: req.session?.id, hasSession: !!req.session });

    if (!userId) {
      console.log('❌ requireAuth failed: no userId in session');
      return res.status(401).json({ error: "unauthorized" });
    }

    req.user = { id: userId };
    console.log('✅ requireAuth success for user:', userId);
    return next();
  } catch (e) {
    console.error("❌ requireAuth error:", e?.stack || e);
    return res.status(500).json({ error: "auth_middleware_failed" });
  }
}


// Стоимость токенов за 1M токенов в долларах (DeepSeek models only)
const getTokenPrices = (model) => {
  // Фиксированная стоимость: 1 рубль за сообщение
  // Конвертируем в USD (курс 85 рублей за доллар)
  const fixedCostUSD = 1 / 85; // 1 рубль = 1/85 USD

  // Распределяем стоимость между input и output (примерно 30% на input, 70% на output)
  const prices = {
    // DeepSeek models
    'deepseek-chat': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 },
    'deepseek-reasoner': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 },
    // OpenAI models
    'gpt-3.5-turbo': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 },
    'gpt-4': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 },
    'gpt-4o-mini': { input: fixedCostUSD * 0.3, output: fixedCostUSD * 0.7 }
  };
  return prices[model] || prices['gpt-4o-mini'];
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
console.log('🌐 Proxy configuration:', {
  PROXY_URL: PROXY_URL ? '[REDACTED]' : null,
  proxyConfigured: !!PROXY_URL
});

// Используем HttpsProxyAgent для HTTPS прокси
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;
console.log('🌐 Proxy agent created:', !!proxyAgent);

// Функция для выполнения fetch с опциональным прокси
async function fetchWithOptionalProxy(url, options = {}) {
  const isOpenAI = url.includes('openai.com');
  const isDeepSeek = url.includes('deepseek.com');
  const fetchOptions = { ...options };

  // Используем прокси для OpenAI и DeepSeek
  if ((isOpenAI || isDeepSeek) && proxyAgent) {
    fetchOptions.dispatcher = proxyAgent;
    console.log(`🌐 fetchWithOptionalProxy: Using proxy for ${isOpenAI ? 'OpenAI' : 'DeepSeek'} request to ${url}`);
  } else {
    console.log(`❌ fetchWithOptionalProxy: No proxy for request to ${url}`);
  }

  return fetch(url, fetchOptions);
}

// Увеличиваем лимит размера тела запроса до 10MB для больших контекстов
app.use(express.json({ limit: '10mb' }));

// Market API Routes
app.use('/api/market', marketRouter);

// API Routes

// Создать новую сессию чата
app.post('/api/sessions', requireAuth, (req, res) => {
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
app.get('/api/sessions', requireAuth, (req, res) => {
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
app.get('/api/sessions/:sessionId/messages', requireAuth, (req, res) => {
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

// Test proxy endpoint
app.get('/api/test-proxy', (req, res) => {
  res.json({
    proxyConfigured: !!process.env.PROXY_URL,
    proxyUrl: process.env.PROXY_URL ? '[REDACTED]' : null,
    proxyAgent: !!proxyAgent
  });
});

// Generate chat summary
app.post('/api/sessions/:sessionId/summary', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionIdNum = parseInt(sessionId);

    console.log(`📋 POST /api/sessions/${sessionId}/summary | User: ${req.user.id}`);

    // Проверяем, что сессия принадлежит пользователю
    const ok = checkSessionOwnerStmt.get(sessionIdNum, req.user.id);
    if (!ok) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Загружаем сообщения сессии
    const messages = DatabaseService.loadMessages(sessionIdNum);
    
    if (messages.length === 0) {
      return res.status(400).json({ error: 'No messages to summarize' });
    }

    // Формируем промпт для резюме
    const conversationText = messages.map(msg => 
      `${msg.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${msg.content}`
    ).join('\n\n');

    const summaryPrompt = `Создай подробное и логичное резюме следующего разговора. Включи все основные темы, вопросы и ответы. Резюме должно быть структурированным и понятным:\n\n${conversationText}\n\nРезюме:`;

    // Используем DeepSeek для генерации резюме
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) {
      return res.status(500).json({ error: "DEEPSEEK_API_KEY is missing" });
    }

    const upstreamBody = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Ты — эксперт по созданию подробных и структурированных резюме разговоров." },
        { role: "user", content: summaryPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    };

    const upstreamResponse = await fetchWithOptionalProxy("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekKey}`
      },
      body: JSON.stringify(upstreamBody)
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      console.error('DeepSeek API error:', errorText);
      return res.status(500).json({ error: 'Failed to generate summary' });
    }

    const data = await upstreamResponse.json();
    const summary = data.choices?.[0]?.message?.content || 'Не удалось создать резюме';

    res.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Сохранить сообщение
app.post("/api/messages", requireAuth, (req, res) => {
  try {
    const { sessionId, role, content, artifactId } = req.body || {};

    const missing = [];
    if (sessionId == null) missing.push("sessionId");
    if (!role) missing.push("role");
    if (!content) missing.push("content");

    if (missing.length) {
      console.warn("❌ /api/messages missing fields:", { missing, body: req.body });
      return res.status(400).json({ error: "Missing required fields", missing });
    }

    const sessionIdNum = Number(sessionId);
    if (!Number.isFinite(sessionIdNum) || sessionIdNum <= 0) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    // проверка владельца (как в GET /sessions/:id/messages)
    const ok = checkSessionOwnerStmt.get(sessionIdNum, req.user.id);
    if (!ok) return res.status(404).json({ error: "Session not found" });

    const messageId = DatabaseService.saveMessage(
      sessionIdNum,
      req.user.id,
      role,
      content,
      artifactId || null
    );

    return res.json({ messageId });
  } catch (e) {
    console.error("❌ Error saving message:", e?.stack || e);
    return res.status(500).json({ error: "Failed to save message" });
  }
});

// Удалить сообщение
app.delete("/api/messages/:messageId", requireAuth, (req, res) => {
  try {
    const { messageId } = req.params;
    const messageIdNum = parseInt(messageId);

    if (!Number.isFinite(messageIdNum) || messageIdNum <= 0) {
      return res.status(400).json({ error: "Invalid messageId" });
    }

    console.log(`🗑️ DELETE /api/messages/${messageId} | User: ${req.user.id}`);

    // Получаем информацию о сообщении, чтобы проверить права доступа
    const messageStmt = db.prepare('SELECT session_id FROM messages WHERE id = ?');
    const message = messageStmt.get(messageIdNum);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Проверяем, что сессия принадлежит пользователю
    const ok = checkSessionOwnerStmt.get(message.session_id, req.user.id);
    if (!ok) {
      return res.status(404).json({ error: "Message not found or access denied" });
    }

    // Удаляем сообщение
    DatabaseService.deleteMessage(messageIdNum);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
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

// === Auth API ===

// Создать demo пользователя и сессию для тестирования
app.post('/api/auth/demo', (req, res) => {
  // Временно разрешаем demo auth в production для тестирования
  // if (process.env.NODE_ENV === 'production') {
  //   return res.status(403).json({ error: "Demo auth not available in production" });
  // }

  try {
    const { email = 'demo@example.com', username = 'Demo User' } = req.body;

    // Создаем или получаем demo пользователя
    let user = DatabaseService.getUserByEmail(email);

    if (!user) {
      console.log('📝 Creating new demo user for auth:', email);
      const userId = DatabaseService.createUser(username, email, 10.0);

      if (userId) {
        DatabaseService.createTransaction(
          userId,
          'deposit',
          10.0,
          'Initial demo balance',
          `demo_setup_${userId}_${Date.now()}`
        );
      }
      user = DatabaseService.getUserById(userId);
    }

    if (!user) {
      return res.status(500).json({ error: "Failed to create/retrieve demo user" });
    }

    // Создаем сессию
    req.session.userId = user.id;
    console.log('🔐 Demo auth setting session userId:', user.id, 'sessionId:', req.session?.id);
    req.session.save((err) => {
      if (err) {
        console.error('❌ Demo auth session save error:', err);
        return res.status(500).json({ error: "Session save failed" });
      }

      console.log('✅ Demo auth successful for user:', user.id, user.email, 'session saved');
      res.json({ user, message: "Demo authentication successful" });
    });

  } catch (error) {
    console.error('Demo auth error:', error);
    res.status(500).json({ error: 'Demo authentication failed' });
  }
});

// Получить информацию о текущем пользователе
app.get('/api/me', requireAuth, (req, res) => {
  const user = DatabaseService.getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json(user);
});

// Выйти из системы
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
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

    console.log('👤 Getting/creating user:', { id, name, email });
    console.log('🔧 Environment check:', {
      deepseek_key: !!DEEPSEEK_API_KEY,
      node_env: process.env.NODE_ENV,
      port: process.env.PORT
    });

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

      console.log('🔄 Creating user with params:', { username, uniqueEmail, initialBalance });

      const userId = DatabaseService.createUser(username, uniqueEmail, initialBalance);
      console.log('✅ New user created with ID:', userId, 'email:', uniqueEmail);

      if (!userId) {
        console.error('❌ Failed to create user - no ID returned');
        console.error('❌ Last database error:', DatabaseService.getLastError?.() || 'No error info');
        return res.status(500).json({ error: 'Failed to create user' });
      }

      console.log('🔄 Retrieving user by ID:', userId);
      user = DatabaseService.getUserById(userId);
      if (!user) {
        console.error('❌ Failed to retrieve created user with ID:', userId);
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

    // Сохраняем userId в сессии
    req.session.userId = user.id;

    try {
      // Синхронное сохранение сессии (express-session поддерживает это)
      req.session.save();
      console.log('✅ Session saved for user:', user.id);
      res.json(responseUser);
    } catch (err) {
      console.error("❌ session save failed:", err);
      return res.status(500).json({ error: "Failed to persist session" });
    }
  } catch (error) {
    console.error('❌ Get current user error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    res.status(500).json({
      error: 'Failed to get current user',
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
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

    const systemPrompt = `Ты генерируешь СТАТИЧЕСКИЙ сайт без сборки.
Запрещено: React, TypeScript, Vite, Webpack, любые CDN/шрифты по ссылкам, node_modules, package.json.
Нужно вернуть JSON строго в формате:
{
  "assistantText": "Описание сайта",
  "artifact": {
    "type": "website",
    "title": "Название сайта",
    "files": {
      "/index.html": "полный HTML код",
      "/styles.css": "полный CSS код",
      "/app.js": "JavaScript код (будет заменен на стабильный runtime)"
    },
    "deps": {}
  }
}

КРИТИЧНО: используй единый контракт классов для согласованности:
- Навигация: меню - .nav-menu, ссылки - .nav-link, бургер - #nav-toggle с классом .nav-toggle
- Табы: контейнер - .tab-list, кнопки - .tab с data-target="panelId", панели - .tab-panel
- Аккордеон: заголовки - .accordion-header, контент - .accordion-content
- Toast: #toast с классом .show для показа, иконка - .toast-icon
- Кнопка "Наверх": #to-top с классом .visible для показа
- Кнопки: базовый класс .btn, варианты .btn-primary и .btn-secondary
- Тема: переключатель #theme-toggle, тема через [data-theme="dark"] на <html>

Все должно работать без сборки, только чистый HTML/CSS/JS.`;

    const deepseekResponse = await fetchWithOptionalProxy(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
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
      console.error(`❌ OpenAI API Error [Artifacts] | Status: ${deepseekResponse.status} ${deepseekResponse.statusText} | Model: ${MODEL} | Error: ${errorText.substring(0, 500)}`);
      return res.status(deepseekResponse.status).json({
        error: 'OpenAI API error',
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

    // Проверка обязательных файлов для vanilla HTML/CSS/JS сайтов
    const requiredFiles = ['/index.html', '/styles.css', '/app.js'];
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

    // Проверка обязательных файлов для vanilla HTML/CSS/JS сайтов
    const requiredFiles = ['/index.html', '/styles.css', '/app.js'];
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

// Редактировать артефакт (правка существующего сайта)
app.post("/api/artifacts/:id/edit", requireAuth, async (req, res) => {
  try {
    const artifactId = Number(req.params.id);
    const {
      instruction,
      model = "lite",
      requestId,
      max_tokens,
      temperature,
      response_format,
    } = req.body || {};

    if (!Number.isFinite(artifactId) || artifactId <= 0) {
      return res.status(400).json({ error: "Invalid artifactId" });
    }
    if (!instruction || !String(instruction).trim()) {
      return res.status(400).json({ error: "instruction required" });
    }

    // --- helpers ------------------------------------------------------------

    const normalizeFiles = (art) => {
      const indexHtml = art.files?.["/index.html"] ?? art.files?.["index.html"] ?? "";
      const stylesCss = art.files?.["/styles.css"] ?? art.files?.["styles.css"] ?? "";
      const appJs = art.files?.["/app.js"] ?? art.files?.["app.js"] ?? "";
      return {
        "/index.html": String(indexHtml),
        "/styles.css": String(stylesCss),
        "/app.js": String(appJs),
      };
    };

    const stripCssImports = (js) =>
      String(js)
        .split("\n")
        .filter((line) => !/^\s*import\s+["'][^"']+\.css["']\s*;?\s*$/.test(line))
        .join("\n");

    const validateBasics = (files) => {
      const html = files["/index.html"] || "";
      if (!html.includes('id="app"') && !html.includes("id='app'")) {
        throw new Error("index.html must contain <div id=\"app\"></div>");
      }
      // не железно, но полезно
      // допускаем любые пути, но желательно /styles.css и /app.js
      return true;
    };

    // Upsert CSS var inside :root {...}
    const setCssVar = (css, varName, value) => {
      let out = String(css);

      const rootRe = /:root\s*\{([\s\S]*?)\}/m;
      const m = out.match(rootRe);

      if (!m) {
        // добавляем :root в начало файла
        const block =
          `:root{\n  ${varName}: ${value};\n}\n\n`;
        return block + out;
      }

      const body = m[1];
      const varRe = new RegExp(`(^|\\n)\\s*${escapeRegExp(varName)}\\s*:\\s*[^;]+;?`, "m");

      let newBody;
      if (varRe.test(body)) {
        newBody = body.replace(varRe, `$1  ${varName}: ${value};`);
      } else {
        // вставим перед закрывающей }
        newBody = body.trimEnd() + `\n  ${varName}: ${value};\n`;
      }

      out = out.replace(rootRe, `:root{${newBody}}`);
      return out;
    };

    // Upsert property inside selector block (very lightweight regex approach)
    const upsertCssProp = (css, selector, prop, value) => {
      let out = String(css);
      const selRe = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, "m");
      const m = out.match(selRe);

      if (!m) {
        // добавим правило в конец
        out = out.trimEnd() + `\n\n${selector}{\n  ${prop}: ${value};\n}\n`;
        return out;
      }

      const body = m[1];
      const propRe = new RegExp(`(^|\\n)\\s*${escapeRegExp(prop)}\\s*:\\s*[^;]+;?`, "m");
      let newBody;
      if (propRe.test(body)) {
        newBody = body.replace(propRe, `$1  ${prop}: ${value};`);
      } else {
        newBody = body.trimEnd() + `\n  ${prop}: ${value};\n`;
      }

      out = out.replace(selRe, `${selector}{${newBody}}`);
      return out;
    };

    function escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const applyEdits = (files, edits) => {
      const out = { ...files };

      const normPath = (f) => {
        if (f === "index.html") return "/index.html";
        if (f === "styles.css") return "/styles.css";
        if (f === "app.js") return "/app.js";
        if (f === "/index.html" || f === "/styles.css" || f === "/app.js") return f;
        // запрещаем любые другие файлы
        throw new Error(`Unsupported file: ${f}`);
      };

      for (const e of edits) {
        const path = normPath(e.file);
        let src = String(out[path] ?? "");

        switch (e.op) {
          case "replace_between": {
            const start = String(e.start ?? "");
            const end = String(e.end ?? "");
            if (!start || !end) {
              console.warn(`⚠️ replace_between: Missing start/end for ${path}, skipping`);
              break;
            }
            const i = src.indexOf(start);
            const j = src.indexOf(end);
            if (i < 0 || j < 0 || j <= i) {
              console.warn(`⚠️ replace_between: Anchors not found for ${path}: "${start}" ... "${end}", skipping`);
              break; // Не выбрасываем ошибку, просто пропускаем
            }
            const before = src.slice(0, i + start.length);
            const after = src.slice(j);
            src = `${before}\n${String(e.text ?? "")}\n${after}`;
            break;
          }

          case "replace_first": {
            const match = String(e.match ?? "");
            if (!match) {
              console.warn(`⚠️ replace_first: Missing match for ${path}, skipping`);
              break;
            }
            const k = src.indexOf(match);
            if (k < 0) {
              console.warn(`⚠️ replace_first: Match "${match}" not found in ${path}, skipping`);
              break;
            }
            src = src.replace(match, String(e.text ?? ""));
            break;
          }

          case "replace_all": {
            const match = String(e.match ?? "");
            if (!match) throw new Error("replace_all requires match");
            if (!src.includes(match)) {
              console.warn(`⚠️ replace_all: Match "${match}" not found in ${path}, skipping`);
              break; // Не выбрасываем ошибку, просто пропускаем
            }
            src = src.split(match).join(String(e.text ?? ""));
            break;
          }

          case "replace_regex": {
            const pattern = String(e.pattern ?? "");
            const flags = String(e.flags ?? "g");
            if (!pattern) throw new Error("replace_regex requires pattern");

            try {
              const regex = new RegExp(pattern, flags);
              if (!regex.test(src)) {
                console.warn(`⚠️ replace_regex: Pattern "${pattern}" not found in ${path}, skipping`);
                break;
              }
              src = src.replace(regex, String(e.text ?? ""));
            } catch (regexError) {
              console.warn(`⚠️ replace_regex: Invalid regex "${pattern}": ${regexError.message}, skipping`);
            }
            break;
          }

          case "insert_after": {
            const anchor = String(e.anchor ?? "");
            if (!anchor) {
              console.warn(`⚠️ insert_after: Missing anchor for ${path}, skipping`);
              break;
            }
            const k = src.indexOf(anchor);
            if (k < 0) {
              console.warn(`⚠️ insert_after: Anchor "${anchor}" not found in ${path}, skipping`);
              break;
            }
            src = src.slice(0, k + anchor.length) + "\n" + String(e.text ?? "") + "\n" + src.slice(k + anchor.length);
            break;
          }

          case "insert_before": {
            const anchor = String(e.anchor ?? "");
            if (!anchor) {
              console.warn(`⚠️ insert_before: Missing anchor for ${path}, skipping`);
              break;
            }
            const k = src.indexOf(anchor);
            if (k < 0) {
              console.warn(`⚠️ insert_before: Anchor "${anchor}" not found in ${path}, skipping`);
              break;
            }
            src = src.slice(0, k) + String(e.text ?? "") + "\n" + src.slice(k);
            break;
          }

          // --- CSS smart ops (минимальные правки) ----------------------------
          case "css_set_var": {
            if (path !== "/styles.css") throw new Error("css_set_var only for styles.css");
            src = setCssVar(src, String(e.var ?? ""), String(e.value ?? ""));
            break;
          }

          case "css_upsert_prop": {
            if (path !== "/styles.css") throw new Error("css_upsert_prop only for styles.css");
            src = upsertCssProp(src, String(e.selector ?? "body"), String(e.prop ?? ""), String(e.value ?? ""));
            break;
          }

          default:
            throw new Error(`Unsupported op: ${e.op}`);
        }

        out[path] = src;
      }

      // пост-санитизация
      out["/app.js"] = stripCssImports(out["/app.js"]);
      return out;
    };

    // --- data load + ownership ---------------------------------------------

    const art = DatabaseService.getArtifact(artifactId);
    if (!art) return res.status(404).json({ error: "artifact not found" });

    const ok = db.prepare(`
      SELECT 1
      FROM artifacts a
      JOIN chat_sessions s ON s.id = a.session_id
      WHERE a.id = ? AND s.user_id = ?
    `).get(artifactId, req.user.id);
    if (!ok) return res.status(403).json({ error: "forbidden" });

    const currentFiles = normalizeFiles(art);

    // --- prompts: PATCH contract -------------------------------------------

    const systemPrompt = `
Ты — senior product front-end инженер.

Правь существующий статический сайт строго на HTML/CSS/JS.

Это ПОЛНОЦЕННОЕ веб-приложение продуктового уровня с бизнес-логикой, состояниями и пользовательскими сценариями.

КРИТИЧНО:
- Верни ТОЛЬКО валидный JSON (без markdown/текста вокруг), начни с { и закончи }.
- НЕ возвращай полностью файлы.
- Верни только список точечных правок edits[] (минимальные изменения).
- Разрешены только файлы: index.html, styles.css, app.js.
- Запрещено: React/Vite/TS/JSX, npm, любые CDN, любые import/export, network-запросы.

Формат ответа:
{
  "assistantText": "кратко что изменено",
  "title": "опционально",
  "edits": [
    {
      "file": "styles.css" | "index.html" | "app.js",
      "op": "replace_between" | "replace_first" | "replace_all" | "replace_regex" | "insert_after" | "insert_before" | "css_set_var" | "css_upsert_prop",
      // поля зависят от op
    }
  ]
}

Правила:
- Изменения должны сохранять продуктовую логику и бизнес-правила
- Если задача про фон/цвета/темы — предпочитай ops css_set_var и css_upsert_prop, а не replace_all.
- css_set_var: { "file":"styles.css","op":"css_set_var","var":"--bg","value":"#ffc0cb" }
- css_upsert_prop: { "file":"styles.css","op":"css_upsert_prop","selector":"body","prop":"background","value":"var(--bg)" }

- Для текстовых изменений предпочитай replace_all или replace_regex вместо replace_between (более надежно).
- replace_all: { "file":"index.html","op":"replace_all","match":"старый текст","text":"новый текст" }
- replace_regex: { "file":"index.html","op":"replace_regex","pattern":"регулярка","flags":"g","text":"новый текст" }

- Избегай replace_between с одинаковыми якорями - это не имеет смысла.
- Если не уверен в точном тексте - используй replace_regex с более гибкими паттернами.

Старайся менять только то, что нужно, сохраняя бизнес-логику и пользовательские сценарии.
`.trim();

    const userPrompt = `
ТЕКУЩИЙ КОД:

index.html:
${currentFiles["/index.html"]}

styles.css:
${currentFiles["/styles.css"]}

app.js:
${currentFiles["/app.js"]}

ЗАДАНИЕ ПОЛЬЗОВАТЕЛЯ:
${instruction}

Верни JSON строго по формату PATCH (edits[]).
`.trim();

    // --- upstream call ------------------------------------------------------

    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return res.status(500).json({ error: "DEEPSEEK_API_KEY is missing" });

    const upstreamBody = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      temperature: typeof temperature === "number" ? temperature : 0.2,
      // PATCH-ответ может быть длинным при сложных изменениях
      max_tokens: typeof max_tokens === "number" ? max_tokens : 4000,
      ...(response_format && Object.keys(response_format).length > 0 ? { response_format } : {}),
    };

    const apiResp = await fetchWithOptionalProxy(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify(upstreamBody),
    });

    if (!apiResp.ok) {
      const t = await apiResp.text().catch(() => "");
      return res.status(apiResp.status).json({ error: "OpenAI_API_error", details: t });
    }

    const data = await apiResp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";

    // --- parse JSON (как у вас) --------------------------------------------

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const rawStr = String(raw).trim();
      const startIndex = rawStr.indexOf("{");
      if (startIndex === -1) {
        return res.status(502).json({ error: "no_json_found_in_response", rawHead: rawStr.slice(0, 200) });
      }
      let braceCount = 0;
      let endIndex = -1;
      for (let i = startIndex; i < rawStr.length; i++) {
        if (rawStr[i] === "{") braceCount++;
        else if (rawStr[i] === "}") braceCount--;
        if (braceCount === 0) { endIndex = i; break; }
      }
      if (endIndex === -1) {
        return res.status(502).json({ error: "incomplete_json_braces", rawHead: rawStr.slice(0, 200) });
      }
      const jsonCandidate = rawStr.slice(startIndex, endIndex + 1);
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch (secondError) {
        return res.status(502).json({
          error: "json_extraction_failed",
          rawHead: rawStr.slice(0, 200),
          extractedJson: jsonCandidate.slice(0, 200),
        });
      }
    }

    // --- backward compatible fallback (если модель вдруг вернула старый формат) ----

    // Если пришли full files (artifact.files) — принимаем, но это "перегенерация".
    // Лучше сигнализировать в логах и постепенно отказаться.
    let updatedFiles = null;

    if (Array.isArray(parsed?.edits) && parsed.edits.length > 0) {
      updatedFiles = applyEdits(currentFiles, parsed.edits);
    } else if (parsed?.artifact?.files) {
      console.warn("⚠️ Model returned full files instead of PATCH. Consider tightening prompts.");
      const files = parsed.artifact.files || {};
      updatedFiles = {
        "/index.html": files["index.html"] ?? files["/index.html"] ?? currentFiles["/index.html"],
        "/styles.css": files["styles.css"] ?? files["/styles.css"] ?? currentFiles["/styles.css"],
        "/app.js": stripCssImports(files["app.js"] ?? files["/app.js"] ?? currentFiles["/app.js"]),
      };
    } else {
      return res.status(502).json({ error: "invalid_patch_response", details: "No edits[] provided" });
    }

    // validate minimal invariants
    validateBasics(updatedFiles);

    const newTitle = parsed?.title || parsed?.artifact?.title || art.title || "Website";

    DatabaseService.updateArtifact(artifactId, newTitle, updatedFiles, {});

    return res.json({
      assistantText: parsed?.assistantText || "Правки применены.",
      artifact: { title: newTitle, files: updatedFiles, deps: {} },
    });
  } catch (e) {
    console.error("❌ artifact edit failed:", e);
    return res.status(500).json({ error: "artifact_edit_failed", details: e?.message || String(e) });
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

// Получить превью артефакта (серверный рендер для vanilla сайтов)
app.get('/api/artifacts/:artifactId/preview', (req, res) => {
  try {
    const { artifactId } = req.params;
    const artifact = DatabaseService.getArtifact(parseInt(artifactId));

    if (!artifact) {
      return res.status(404).send('<!doctype html><html><body><pre style="padding:16px;color:#b00">Artifact not found</pre></body></html>');
    }

    // Определяем тип артефакта (vanilla сайт)
    const isVanillaSite = Boolean(
      artifact.files["/index.html"] &&
      artifact.files["/styles.css"] &&
      artifact.files["/app.js"]
    );

    if (!isVanillaSite) {
      return res.status(400).send('<!doctype html><html><body><pre style="padding:16px;color:#b00">Preview only available for vanilla websites (HTML/CSS/JS)</pre></body></html>');
    }

    // Генерируем превью HTML с инлайновыми ресурсами
    const previewHtml = buildPreviewSrcDoc(artifact.files);

    // Отправляем как HTML документ
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(previewHtml);
  } catch (error) {
    console.error('Error generating artifact preview:', error);
    res.status(500).send('<!doctype html><html><body><pre style="padding:16px;color:#b00">Failed to generate preview</pre></body></html>');
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
app.get('/api/sessions/:sessionId/artifacts', requireAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionIdNum = parseInt(sessionId);

    // Проверяем, что пользователь владеет этой сессией
    const ok = db.prepare(`
      SELECT 1
      FROM chat_sessions
      WHERE id = ? AND user_id = ?
    `).get(sessionIdNum, req.user.id);

    if (!ok) {
      return res.status(403).json({ error: "forbidden" });
    }

    const artifacts = DatabaseService.getArtifactsBySession(sessionIdNum);
    res.json(artifacts);
  } catch (error) {
    console.error('Error getting session artifacts:', error);
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

    // 0. Поиск погоды (приоритетный запрос) - СТРУКТУРИРОВАННЫЙ КОНТРАКТ
    const isWeatherQuery = lowerQuery.includes('погод') || lowerQuery.includes('weather') ||
        lowerQuery.includes('температур') || lowerQuery.includes('temperature') ||
        lowerQuery.includes('метеоролог') || lowerQuery.includes('метео');

    if (isWeatherQuery) {
      try {
        // Извлекаем название города из запроса
        let city = null;
        let cityName = null;

        // Улучшенное извлечение города
        const patterns = [
          /(?:погод|weather|температур|temperature).*?(?:в|in)\s+([А-Яа-яЁёA-Za-z\s-]+)/i,
          /(?:в|in)\s+([А-Яа-яЁёA-Za-z\s-]+)/i
        ];

        for (const pattern of patterns) {
          const match = query.match(pattern);
          if (match && match[1]) {
            let extractedCity = match[1].trim();
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
                'волгоград': 'Volgograd',
                'краснодар': 'Krasnodar',
                'краснодаре': 'Krasnodar'
              };

              const cityLower = extractedCity.toLowerCase();
              if (cityMap[cityLower]) {
                city = cityMap[cityLower];
                break;
              }

              // латиница — ок
              if (/^[A-Za-z]/.test(extractedCity)) {
                city = extractedCity;
                break;
              }

              // кириллица — тоже ок (wttr.in переварит URL-encoding)
              city = extractedCity;
              break;
            }
          }
        }

        console.log('🌤️ Weather query detected, city:', city, 'cityName:', cityName);

        // СТРУКТУРИРОВАННЫЙ WEATHER_DATA КОНТРАКТ
        let weatherData = {
          city: city || 'unknown',
          as_of: null,
          temp_c: null,
          feels_like_c: null,
          humidity_pct: null,
          pressure_mm: null,
          wind_mps: null,
          clouds_pct: null,
          source: null
        };

        let weatherDataResolved = false;

        // 1. Пробуем wttr.in (структурированные данные)
        try {
          const wttrUrl = `https://wttr.in/${encodeURIComponent(city || 'Moscow')}?format=j1`;
          const weatherResponse = await fetch(wttrUrl, {
            // fetch with proxy removed for non-OpenAI requests
          });

          if (weatherResponse && weatherResponse.ok) {
            const weatherJson = await weatherResponse.json();
        if (weatherJson.current_condition && weatherJson.current_condition[0]) {
          const current = weatherJson.current_condition[0];
          // Конвертация давления из mbar в mmHg
          const pressureMbar = current.pressure ? parseInt(current.pressure, 10) : null;
          const pressureMm = pressureMbar != null ? Math.round(pressureMbar * 0.75006) : null;

          weatherData = {
            city: city || 'Moscow',
            as_of: new Date().toISOString(),
            temp_c: current.temp_C ? parseInt(current.temp_C) : null,
            feels_like_c: current.FeelsLikeC ? parseInt(current.FeelsLikeC) : null,
            humidity_pct: current.humidity ? parseInt(current.humidity) : null,
            pressure_mm: pressureMm,
            wind_mps: current.windspeedKmph ? Math.round(parseInt(current.windspeedKmph) * 1000 / 3600) : null,
            clouds_pct: current.cloudcover ? parseInt(current.cloudcover) : null,
            source: 'wttr.in'
          };
              weatherDataResolved = true;
              console.log('🌤️ Weather data resolved from wttr.in:', weatherData);
            }
          }
        } catch (wttrError) {
          console.error('wttr.in weather error:', wttrError.message || wttrError);
        }

    // Форматируем результат
    if (weatherDataResolved) {
      searchResults = `WEATHER_DATA
city=${weatherData.city}
as_of=${weatherData.as_of}
temp_c=${weatherData.temp_c ?? 'null'}
feels_like_c=${weatherData.feels_like_c ?? 'null'}
humidity_pct=${weatherData.humidity_pct ?? 'null'}
pressure_mm=${weatherData.pressure_mm ?? 'null'}
wind_mps=${weatherData.wind_mps ?? 'null'}
clouds_pct=${weatherData.clouds_pct ?? 'null'}
source=${weatherData.source}`;
    } else {
      // ЕСЛИ WEATHER НЕ ПОЛУЧЕН - ЯВНЫЙ СИГНАЛ
      searchResults = "[WEATHER_NOT_AVAILABLE]";
    }

      } catch (weatherError) {
        console.error('Weather search error:', weatherError);
        searchResults = "[WEATHER_NOT_AVAILABLE]";
      }
    }

    // 1. Поиск курсов криптовалют (СТРОГИЙ CRYPTO_PRICE КОНТРАКТ)
    if (isCryptoQuery(lowerQuery)) {
      try {
        const pair = extractCryptoPair(query);
        console.log('Crypto query detected, extracted pair:', pair, 'from query:', query);

        if (pair) {
          const coinGeckoId = getCoinGeckoId(pair.base);
          console.log('CoinGecko ID for', pair.base, 'is', coinGeckoId);

          if (coinGeckoId) {
            // Определяем валюту для запроса
            let vsCurrency = 'usd';
            if (pair.quote === 'USDT') vsCurrency = 'usd'; // USDT = USD в CoinGecko
            else if (pair.quote === 'EUR') vsCurrency = 'eur';
            else if (pair.quote === 'RUB') vsCurrency = 'rub';

            const cryptoResponse = await fetch(
              `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=${vsCurrency}&include_24hr_change=true`,
              {
                // fetch without proxy
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; WindexsAI/1.0)',
                  'Accept': 'application/json'
                }
              }
            );

            if (cryptoResponse.ok) {
              const cryptoData = await cryptoResponse.json();
              console.log('CoinGecko response:', cryptoData);

              if (cryptoData[coinGeckoId] && cryptoData[coinGeckoId][vsCurrency] !== undefined) {
                const data = cryptoData[coinGeckoId];
                const price = data[vsCurrency];
                const change24h = data[`${vsCurrency}_24h_change`];

                // СТРОГИЙ CRYPTO_PRICE КОНТРАКТ
                searchResults = `CRYPTO_PRICE
pair=${pair.base}/${pair.quote}
base=${pair.base}
quote=${pair.quote}
price=${price}
currency=${pair.quote === 'USDT' ? 'USD' : pair.quote}
as_of=${new Date().toISOString()}
change_24h=${change24h !== undefined ? change24h.toFixed(2) : 'null'}
source=coingecko
coingecko_id=${coinGeckoId}`;

                console.log('CRYPTO_PRICE result:', searchResults);
              } else {
                console.log('CoinGecko returned data but no price for', coinGeckoId, vsCurrency);
                searchResults = '[CRYPTO_PRICE_NOT_AVAILABLE]';
              }
            } else {
              console.error('CoinGecko API error:', cryptoResponse.status);
              searchResults = '[CRYPTO_PRICE_NOT_AVAILABLE]';
            }
          } else {
            console.log('Unknown token:', pair.base);
            searchResults = '[CRYPTO_PRICE_NOT_AVAILABLE]';
          }
        } else {
          console.log('Could not extract crypto pair from query:', query);
          searchResults = '[CRYPTO_PRICE_NOT_AVAILABLE]';
        }
      } catch (cryptoError) {
        console.error('Crypto search error:', cryptoError);
        searchResults = '[CRYPTO_PRICE_NOT_AVAILABLE]';
      }
    }

    // Проверяем результат крипты
    if (searchResults && searchResults.trim().length < 30) {
      searchResults = "";
    }

    // 2. Все остальные запросы идут через MCP сервер
    if (!searchResults || !searchResults.trim()) {
      try {
        console.log('🌐 All searches via MCP server for:', query);
        const mcpResponse = await fetch('http://localhost:8002/search', {
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
        // fetch without proxy
      });
      if (!wikiResponse.ok) {
        // Если русский не найден, пробуем английский
        wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`, {
          // fetch without proxy
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

    // Добавляем текущую дату сервера в начало результатов
    const now = new Date();
    const todayISO = now.toISOString();
    const todayHuman = now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (searchResults && searchResults.trim()) {
      searchResults =
        `АКТУАЛЬНАЯ ДАТА И ВРЕМЯ (SERVER): ${todayHuman} (${todayISO})\n\n` +
        searchResults;
    }

    // Возвращаем результаты или сообщение об отсутствии результатов
    const finalResult =
      searchResults && searchResults.trim()
        ? searchResults
        : '[NO_RESULTS_FOUND]';

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
        // fetch without proxy
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
        // fetch without proxy
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
      // fetch without proxy
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
      // fetch without proxy
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

// DeepSeek Chat API proxy
app.post("/api/chat", requireAuth, async (req, res) => {
  console.error("➡️ /api/chat hit", { requestId: req.body?.requestId, stream: req.body?.stream, userId: req.user?.id });

  // Таймаут на апстрим (рекомендуется, чтобы не получать подвисания и "fetch failed")
  const fetchWithTimeout = async (url, options, timeoutMs = 30000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error("upstream_timeout")), timeoutMs);
    try {
      const isOpenAI = url.includes('openai.com');
      const isDeepSeek = url.includes('deepseek.com');
      const fetchOptions = { ...options, signal: controller.signal };

      // TEMP: Always use proxy for testing
      if (proxyAgent) {
        fetchOptions.dispatcher = proxyAgent;
        console.error(`🌐 Using proxy for request to ${url}`);
      } else {
        console.error(`❌ No proxy agent available`);
      }

      return await fetch(url, fetchOptions);
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const {
      messages,
      model = "lite",
      stream = false,
      sessionId,
      requestId,
      requestType = "chat",      // chat | website_generation
      useWebSearch = false,      // NEW: жёсткий флаг из фронта
      max_tokens,                // NEW
      temperature,               // NEW
      response_format,           // NEW (опционально, если провайдер принимает)
    } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const actualUserId = req.user.id;

    // Decision-pass режим
    const isDecision = requestType === "decision";

    // Предпроверка баланса (до DeepSeek) - только для чата, не для decision
    const FEE = 1.0;
    if (requestType === "chat" && !isDecision) {
      const bal = DatabaseService.getUserBalance(actualUserId);
      if (bal < FEE) {
        return res.status(402).json({
          error: "Insufficient funds",
          details: "1 RUB required per chat response",
          balance: bal,
        });
      }
    }

    const lastMessage = messages?.[messages.length - 1];

    console.log(
      `🔥 API /chat | Provider: DeepSeek | Requested: ${model} | Stream: ${stream} | User: ${actualUserId} | Session: ${
        sessionId || "none"
      } | Messages: ${messages?.length || 0} | Last: "${lastMessage?.content?.substring(0, 100) || "none"}..."`
    );

    // WEB SEARCH: если useWebSearch=true ИЛИ требуется свежие данные
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    let webSearchResult = null;

    const mustUseWeb =
      useWebSearch === true ||
      requiresFreshData(lastUserMessage?.content);

    if (mustUseWeb && lastUserMessage?.content) {
      console.log('🌐 Web search triggered:', { useWebSearch, hasFreshData: requiresFreshData(lastUserMessage.content) });

      try {
        const resp = await fetch(`http://localhost/api/web-search?q=` +
          encodeURIComponent(lastUserMessage.content));

        if (resp.ok) {
          const data = await resp.json();
          webSearchResult = data.results;
        }
      } catch (e) {
        console.error('🌐 Web search error:', e);
        webSearchResult = null;
      }
    }

    // Market enrichment
    let enhancedMessages = messages;

    if (lastUserMessage && isMarketQuery(lastUserMessage.content)) {
      console.log("📊 Server: Market query detected, adding market data to context");
      const marketSnapshot = await getMarketSnapshot();

      const systemMessageIndex = messages.findIndex((m) => m.role === "system");
      if (systemMessageIndex >= 0) {
        enhancedMessages = [...messages];
        enhancedMessages[systemMessageIndex].content += `\n\nАКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`;
      } else {
        enhancedMessages = [
          {
            role: "system",
            content:
              `Ты полезный AI-ассистент. Используй предоставленные актуальные данные по Bitcoin для ответа на вопросы пользователя.` +
              `\n\nАКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`,
          },
          ...messages,
        ];
      }
    }

    // Web search enrichment
    if (webSearchResult) {
      if (webSearchResult === "[WEATHER_NOT_AVAILABLE]") {
        // БЛОКИРОВКА ГАЛЛЮЦИНАЦИЙ: НЕТ WEATHER_DATA - НЕТ ПРАВА ОПИСЫВАТЬ ПОГОДУ
        enhancedMessages = [
          {
            role: "system",
            content:
              "Сервер не смог получить актуальные погодные данные. " +
              "ЗАПРЕЩЕНО описывать погоду. " +
              "Сообщи пользователю о недоступности данных.",
          },
          ...enhancedMessages,
        ];
      } else if (webSearchResult === "[CRYPTO_PRICE_NOT_AVAILABLE]") {
        // БЛОКИРОВКА ГАЛЛЮЦИНАЦИЙ: НЕТ CRYPTO_PRICE - НЕТ ПРАВА УКАЗЫВАТЬ ЦЕНУ
        enhancedMessages = [
          {
            role: "system",
            content:
              "Сервер не смог получить актуальный курс криптовалюты. " +
              "ЗАПРЕЩЕНО придумывать цену. " +
              "Сообщи пользователю о недоступности данных.",
          },
          ...enhancedMessages,
        ];
      } else if (webSearchResult === "[NO_RESULTS_FOUND]") {
        enhancedMessages = [
          {
            role: "system",
            content:
              "СЕРВЕР НЕ СМОГ ПОЛУЧИТЬ АКТУАЛЬНЫЕ ДАННЫЕ.\n" +
              "ОБЪЯСНИ ПОЛЬЗОВАТЕЛЮ ОБ ЭТОМ КОРРЕКТНО И ДАЙ ПОЛЕЗНЫЕ РЕКОМЕНДАЦИИ.",
          },
          ...enhancedMessages,
        ];
      } else {
        enhancedMessages = [
          {
            role: "system",
            content:
`ИНТЕРНЕТ-ПОИСК ВКЛЮЧЕН ПОЛЬЗОВАТЕЛЕМ.

НИЖЕ ПРИВЕДЕНЫ АКТУАЛЬНЫЕ ДАННЫЕ ИЗ ИНТЕРНЕТА.

ИСПОЛЬЗУЙ ИХ В ОТВЕТЕ.



${webSearchResult}`,
          },
          ...enhancedMessages,
        ];
      }
    }

    // OpenAI only
    const apiProvider = "deepseek";
    const actualModel = MODEL;

    const priceInfo = getTokenPrices(actualModel);
    console.log(
      `🎯 Model Mapping | Requested: "${model}" → Actual: "${actualModel}" | Price: $${priceInfo.input}/1M in, $${priceInfo.output}/1M out | Stream: ${stream}`
    );

    const apiUrl = API_URL;
    const targetHost = new URL(apiUrl).hostname;

    // Функция для валидации и ограничения числовых параметров
    const clampNum = (v, min, max) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

    // Установка дефолтов в зависимости от типа запроса
    const defaultTemp = requestType === "website_generation" ? 0.2 : 0.7;
    const defaultMax = requestType === "website_generation" ? 7000 : 1200;

    // Таймаут для генерации сайтов (тяжелые запросы)
    const timeoutMs = requestType === "website_generation" ? 90000 : 30000;

    let proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null;
    let proxyHost = null;
    try { proxyHost = proxyUrl ? new URL(proxyUrl).hostname : null; } catch {}

    // Логируем прокси настройки
    console.log("🌐 Proxy env", {
      HTTPS_PROXY: process.env.HTTPS_PROXY || null,
      HTTP_PROXY: process.env.HTTP_PROXY || null,
      ALL_PROXY: process.env.ALL_PROXY || null,
      NO_PROXY: process.env.NO_PROXY || null,
      proxyUrlConfigured: !!proxyUrl,
      proxyHost,
      targetHost,
    });

    try {
      // до fetch — быстрый lookup в том же процессе
      const addrs = await dns.lookup(targetHost, { all: true });
      console.log("✅ DNS upstream", { targetHost, addrs });
      if (proxyHost) {
        const paddrs = await dns.lookup(proxyHost, { all: true });
        console.log("✅ DNS proxy", { proxyHost, paddrs });
      }
    } catch (e) {
      console.error("❌ DNS precheck failed", { message: e.message, code: e.code });
    }

    // Логируем фактические параметры для диагностики
    console.log("🧾 Upstream params", {
      requestType,
      actualModel,
      stream,
      temperature: clampNum(temperature, 0, 1) ?? defaultTemp,
      max_tokens: clampNum(max_tokens, 128, 8000) ?? defaultMax,
      hasResponseFormat: !!response_format,
    });

    // Decision-pass ветка (перед основным API вызовом)
    if (isDecision) {
      const decisionResp = await fetchWithTimeout(
        apiUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          },
          // Используем прокси для DeepSeek через fetchWithTimeout
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: DECISION_SYSTEM_PROMPT,
              },
              ...messages.slice(-1), // только последний user message
            ],
            temperature: 0.0,
            max_tokens: 300,
          }),
        },
        15000
      );

      if (!decisionResp.ok) {
        const errorText = await decisionResp.text();
        console.error(`❌ Decision API Error | Status: ${decisionResp.status} | Error: ${errorText}`);
        return res.status(decisionResp.status).json({
          error: "Decision API error",
          details: errorText,
        });
      }

      const data = await decisionResp.json();
      const raw = data?.choices?.[0]?.message?.content || "{}";

      let decision;
      try {
        decision = JSON.parse(raw);
      } catch {
        decision = { need_web: false };
      }

      return res.json(decision);
    }

    let apiResponse;
    try {
      apiResponse = await fetchWithTimeout(
        apiUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          },
          // Прокси обрабатывается внутри fetchWithTimeout
          body: JSON.stringify({
            model: actualModel,
            messages: enhancedMessages,
            stream,
            temperature: clampNum(temperature, 0, 1) ?? defaultTemp,
            max_tokens: clampNum(max_tokens, 128, 8000) ?? defaultMax,
            // response_format прокидываем только если пришёл (и если DeepSeek у вас это реально принимает)
            ...(response_format ? { response_format } : {}),
          }),
        },
        timeoutMs
      );
    } catch (err) {
      // Диагностика сетевых причин (DNS/IPv6/proxy/TLS)
      const cause = err?.cause || {};
      console.error("❌ DeepSeek upstream fetch THROW", {
        message: err?.message,
        name: err?.name,
        cause,
        code: err?.cause?.code,
        stack: err?.stack,
      });
      return res.status(502).json({
        error: "OpenAI upstream fetch failed",
        details: err?.message || "fetch failed",
        cause: cause?.code || cause?.message || null,
        // самое важное для диагностики:
        failedHost: cause?.hostname || null,
        targetHost,
        proxyHost,
        proxyUrlConfigured: !!proxyUrl,
      });
    }

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => "");
      console.error(
        `❌ OpenAI API Error | Status: ${apiResponse.status} ${apiResponse.statusText} | Model: ${actualModel} | Error: ${errorText.substring(
          0,
          500
        )}`
      );
      return res.status(apiResponse.status).json({
        error: "OpenAI API error",
        details: errorText,
      });
    }

    // Списание комиссии после успешного ответа от API - только для чата, не для decision
    if (requestType === "chat" && !isDecision) {
      const ref =
        requestId ||
        `chat_${actualUserId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const charge = DatabaseService.chargeChatFee1Rub(actualUserId, ref);
      if (!charge.ok) {
        return res.status(402).json({
          error: "Insufficient funds",
          details: "1 RUB required per chat response",
          balance: charge.balance ?? 0,
        });
      }
    }

    if (stream) {
      // Stream passthrough
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const body = apiResponse.body;
      if (!body) {
        res.write(`data: ${JSON.stringify({ error: "upstream_no_body" })}\n\n`);
        return res.end();
      }

      const decoder = new TextDecoder();
      let usageInfo = null;

      const handleChunk = (chunkStr) => {
        res.write(chunkStr);

        // Best-effort: usage extraction (depends on provider stream format)
        if (chunkStr.includes('"usage"')) {
          try {
            const lines = chunkStr.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line.includes('"usage"')) {
                const jsonStr = line.slice(6);
                const parsed = JSON.parse(jsonStr);
                if (parsed.usage) usageInfo = parsed.usage;
              }
            }
          } catch {}
        }
      };

      try {
        if (typeof body.getReader === "function") {
          const reader = body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            handleChunk(decoder.decode(value, { stream: true }));
          }
        } else if (typeof body.on === "function") {
          await new Promise((resolve, reject) => {
            body.on("data", (buf) => handleChunk(buf.toString("utf8")));
            body.on("end", resolve);
            body.on("error", reject);
          });
        } else {
          throw new Error("Unsupported apiResponse.body stream type");
        }

        // cost + db write
        if (usageInfo) {
          const prices = getTokenPrices(actualModel);
          const inputTokens = usageInfo.prompt_tokens || 0;
          const outputTokens = usageInfo.completion_tokens || 0;
          const totalTokens = usageInfo.total_tokens || inputTokens + outputTokens;
          const inputCost = (inputTokens / 1_000_000) * prices.input;
          const outputCost = (outputTokens / 1_000_000) * prices.output;
          const totalCost = inputCost + outputCost;

          const tokenCostData = {
            inputTokens,
            outputTokens,
            totalTokens,
            inputCost,
            outputCost,
            totalCost,
            model: actualModel,
            provider: apiProvider,
            currency: "USD",
          };

          res.write(`data: ${JSON.stringify({ tokenCost: tokenCostData })}\n\n`);

          try {
            DatabaseService.recordApiUsage(
              actualUserId,
              sessionId || null,
              actualModel,
              inputTokens,
              outputTokens,
              totalCost,
              requestType
            );
          } catch (dbError) {
            console.error("❌ DB Error [Stream Usage]:", dbError);
          }
        }
      } catch (e) {
        console.error("❌ Stream proxy failed:", e?.stack || e);
        try {
          res.write(`data: ${JSON.stringify({ error: "stream_proxy_failed" })}\n\n`);
        } catch {}
      } finally {
        res.end();
      }
      return;
    }

    // Non-stream JSON
    const data = await apiResponse.json();

    const content = data?.choices?.[0]?.message?.content || "";

    console.log("finish_reason:", data?.choices?.[0]?.finish_reason);
    console.log("content_len:", content.length);
    console.log("content_head:", content.slice(0, 120));
    console.log("content_tail:", content.slice(-120));

    if (data.usage) {
      const prices = getTokenPrices(actualModel);
      const inputTokens = data.usage.prompt_tokens || 0;
      const outputTokens = data.usage.completion_tokens || 0;
      const totalTokens = data.usage.total_tokens || inputTokens + outputTokens;
      const inputCost = (inputTokens / 1_000_000) * prices.input;
      const outputCost = (outputTokens / 1_000_000) * prices.output;
      const totalCost = inputCost + outputCost;

      data.tokenCost = {
        inputTokens,
        outputTokens,
        totalTokens,
        inputCost,
        outputCost,
        totalCost,
        model: actualModel,
        currency: "USD",
        provider: apiProvider, // фикс
      };

      try {
        console.log(
          `📊 API Usage [NON-STREAM] | Provider: DeepSeek | User: ${actualUserId} | Model: ${actualModel} | Session: ${
            sessionId || "none"
          } | Tokens: ${inputTokens} in + ${outputTokens} out = ${totalTokens} | Cost: $${totalCost.toFixed(6)}`
        );

        DatabaseService.recordApiUsage(
          actualUserId,
          sessionId || null,
          actualModel,
          inputTokens,
          outputTokens,
          totalCost,
          requestType
        );
      } catch (dbError) {
        console.error("❌ DB Error [Non-Stream Usage]:", dbError);
      }
    }

    return res.json(data);
  } catch (error) {
    console.error("❌ Chat API Proxy Error", {
      model: req.body?.model,
      stream: req.body?.stream,
      message: error?.message,
      cause: error?.cause,
      stack: error?.stack,
    });

    res.status(500).json({
      error: "Failed to process chat request",
      details: error?.message || "unknown_error",
      cause: error?.cause?.code || error?.cause?.message || null,
    });
  }
});

// TTS functionality removed - using only DeepSeek models

// === Website Execution API ===

// Planner: генерирует план шагов для создания сайта
// Детерминированный план - всегда одинаковый для надежности
export function makeTitleFromPrompt(prompt) {
  return String(prompt || "Website")
    .replace(/["']/g, "")        // убираем кавычки
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Website";
}

export async function planWebsite(prompt) {
  console.log(`📋 PlanWebsite called | Prompt: "${prompt?.substring(0, 100) || 'none'}..."`);

  try {
    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      throw new Error(`Invalid prompt: ${typeof prompt}`);
    }

    console.log(`🔧 Creating title from prompt...`);
    const title = makeTitleFromPrompt(prompt);
    console.log(`✅ Title created: "${title}"`);

    const result = {
      title: title,
      deps: {},
      steps: [
        { id: "index",  tool: "create_file", file: "index.html",  description: "Главная страница" },
        { id: "styles", tool: "create_file", file: "styles.css",  description: "Стили" },
        { id: "app",    tool: "create_file", file: "app.js",      description: "JavaScript логика" },
      ],
    };

    console.log(`✅ PlanWebsite success | Title: "${result.title}" | Steps: ${result.steps.length}`);
    return result;
  } catch (e) {
    console.error(`❌ PlanWebsite failed | Error: ${e?.message || String(e)}`);
    console.error(`❌ PlanWebsite stack:`, e?.stack);
    throw e;
  }
}

// Executor: выполняет отдельный шаг
async function executeStep(step, context = {}) {
  if (step.tool === "create_file") {
    const content = await generateFile(step.file, context, context.signal);
    return { file: { name: step.file, content } };
  }
  throw new Error(`Unknown tool: ${step.tool}`);
}

// Генератор файла: создает содержимое файла через LLM
async function generateFile(filename, context = {}, outerSignal) {
  console.log(`🎨 Starting generateFile for ${filename}`);
  const { plan, prompt, generatedFiles = {} } = context;

  // Создаем специфичный промт для каждого типа файла
  let systemPrompt;
  let userPrompt;

  const indexHtml = generatedFiles["/index.html"] || "";

  if (filename === "index.html") {
    console.log(`📝 Creating HTML prompt for index.html, prompt length: ${prompt?.length}`);
    systemPrompt = `Создай один HTML-файл одностраничного сайта премиум-класса по теме: «${prompt}».
Требования:
Верни ТОЛЬКО HTML-код (без markdown/пояснений).
Валидный HTML5: <!doctype html>, lang, meta charset, meta viewport.
Подключи styles.css и app.js (defer).
Семантика: header, main, section, footer. Один h1, далее h2.
Без внешних CDN/шрифтов/картинок; используй inline SVG и CSS-градиенты. Должно работать в iframe sandbox.
Структура (обязательные id и атрибуты):
- header#site-header: nav#primary-nav с ul.nav-menu, кнопка #theme-toggle и кнопка #nav-toggle (aria-expanded="false").
- section#hero: .hero-grid (2 колонки). Слева: заголовок h1, описание, .hero-cta (.btn.primary, .btn.ghost), .hero-badges (3+ бейджа). Справа: .hero-art с тематическим сложным inline SVG.
- section#features: .features-grid из 6+ карточек .card (тематическая SVG иконка + h3 + текст).
- section#showcase (Продукция/Табы): контейнер .tab-buttons с кнопками .tab[data-tab="ID"] и панели .tab-panel[id="ID"]. Внутри панелей — .product-grid из карточек .product-card (h4, описание, .price, .btn[data-order="Название"]).
- section#pricing: .pricing-grid из 3 тарифов, кнопка .btn[data-order="Тариф"].
- section#faq (Аккордеон): .accordion с .accordion-item > .accordion-trigger (button, aria-expanded="false") + .accordion-content.
- section#contact: form#contact-form (name, email, select#topic, textarea#message, checkbox[name="consent"]) + div#form-status.
- footer#site-footer.
- button#to-top и div#toast.
Контент — ОЧЕНЬ конкретный под запрос пользователя, «вау» копирайтинг.`;
    userPrompt = `Создай HTML для премиального сайта: ${prompt}`;

  } else if (filename === "styles.css") {
    systemPrompt = `Создай премиальный CSS-слой для сайта по теме «${prompt}».
Используй ПРЕДОСТАВЛЕННЫЙ HTML ниже для выбора селекторов.
Верни ТОЛЬКО CSS-код (без markdown/пояснений).

:ROOT СИСТЕМА:
--bg:#0b1220; --panel:rgba(255,255,255,.08); --panel-strong:rgba(255,255,255,.12); --text:#eaf1ff; --muted:rgba(234,241,255,.72); --border:rgba(234,241,255,.14);
--primary:#4f8cff; --primary2:#8a5cff; --accent:#35d07f;
--radius:16px; --radius-sm:12px;
--shadow: 0 12px 40px rgba(0,0,0,.35); --shadow-soft: 0 8px 24px rgba(0,0,0,.22);
--maxw: 1120px;
--s-1: 8px; --s-2: 12px; --s-3: 16px; --s-4: 24px; --s-5: 32px; --s-6: 48px;
--t-fast: .18s ease; --t: .28s ease;

ОСНОВНЫЕ СТИЛИ:
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--text); background: radial-gradient(1200px 600px at 10% -10%, rgba(79,140,255,.35), transparent 60%), radial-gradient(900px 520px at 100% 0%, rgba(138,92,255,.28), transparent 55%), radial-gradient(900px 520px at 20% 110%, rgba(53,208,127,.18), transparent 55%), var(--bg);}
body.no-scroll{overflow:hidden}
a{color:inherit; text-decoration:none}
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible{outline:2px solid rgba(79,140,255,.75); outline-offset:2px;}
main > section{padding: clamp(36px, 5vw, 72px) 16px;}
.container{max-width: var(--maxw); margin: 0 auto;}

HEADER/NAV: sticky top:0, glassmorphism backdrop-filter: blur(14px), класс .scrolled с более тёмным фоном.
#primary-nav: flex между .nav-menu и кнопками.
.nav-menu: flex gap:12px, ссылки с padding/border-radius/hover эффектами.
#theme-toggle, #nav-toggle: кнопки с border/background/hover.

КНОПКИ: .btn с glassmorphism, .primary с градиентом и тенью, .ghost прозрачный, .small для карточек.

HERO: .hero-grid grid-template-columns: 1.2fr .8fr, gap clamp, каждый div с glassmorphism.
.hero-cta flex gap, .hero-badges flex с бейджами.
.hero-art svg width:100%.

FEATURES: .features-grid grid-template-columns: repeat(3, 1fr), gap:16px.
.card: glassmorphism, hover transform: translateY(-3px).

ТАБЫ: .tab-buttons flex gap:10px, .tab glassmorphism, .active градиент.
.tab-panel{display:none; opacity:0; transform: translateY(6px); transition: opacity var(--t), transform var(--t);}
.tab-panel.active{display:block; opacity:1; transform: translateY(0);}

PRODUCTS: .product-grid grid-template-columns: repeat(3, 1fr), .product-card glassmorphism.

PRICING: .pricing-grid repeat(3, 1fr), второй карточка с градиентом.

FAQ: .accordion grid gap:12px, .accordion-item glassmorphism, .accordion-trigger width:100%, .accordion-content padding.

CONTACT: #contact-form grid-template-columns: 1fr 1fr, gap:12px, glassmorphism.
button[type="submit"] grid-column: 1 / -1.

FOOTER: padding, color muted, border-top.

TOAST/#to-top: fixed позиция, opacity:0 по умолчанию, .show/.visible opacity:1.

RESPONSIVE: @media (max-width: 980px) 2 колонки, @media (max-width: 768px) мобильное меню nav-menu.nav-open fixed inset:0.

ФАКТИЧЕСКИЙ HTML ДЛЯ СТИЛИЗАЦИИ:
${indexHtml || "HTML еще не сгенерирован"}`;
    userPrompt = `Создай премиальный CSS-слой: ${prompt}`;

  } else if (filename === "app.js") {
    systemPrompt = `Создай защищенный JavaScript enhancement для сайта по теме «${prompt}».
Используй ПРЕДОСТАВЛЕННЫЙ HTML ниже для поиска ID и классов.
Верни ТОЛЬКО JS-код (без markdown/пояснений).

((() => {
  "use strict";

  const on = (el, type, cb) => { if (el) el.addEventListener(type, cb); };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const navToggle = $("#nav-toggle");
  const navMenu = $(".nav-menu");
  const themeToggle = $("#theme-toggle");
  const html = document.documentElement;
  const header = $("#site-header");
  const toTopButton = $("#to-top");
  const contactForm = $("#contact-form");
  const formStatus = $("#form-status");
  const toast = $("#toast");

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };

  // ===== Nav mobile =====
  const closeMenu = () => {
    if (!navMenu) return;
    navMenu.classList.remove("nav-open");
    document.body.classList.remove("no-scroll");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  };

  on(navToggle, "click", () => {
    if (!navMenu) return;
    const open = !navMenu.classList.contains("nav-open");
    navMenu.classList.toggle("nav-open", open);
    document.body.classList.toggle("no-scroll", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  $$(".nav-menu a[href^='#']").forEach((a) => on(a, "click", () => closeMenu()));

  // ===== Theme =====
  const applyTheme = (t) => {
    if (t === "dark") html.setAttribute("data-theme", "dark");
    else html.removeAttribute("data-theme");
  };

  on(themeToggle, "click", () => {
    const isDark = html.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
    showToast(next === "dark" ? "Тёмная тема включена" : "Светлая тема включена");
  });

  // restore theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) applyTheme(savedTheme);

  // ===== Smooth scroll (anchors) =====
  $$("#primary-nav a[href^='#']").forEach((a) => {
    on(a, "click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = $(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // ===== Tabs =====
  const tabs = $$(".tab");
  const panels = $$(".tab-panel");

  const setActiveTab = (id) => {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    panels.forEach((p) => p.classList.toggle("active", p.id === id));
  };

  if (tabs.length && panels.length) {
    // init: если ни один panel не активен — активируем первый таб
    const initial = panels.find((p) => p.classList.contains("active"))?.id || tabs[0].dataset.tab;
    if (initial) setActiveTab(initial);

    tabs.forEach((tab) => {
      on(tab, "click", () => {
        const id = tab.dataset.tab;
        if (!id) return;
        setActiveTab(id);
      });
    });
  }

  // ===== Order buttons -> fill form + scroll =====
  const messageTextarea = $("#message");
  const contactSection = $("#contact");

  $$("[data-order]").forEach((btn) => {
    on(btn, "click", () => {
      const name = btn.getAttribute("data-order") || "Запрос";
      if (messageTextarea) messageTextarea.value = \`Интересует: \${name}. Нужна консультация по покупке/подписке.\`;
      if (contactSection) contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(\`Ок: \${name}. Заполните форму — мы свяжемся.\`);
    });
  });

  // ===== Accordion =====
  $$(".accordion-trigger").forEach((trigger) => {
    on(trigger, "click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
    });
  });

  // ===== Scroll UX =====
  window.addEventListener("scroll", () => {
    const y = window.scrollY || 0;

    if (header) header.classList.toggle("scrolled", y > 20);
    if (toTopButton) toTopButton.classList.toggle("visible", y > 420);
  });

  on(toTopButton, "click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ===== Form =====
  on(contactForm, "submit", (e) => {
    e.preventDefault();
    if (!contactForm) return;

    const required = $$("input[required], select[required], textarea[required]", contactForm);
    const consent = $("input[name='consent']", contactForm);

    let ok = true;
    required.forEach((el) => {
      const v = (el.value || "").trim();
      if (!v) ok = false;
    });
    if (consent && !consent.checked) ok = false;

    if (!ok) {
      if (formStatus) formStatus.textContent = "Пожалуйста, заполните обязательные поля и согласие.";
      showToast("Проверьте форму: обязательные поля не заполнены.");
      return;
    }

    if (formStatus) formStatus.textContent = "Заявка принята. Мы свяжемся с вами в ближайшее время.";
    showToast("Спасибо! Заявка отправлена.");
    contactForm.reset();
  });
})());

ФАКТИЧЕСКИЙ HTML ДЛЯ ОБРАБОТКИ:
${indexHtml || "HTML еще не сгенерирован"}`;
    userPrompt = `Создай защищенный JS enhancement: ${prompt}`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  if (!systemPrompt) {
    throw new Error(`Unknown file type: ${filename}`);
  }

  // ✅ Таймауты на файл (чтобы не висеть бесконечно на стороне OpenAI)
  const stepTimeoutMs = 180_000; // 180 секунд на любой файл

  const ac = new AbortController();
  const t = setTimeout(() => {
    try { ac.abort(new Error(`OpenAI timeout for ${filename}`)); } catch {}
  }, stepTimeoutMs);

  // ✅ Склеиваем abort: если клиент отключился — рвём запрос
  if (outerSignal) {
    if (outerSignal.aborted) ac.abort();
    outerSignal.addEventListener("abort", () => {
      try { ac.abort(); } catch {}
    }, { once: true });
  }

  try {
    const fetchOptions = {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        ...ARTIFACT_PARAMS
      }),
      signal: ac.signal,
    };

    console.log(`🚀 Making DeepSeek API call for ${filename}`);
    console.log(`📋 API Request details:`, {
      model: MODEL,
      messages: messages.length,
      temperature: ARTIFACT_PARAMS.temperature,
      max_tokens: ARTIFACT_PARAMS.max_tokens
    });

    let resp;
    try {
      resp = await fetch(API_URL, fetchOptions).finally(() => {
      clearTimeout(t);
    });
      console.log(`📡 API Response status: ${resp.status} ${resp.statusText}`);
    } catch (fetchError) {
      clearTimeout(t);
      console.error(`❌ Fetch failed for ${filename}:`, fetchError);
      throw new Error(`OpenAI fetch failed for ${filename}: ${fetchError?.name === "AbortError" ? "timeout" : (fetchError?.message || fetchError)}`);
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      throw new Error(`OpenAI API error for ${filename}: ${resp.status} ${errorText.slice(0, 500)}`);
    }

    const data = await resp.json();
    let content = data?.choices?.[0]?.message?.content;

    if (!content) throw new Error(`Failed to generate ${filename}`);

    console.log(`✅ OpenAI API call completed for ${filename}, content length: ${content.length}`);

    // нормальная вырезка ```...```
    if (content.includes("```")) {
      const m = content.match(/```(?:html|css|javascript|js)?\n?([\s\S]*?)\n?```/i);
      if (m) content = m[1];
    }

    return String(content).trim();
  } catch (e) {
    console.error(`❌ generateFile failed for ${filename}:`, e?.message || String(e));
    throw new Error(`Failed to generate ${filename}: ${e?.message || String(e)}`);
  }
}

// --- helpers for website execution ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Template rendering (mini-mustache)
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

function renderTpl(tpl, ctx) {
  let out = String(tpl);

  // sections arrays: {{#items}}...{{/items}}
  const sectionRe = /{{#\s*([a-zA-Z0-9_.-]+)\s*}}([\s\S]*?){{\/\s*\1\s*}}/g;
  out = out.replace(sectionRe, (_, key, inner) => {
    const val = getPath(ctx, key);
    if (Array.isArray(val)) {
      return val.map((item) => {
        const localCtx =
          item && typeof item === "object"
            ? { ...ctx, ...item }
            : { ...ctx, ".": item };
        return renderTpl(inner, localCtx);
      }).join("");
    }
    return val ? renderTpl(inner, ctx) : "";
  });

  // vars: {{a.b}} or {{.}}
  const varRe = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
  out = out.replace(varRe, (_, key) => escapeHtml(getPath(ctx, key) ?? ""));

  return out;
}

// Deterministic template selection
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickTemplate(templates, prompt, sessionId) {
  const seed = fnv1a(`${sessionId}|${prompt}`);
  return templates[seed % templates.length];
}

// Extract JSON from LLM response
function extractJsonMaybe(s) {
  if (!s) return null;
  const txt = String(s);
  const m = txt.match(/```json\s*([\s\S]*?)```/i) || txt.match(/```([\s\S]*?)```/);
  return (m ? m[1] : txt).trim();
}

// Generate content JSON using DeepSeek
async function generateWebsiteContentJson(prompt) {
  const systemPrompt = `
Ты генерируешь ТОЛЬКО валидный JSON (без markdown, без пояснений).
Язык: русский. Никаких внешних ссылок/картинок/шрифтов/CDN.

Схема JSON (строго):
{
  "brand": "string",
  "tagline": "string",
  "hero": {
    "title": "string",
    "subtitle": "string",
    "primaryCta": "string",
    "secondaryCta": "string",
    "badges": ["string","string","string"]
  },
  "features": [
    {"icon":"string","title":"string","text":"string"},
    ... (ровно 6)
  ],
  "tabs": [
    {"id":"services","label":"string","cards":[{"title":"string","text":"string","meta":"string"}, ... (3)]},
    {"id":"cases","label":"string","cards":[... (3)]},
    {"id":"reviews","label":"string","cards":[... (3)]}
  ],
  "pricing": [
    {"name":"string","price":"string","bullets":["string","string","string"],"featured":false},
    {"name":"string","price":"string","bullets":["..."],"featured":true},
    {"name":"string","price":"string","bullets":["..."],"featured":false}
  ],
  "faq": [
    {"q":"string","a":"string"},
    ... (5)
  ],
  "contact": {
    "phone":"string",
    "email":"string",
    "address":"string",
    "hours":"string"
  },
  "seo": {
    "title":"string",
    "description":"string"
  }
}

Ограничения:
- коротко, "по делу": title до 60 символов, description до 150.
- meta в cards: например "от 1 500 ₽ / 60 мин / гарантия 6 мес" — строкой.
- phone/email могут быть плейсхолдерами, но реалистично.
`.trim();

  const userPrompt = `Тематика сайта: ${prompt}. Сгенерируй контент по схеме.`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 300000); // Увеличено до 5 минут для генерации контента

  const resp = await fetchWithOptionalProxy(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.8,
      max_tokens: 2000, // Увеличено для полного контента
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: ac.signal
  }).finally(() => clearTimeout(t));

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`DeepSeek API error (content.json): ${resp.status} ${txt.slice(0, 500)}`);
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content;
  const jsonText = extractJsonMaybe(raw);

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Invalid content.json from model: ${String(e?.message || e)}`);
  }
}

// Load website templates from disk
function loadWebsiteTemplates() {
  const base = path.resolve(process.cwd(), "website_templates");

  const loadPack = (name) => {
    const dir = path.join(base, name);
    return {
      name,
      indexHtmlTpl: fs.readFileSync(path.join(dir, "index.html.tpl"), "utf-8"),
      stylesCssTpl: fs.readFileSync(path.join(dir, "styles.css.tpl"), "utf-8"),
      appJs: fs.readFileSync(path.join(dir, "app.js"), "utf-8"),
    };
  };

  return ["aurora", "mono", "editorial"].map(loadPack);
}

function minifyHtml(s) {
  return String(s).replace(/>\s+</g, "><").trim();
}
function minifyCss(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .trim();
}
function minifyJs(s) {
  // безопасная минификация без удаления комментариев (чтобы не ломать строки/regex)
  return String(s)
    .split("\n")
    .map(l => l.trimEnd())
    .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))
    .join("\n")
    .trim();
}

async function createArtifactWithRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (e) {
      const msg = e?.message || String(e);
      if (!/SQLITE_BUSY|database is locked/i.test(msg) || i === attempts - 1) throw e;
      console.warn(`⚠️ SQLITE_BUSY, retry ${i + 1}/${attempts}...`);
      await sleep(150 * (i + 1));
    }
  }
}

// Website execution endpoint с streaming
app.post("/api/website/execute", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Пробиваем буферизацию на уровне сокета
  req.socket.setTimeout(0);
  res.socket?.setTimeout?.(0);
  res.socket?.setNoDelay?.(true);

  const { prompt, sessionId } = req.body || {};

  const PAD = " ".repeat(4096); // 4KB padding для heartbeat

  const writeLine = (line) =>
    new Promise((resolve) => {
      try {
        const ok = res.write(line);
        if (ok) return resolve(true);
        res.once("drain", () => resolve(true));
      } catch {
        resolve(false);
      }
    });

  const send = async (event) => {
    if (res.writableEnded) return;
    await writeLine(JSON.stringify(event) + "\n");
    // Пробиваем буферы прокси/браузера
    await writeLine(PAD + "\n");
    res.flush?.();
  };

  const fail = async (msg) => {
    await send({ type: "fatal", error: msg });
    clearInterval(pingTimer);
    res.end();
  };

  const pingTimer = setInterval(() => {
    send({ type: "ping", ts: Date.now() });
  }, 15000); // Каждый 15 секунд

  try {
    await send({ type: "ping", ts: Date.now() });

    // 1️⃣ Шаг: План и выбор шаблона
    await send({ type: "step_start", id: "plan", label: "Формирую план сайта" });

    const templates = loadWebsiteTemplates();
    const template = pickTemplate(templates, prompt, sessionId);
    console.log(`🎨 Selected template: ${template.name}`);

    await send({ type: "step_done", id: "plan" });

    // 2️⃣ Шаг: Генерация контента
    await send({ type: "step_start", id: "content", label: "Генерирую контент" });

    let content;
    try {
      content = await generateWebsiteContentJson(prompt);
      console.log(`📝 Content generated for brand: ${content.brand}`);
    } catch (err) {
      console.error("❌ Content generation failed:", err);
      return fail(`Ошибка генерации контента: ${err.message}`);
    }

    await send({ type: "step_done", id: "content" });

    // Подготовка view-model с гарантированными id табов
    const vm = {
      ...content,
      year: new Date().getFullYear(),
      tabs: [
        { id: "services", ...(content.tabs?.find(t => t.id === "services") || content.tabs?.[0] || {}), idFixed: "services" },
        { id: "cases", ...(content.tabs?.find(t => t.id === "cases") || content.tabs?.[1] || {}), idFixed: "cases" },
        { id: "reviews", ...(content.tabs?.find(t => t.id === "reviews") || content.tabs?.[2] || {}), idFixed: "reviews" },
      ].map((t, idx) => ({
        ...t,
        id: ["services","cases","reviews"][idx],
        label: t.label || `Вкладка ${idx + 1}`
      }))
    };

    // 3️⃣ Шаг: Рендеринг файлов
    await send({ type: "step_start", id: "render", label: "Создаю страницы" });

    const files = {};
    try {
      files["/index.html"] = renderTpl(template.indexHtmlTpl, vm);
      files["/styles.css"] = renderTpl(template.stylesCssTpl, vm);
      files["/app.js"] = template.appJs;

      console.log(`✅ Files rendered: HTML ${files["/index.html"].length} chars, CSS ${files["/styles.css"].length} chars`);
    } catch (err) {
      console.error("❌ Template rendering failed:", err);
      return fail(`Ошибка рендеринга шаблона: ${err.message}`);
    }

    await send({ type: "step_done", id: "render" });

    // 4️⃣ Сохраняем
    await send({ type: "step_start", id: "save", label: "Сохраняю сайт" });

    try {
      // 1) обязательные файлы
      const required = ["/index.html", "/styles.css", "/app.js"];
      const missing = required.filter(p => !files[p] || !String(files[p]).trim());
      if (missing.length) {
        throw new Error(`Missing required files: ${missing.join(", ")}`);
      }

      // 2) лимит размера (как у вас в /api/artifacts)
      const maxSize = 400 * 1024; // 400KB
      const sizeOf = (obj) => Object.values(obj).reduce((s, v) => s + String(v).length, 0);

      let totalSize = sizeOf(files);
      console.log(`📦 Initial total size: ${Math.round(totalSize / 1024)}KB`);

      // 3) если жирно — минифицируем (дёшево и эффективно)
      if (totalSize > maxSize) {
        console.log(`⚠️ Artifact too large (${Math.round(totalSize / 1024)}KB), minifying...`);
        files["/index.html"] = minifyHtml(files["/index.html"]);
        files["/styles.css"] = minifyCss(files["/styles.css"]);
        files["/app.js"] = minifyJs(files["/app.js"]);

        const after = sizeOf(files);
        console.log(`📦 Size after minify: ${Math.round(after / 1024)}KB`);
        
        if (after > maxSize) {
          throw new Error(
            `Artifact too large: ${Math.round(totalSize / 1024)}KB (after minify ${Math.round(after / 1024)}KB). Max 400KB. ` +
            `Решение: снижайте max_tokens/упрощайте промпты генерации.`
          );
        }
        totalSize = after;
      }

      // 4) безопасные дефолты
      const safeTitle = content?.seo?.title && String(content.seo.title).trim() ? content.seo.title : content?.brand || "Website";

      // 5) ретрай на SQLITE_BUSY + подробная диагностика
      const artifactId = await createArtifactWithRetry(() =>
        DatabaseService.createArtifact(
        parseInt(sessionId),
          "website",
          safeTitle,
        files,
          null
        )
      );

      console.log(`✅ Artifact saved with ID: ${artifactId}`);
      await send({ type: "step_done", id: "save" });

      // ✅ Успешно
      await send({ type: "done", artifactId });
      clearInterval(pingTimer);
      res.end();
  } catch (e) {
    const msg = e?.message || String(e);
      // Если DatabaseService предоставляет getLastError, используем его
      const lastDb = typeof DatabaseService.getLastError === 'function' ? DatabaseService.getLastError() : null;
      const full = lastDb ? `${msg} | DB: ${lastDb}` : msg;

      console.error("❌ SAVE failed:", e);
      if (lastDb) console.error("❌ DB last error:", lastDb);

      await send({ type: "step_error", id: "save", error: full });
      await send({ type: "fatal", error: full });
    clearInterval(pingTimer);
    res.end();
  }
  } catch (e) {
    console.error("❌ Fatal error:", e);
    fail("Непредвиденная ошибка генерации сайта");
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Заглушка для RUM (Real User Monitoring) - предотвращает 404 ошибки
app.get('/rum', (req, res) => {
  res.status(204).end(); // No Content
});

// GET /api/users/:id/balance
app.get("/api/users/:id/balance", requireAuth, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // Проверяем, что пользователь запрашивает свой баланс
    if (userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
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
app.post("/api/users/:id/deduct-tokens", requireAuth, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // Проверяем, что пользователь списывает со своего счета
    if (userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      deepseek_key_configured: !!DEEPSEEK_API_KEY,
      openai_key_configured: !!OPENAI_API_KEY,
    },
    database: {
      initialized: true
    }
  });
});

// OpenAI STT (Whisper) endpoint - uses proxy as requested
app.post('/api/audio/transcriptions', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    // В реальном сценарии здесь должен быть multer для обработки файлов.
    // Пока создаем прокси-запрос к OpenAI с использованием прокси-агента.
    console.log('🎤 STT Request received (OpenAI Whisper)');
    
    // Это скелет эндпоинта, так как для полноценной работы нужен multer.
    // Но здесь мы настраиваем использование прокси для OpenAI.
    return res.status(501).json({ 
      error: "STT implementation requires file upload handling (multer)",
      proxy_configured: !!proxyAgent 
    });
  } catch (error) {
    console.error('STT error:', error);
    res.status(500).json({ error: 'STT failed' });
  }
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
        deepseek_key: DEEPSEEK_API_KEY ? 'configured' : 'missing',
        deepseek_key_prefix: DEEPSEEK_API_KEY ? DEEPSEEK_API_KEY.substring(0, 10) + '...' : null,
        openai_key: OPENAI_API_KEY ? 'configured' : 'missing',
        openai_key_prefix: OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 10) + '...' : null,
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

// Debug endpoint for checking authentication state
app.get('/api/debug-auth', (req, res) => {
  res.json({
    message: 'Check browser console for localStorage debug info',
    instructions: 'Open browser dev tools and check Application > Local Storage',
    server_time: new Date().toISOString()
  });
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

// Глобальный JSON error handler для /api (обязателен)
app.use("/api", (err, req, res, next) => {
  console.error("❌ Unhandled API error:", err?.stack || err);
  if (res.headersSent) return next(err);
  return res.status(500).json({
    error: "internal_error",
    message: err?.message || "Unknown error",
  });
});

// RUM beacon fallback (prevents noisy 404 in console)
app.get("/rum", (req, res) => res.status(204).end());
app.post("/rum", (req, res) => res.status(204).end());
app.all(/^\/rum(\/.*)?$/, (req, res) => res.status(204).end());

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route works' });
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Add no-cache headers for index.html to ensure fresh JS loading
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// SPA fallback - all non-API routes should return index.html
app.use((req, res, next) => {
  // Skip API routes - let them be handled by specific routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // For all other routes, serve index.html
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Force no-cache headers for HTML files (overrides express.static defaults)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
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
