# 🚀 Руководство по настройке сервера
## WindexsAI Chat - Деплой на chat.tartihome.online

---

## 📋 Информация о сервере

- **IP:** 176.109.111.72
- **User:** user1
- **Domain:** https://chat.tartihome.online
- **App Path:** /home/user1/windexs-ai
- **Backend Port:** 3001
- **Nginx Port:** 80/443

---

## ⚡ Быстрый деплой (если сервер уже настроен)

```bash
# Сделайте скрипт исполняемым (первый раз)
chmod +x deploy-to-server.sh

# Запустите деплой
./deploy-to-server.sh
```

✅ Готово! Сайт доступен по адресу: https://chat.tartihome.online

---

## 🔧 Первоначальная настройка сервера

Если вы деплоите впервые, выполните следующие шаги на сервере:

### 1. Подключение к серверу

```bash
ssh user1@176.109.111.72
```

### 2. Установка необходимых пакетов

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js (версия 18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2

# Установка Nginx
sudo apt install -y nginx

# Установка Certbot для SSL
sudo apt install -y certbot python3-certbot-nginx

# Проверка версий
node --version
npm --version
pm2 --version
nginx -v
```

### 3. Настройка Nginx

```bash
# После первого деплоя (когда файлы уже будут на сервере)
sudo cp /home/user1/windexs-ai/nginx-config/chat.tartihome.online.conf /etc/nginx/sites-available/chat.tartihome.online

# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/chat.tartihome.online /etc/nginx/sites-enabled/

# Удаление default конфигурации (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t
```

### 4. Настройка SSL сертификата (Let's Encrypt)

```bash
# Получение SSL сертификата
sudo certbot --nginx -d chat.tartihome.online

# Следуйте инструкциям:
# 1. Введите email
# 2. Согласитесь с условиями
# 3. Выберите опцию redirect HTTP -> HTTPS

# Проверка автообновления сертификата
sudo certbot renew --dry-run
```

### 5. Перезапуск Nginx

```bash
sudo systemctl reload nginx
sudo systemctl status nginx
```

### 6. Настройка PM2 для автозапуска

```bash
# После первого деплоя приложения
cd /home/user1/windexs-ai
pm2 start ecosystem.config.js

# Сохранение конфигурации PM2
pm2 save

# Настройка автозапуска при перезагрузке сервера
pm2 startup
# Выполните команду, которую выведет pm2 startup

# Проверка статуса
pm2 status
```

### 7. Настройка файрвола (опционально, но рекомендуется)

```bash
# Установка UFW (если не установлен)
sudo apt install -y ufw

# Разрешение SSH
sudo ufw allow OpenSSH

# Разрешение HTTP и HTTPS
sudo ufw allow 'Nginx Full'

# Включение файрвола
sudo ufw enable

# Проверка статуса
sudo ufw status
```

---

## 📝 Управление приложением

### Просмотр логов

```bash
# PM2 логи (реальное время)
pm2 logs windexs-ai-backend

# PM2 логи (последние 100 строк)
pm2 logs windexs-ai-backend --lines 100

# Nginx access логи
sudo tail -f /var/log/nginx/chat.tartihome.online.access.log

# Nginx error логи
sudo tail -f /var/log/nginx/chat.tartihome.online.error.log
```

### Перезапуск приложения

```bash
# Перезапуск PM2 приложения
pm2 restart windexs-ai-backend

# Перезапуск Nginx
sudo systemctl restart nginx
```

### Остановка/Запуск

```bash
# Остановка
pm2 stop windexs-ai-backend

# Запуск
pm2 start windexs-ai-backend

# Удаление из PM2
pm2 delete windexs-ai-backend
```

### Мониторинг

```bash
# PM2 dashboard
pm2 monit

# Статус процессов
pm2 status

# Информация о приложении
pm2 info windexs-ai-backend

# Системные ресурсы
htop
```

---

## 🔍 Проверка работы

### 1. Проверка backend

```bash
# На сервере
curl http://localhost:3001/api/health

# Или с локальной машины
ssh user1@176.109.111.72 'curl http://localhost:3001/api/health'
```

### 2. Проверка Nginx

```bash
# Статус Nginx
sudo systemctl status nginx

# Проверка конфигурации
sudo nginx -t
```

### 3. Проверка сайта

```bash
# Через curl
curl https://chat.tartihome.online

# Или откройте в браузере
# https://chat.tartihome.online
```

### 4. Проверка SSL

```bash
# Информация о сертификате
sudo certbot certificates

# Тест SSL
curl -I https://chat.tartihome.online
```

---

## 🐛 Решение проблем

### Приложение не запускается

```bash
# Проверьте логи PM2
pm2 logs windexs-ai-backend --lines 50

# Проверьте порт 3001
sudo netstat -tulpn | grep 3001

# Проверьте права доступа
ls -la /home/user1/windexs-ai

# Проверьте .env файл
cat /home/user1/windexs-ai/.env
```

### Nginx ошибка 502 Bad Gateway

```bash
# Проверьте, запущен ли backend
pm2 status

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/chat.tartihome.online.error.log

# Проверьте, слушает ли backend на порту 3001
curl http://localhost:3001/api/health

# Перезапустите backend
pm2 restart windexs-ai-backend
```

### SSL сертификат не работает

```bash
# Проверьте статус сертификата
sudo certbot certificates

# Проверьте конфигурацию Nginx
sudo nginx -t

# Обновите сертификат вручную
sudo certbot renew

# Перезапустите Nginx
sudo systemctl restart nginx
```

### База данных не создается

```bash
cd /home/user1/windexs-ai

# Проверьте наличие базы
ls -la *.db

# Создайте вручную
npm run init-db

# Проверьте права
chmod 644 windexs_chat.db
```

### Ошибка "DEEPSEEK_API_KEY not configured"

```bash
# Проверьте .env файл
cat /home/user1/windexs-ai/.env

# Убедитесь, что ключ установлен
grep DEEPSEEK_API_KEY /home/user1/windexs-ai/.env

# Если нет, добавьте
echo "DEEPSEEK_API_KEY=your_key_here" >> /home/user1/windexs-ai/.env

# Перезапустите приложение
pm2 restart windexs-ai-backend
```

---

## 🔄 Обновление приложения

### Автоматическое (с вашей локальной машины)

```bash
# Просто запустите скрипт
./deploy-to-server.sh
```

### Ручное (на сервере)

```bash
# Зайдите на сервер
ssh user1@176.109.111.72

# Перейдите в директорию
cd /home/user1/windexs-ai

# Создайте backup
cp -r dist backups/dist-$(date +%Y%m%d_%H%M%S)

# Загрузите новые файлы (через scp, git pull, etc.)

# Установите зависимости
npm install --production

# Соберите frontend (если нужно)
npm run build

# Перезапустите приложение
pm2 restart windexs-ai-backend
```

---

## 📊 Мониторинг и логирование

### Настройка логротации

```bash
# Создайте конфигурацию для PM2 логов
sudo nano /etc/logrotate.d/pm2-windexs-ai

# Добавьте:
/home/user1/windexs-ai/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0644 user1 user1
}
```

### PM2 Plus (опционально)

```bash
# Для расширенного мониторинга
pm2 link [secret-key] [public-key]
```

---

## 🔐 Безопасность

### Рекомендации

1. **Регулярно обновляйте систему:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Используйте SSH ключи вместо паролей**

3. **Настройте файрвол (UFW)**

4. **Регулярно делайте backup базы данных:**
   ```bash
   # Добавьте в crontab
   crontab -e
   
   # Добавьте строку (backup каждый день в 3 утра)
   0 3 * * * cd /home/user1/windexs-ai && ./backup.sh
   ```

5. **Следите за логами:**
   ```bash
   pm2 logs --lines 1000 | grep -i error
   ```

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи (PM2 и Nginx)
2. Проверьте документацию в репозитории
3. Создайте Issue на GitHub

---

**Последнее обновление:** Январь 2026  
**Версия:** 2.1.0
