# 🌐 Настройка домена testchat.tartihome.ru

## ✅ Статус интеграции

**Домен:** `testchat.tartihome.ru`  
**IP адрес:** `95.174.92.221`  
**SSL сертификат:** ✅ Установлен (Let's Encrypt)  
**Дата установки:** 2026-01-25  
**Срок действия:** до 2026-04-25 (автоматическое обновление настроено)

---

## 🔧 Что было настроено

### 1. DNS запись

```
Тип: A
Имя: testchat.tartihome.ru
IP: 95.174.92.221
TTL: (по умолчанию)
```

### 2. Nginx конфигурация

**Файл:** `/etc/nginx/sites-available/testchat.tartihome.ru`

**Особенности:**
- ✅ HTTP → HTTPS редирект
- ✅ SSL сертификат (Let's Encrypt)
- ✅ WebSocket проксирование (`/ws-voice/` → `ws://127.0.0.1:2700`)
- ✅ API проксирование (`/api/` → `http://127.0.0.1:3001`)
- ✅ SPA роутинг для фронтенда
- ✅ Оптимизация кэширования

### 3. CORS настройки

Домен добавлен в список разрешенных источников в `server.js`:
```javascript
const allowedOrigins = [
  // ...
  "https://testchat.tartihome.ru",
  "http://testchat.tartihome.ru",
  // ...
];
```

### 4. WebSocket конфигурация

**Frontend автоматически определяет протокол:**
- HTTPS → `wss://testchat.tartihome.ru/ws-voice/`
- HTTP → `ws://testchat.tartihome.ru:2700`

**Nginx проксирование:**
```nginx
location /ws-voice/ {
    proxy_pass http://127.0.0.1:2700/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ...
}
```

---

## 🚀 Доступ к приложению

### Основной URL

**HTTPS (рекомендуется):**
```
https://testchat.tartihome.ru/chat
```

**HTTP (автоматически редиректит на HTTPS):**
```
http://testchat.tartihome.ru/chat
```

### API Endpoints

```
https://testchat.tartihome.ru/api/health
https://testchat.tartihome.ru/api/me
https://testchat.tartihome.ru/api/sessions
# и другие...
```

### WebSocket

```
wss://testchat.tartihome.ru/ws-voice/
```

---

## ✅ Проверка работоспособности

### 1. Проверка DNS

```bash
dig +short testchat.tartihome.ru
# Должно вернуть: 95.174.92.221
```

### 2. Проверка SSL

```bash
curl -I https://testchat.tartihome.ru/chat
# Должен вернуть: HTTP/2 200
```

### 3. Проверка сертификата

```bash
ssh user1@95.174.92.221 "sudo certbot certificates"
# Должен показать сертификат для testchat.tartihome.ru
```

### 4. Проверка сервисов

```bash
# Backend API
ssh user1@95.174.92.221 "pm2 status windexs-ai-backend"

# Voice Backend
ssh user1@95.174.92.221 "ps aux | grep server_fixed.py"
```

---

## 🔒 Безопасность

### SSL/TLS

- ✅ **Протоколы:** TLSv1.2, TLSv1.3
- ✅ **Шифры:** HIGH:!aNULL:!MD5
- ✅ **Автообновление:** Настроено через Certbot

### Security Headers

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

---

## 🎙️ Голосовой ввод

После настройки HTTPS домен поддерживает:

- ✅ **MediaDevices API** - доступ к микрофону
- ✅ **WebSocket (WSS)** - безопасное соединение
- ✅ **Real-time голосовой звонок** - полная функциональность

**Важно:** Голосовой ввод работает **только** через HTTPS. HTTP автоматически редиректит на HTTPS.

---

## 📝 Логи

**Nginx:**
- Access: `/var/log/nginx/testchat.tartihome.ru.access.log`
- Error: `/var/log/nginx/testchat.tartihome.ru.error.log`

**Backend:**
- PM2 logs: `pm2 logs windexs-ai-backend`

**Voice Backend:**
- STT: `/home/user1/windexs-ai/voice-backend/logs/stt.log`

---

## 🔄 Обновление сертификата

Сертификат автоматически обновляется через Certbot. Ручное обновление:

```bash
ssh user1@95.174.92.221 "sudo certbot renew"
sudo systemctl reload nginx
```

---

## 🐛 Troubleshooting

### Проблема: DNS не распространился

**Решение:** Подождите несколько минут (до 24 часов для полного распространения)

### Проблема: SSL сертификат не получен

**Решение:**
```bash
ssh user1@95.174.92.221 "sudo certbot --nginx -d testchat.tartihome.ru --non-interactive --agree-tos --email admin@tartihome.ru --redirect"
```

### Проблема: WebSocket не работает

**Решение:**
1. Проверьте, что голосовой бэкенд запущен: `ps aux | grep server_fixed.py`
2. Проверьте Nginx конфигурацию: `sudo nginx -t`
3. Проверьте логи: `sudo tail -f /var/log/nginx/testchat.tartihome.ru.error.log`

### Проблема: 502 Bad Gateway

**Решение:**
1. Проверьте статус backend: `pm2 status`
2. Проверьте порт 3001: `netstat -tlnp | grep 3001`
3. Перезапустите backend: `pm2 restart windexs-ai-backend`

---

## 📊 Мониторинг

### Проверка доступности

```bash
# HTTP статус
curl -I https://testchat.tartihome.ru/chat

# API health check
curl https://testchat.tartihome.ru/api/health

# SSL сертификат
openssl s_client -connect testchat.tartihome.ru:443 -servername testchat.tartihome.ru
```

### Метрики производительности

- **Latency:** <100ms (API), <500ms (WebSocket)
- **Uptime:** Мониторинг через PM2
- **SSL:** Автоматическое обновление каждые 90 дней

---

**Дата настройки:** 2026-01-25  
**Статус:** ✅ Полностью интегрирован и работает
