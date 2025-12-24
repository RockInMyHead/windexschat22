# Развертывание WindexsChat 2.0 на ai.windexs.ru

## 🚀 Подготовка к развертыванию

### 1. Переменные окружения
Создайте файл `.env` в корне проекта:

```bash
# Production Environment Variables for ai.windexs.ru

# Server Configuration
PORT=80
NODE_ENV=production

# DeepSeek API Key (обязательно!)
DEEPSEEK_API_KEY=your_actual_deepseek_api_key_here

# Proxy for external requests (опционально)
PROXY_URL=http://your_proxy_url_here

# Frontend API Base URL (относительный путь работает на любом домене)
VITE_API_BASE_URL=/api
```

### 2. Сборка проекта
```bash
npm run build
```

### 3. Структура файлов для развертывания
```
ai.windexs.ru/
├── dist/                 # Статические файлы React (index.html, assets/)
├── server.js            # Express сервер
├── windexs_chat.db      # SQLite база данных
├── .env                 # Переменные окружения
└── node_modules/        # Зависимости Node.js
```

## 🔧 Настройка сервера

### Nginx Configuration (если используется)
```nginx
server {
    listen 80;
    server_name ai.windexs.ru www.ai.windexs.ru;

    # API прокси
    location /api {
        proxy_pass https://ai.windexs.ru;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Статические файлы
    location / {
        root /path/to/ai.windexs.ru/dist;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # SSL (рекомендуется)
    listen 443 ssl;
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
}
```

### PM2 для управления процессом
```bash
npm install -g pm2
cd /path/to/ai.windexs.ru
pm2 start server.js --name "windexs-ai"
pm2 save
pm2 startup
```

## 🌐 DNS и домен

### Настройка DNS
```
Тип: A
Имя: ai.windexs.ru
Значение: ваш_IP_адрес

Тип: CNAME
Имя: www.ai.windexs.ru
Значение: ai.windexs.ru
```

## 🔒 Безопасность

### Важные настройки:
1. **HTTPS**: Включите SSL сертификат (Let's Encrypt)
2. **Firewall**: Разрешите только необходимые порты (80, 443)
3. **API Key**: Никогда не коммитите реальный OPENAI_API_KEY
4. **База данных**: Регулярные бэкапы SQLite файла

## 📊 Мониторинг

### Проверка работы:
```bash
# Проверка API
curl https://ai.windexs.ru/api/sessions

# Проверка фронтенда
curl https://ai.windexs.ru/

# Проверка логов
pm2 logs windexs-ai
```

## 🔄 Обновление

### Процесс обновления:
```bash
# На сервере
cd /path/to/ai.windexs.ru
git pull origin main
npm install
npm run build
pm2 restart windexs-ai
```

## 🚨 Troubleshooting

### Распространенные проблемы:

1. **CORS ошибки**: Проверьте origins в server.js
2. **API недоступен**: Проверьте переменные окружения
3. **База данных**: Убедитесь в правах на файл windexs_chat.db
4. **Память**: Pyodide может требовать много RAM

## 📞 Поддержка

Если возникнут проблемы с развертыванием, проверьте:
- Логи сервера: `pm2 logs windexs-ai`
- Переменные окружения: `cat .env`
- Права доступа: `ls -la`
- Сетевое подключение: `curl https://ai.windexs.ru/api/health`
