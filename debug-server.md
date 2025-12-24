# 🔍 Диагностика проблем сервера

## 🚀 Быстрая проверка статуса сервера

### 1. Проверить статус сервера:
```bash
curl https://ai.windexs.ru/api/health
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": {
    "node_env": "production",
    "port": "80",
    "deepseek_key_configured": true,
    "openai_key_configured": true,
    "deepseek_key_prefix": "sk-1234567..."
  },
  "database": {
    "path": "/path/to/windexs_chat.db",
    "initialized": true
  }
}
```

### 2. Проверить базу данных и переменные:
```bash
curl https://ai.windexs.ru/api/debug
```

**Ожидаемый ответ:**
```json
{
  "status": "debug_ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "database": {
    "users": 1,
    "sessions": 5,
    "messages": 15
  },
  "environment": {
    "deepseek_key": "configured",
    "openai_key": "configured",
    "node_env": "production",
    "port": "80"
  }
}
```

## 🔧 Исправление проблем

### Если `deepseek_key_configured: false`:

```bash
# На сервере создать/обновить .env файл
nano .env

# Добавить:
DEEPSEEK_API_KEY=sk-your-actual-deepseek-api-key-here

# Перезапустить сервер
pkill -f "node server.js"
npm run server
```

### Если база данных не инициализирована:

```bash
# На сервере запустить инициализацию
npm run init-db

# Проверить статус
curl https://ai.windexs.ru/api/debug
```

### Если 404 на /api/users/:id/balance:

Это означает, что пользователь с указанным ID не найден. 
Проверьте, что пользователь аутентифицирован и userId правильный.

## 📊 Логи сервера

### Посмотреть логи сервера:
```bash
# Если сервер запущен через PM2
pm2 logs

# Или найти процесс и посмотреть логи
ps aux | grep "node server.js"
tail -f /var/log/your-app.log
```

### Проверить переменные окружения:
```bash
# На сервере
echo $DEEPSEEK_API_KEY
echo $OPENAI_API_KEY
echo $NODE_ENV
echo $PORT
```
