#!/bin/bash

# WindexsAI Chat - Server Cleanup Script
# Для освобождения места на диске сервера

SERVER_IP="176.109.111.72"
SERVER_USER="user1"

echo "🧹 WindexsAI Chat - Server Cleanup"
echo "=================================="
echo ""

echo "Подключаюсь к серверу $SERVER_USER@$SERVER_IP..."
echo ""

ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
set -e

echo "📊 Текущее использование диска:"
df -h /
echo ""

echo "🧹 Начинаю очистку..."
echo ""

# 1. Очистка npm cache
echo "1️⃣  Очистка npm cache..."
npm cache clean --force
echo "✅ npm cache очищен"
echo ""

# 2. Очистка apt cache
echo "2️⃣  Очистка apt cache..."
sudo apt-get clean
sudo apt-get autoclean
sudo apt-get autoremove -y
echo "✅ apt cache очищен"
echo ""

# 3. Очистка старых логов
echo "3️⃣  Очистка старых логов..."
sudo find /var/log -type f -name "*.log" -mtime +30 -delete 2>/dev/null || true
sudo find /var/log -type f -name "*.gz" -delete 2>/dev/null || true
sudo journalctl --vacuum-time=7d
echo "✅ Старые логи удалены"
echo ""

# 4. Очистка старых backups (оставляем только последние 3)
echo "4️⃣  Очистка старых backups..."
if [ -d "/home/user1/windexs-ai/backups" ]; then
    cd /home/user1/windexs-ai/backups
    ls -t | tail -n +4 | xargs -r rm -rf
    echo "✅ Старые backups удалены (оставлено последние 3)"
else
    echo "ℹ️  Директория backups не найдена"
fi
echo ""

# 5. Очистка временных файлов
echo "5️⃣  Очистка временных файлов..."
sudo rm -rf /tmp/* 2>/dev/null || true
sudo rm -rf /var/tmp/* 2>/dev/null || true
echo "✅ Временные файлы удалены"
echo ""

# 6. Очистка старых архивов деплоя
echo "6️⃣  Очистка старых архивов деплоя..."
sudo rm -f /tmp/windexs-deploy-*.tar.gz 2>/dev/null || true
echo "✅ Старые архивы деплоя удалены"
echo ""

# 7. Проверка больших файлов (>100MB)
echo "7️⃣  Топ-10 самых больших файлов в /home/user1:"
sudo du -ah /home/user1 2>/dev/null | sort -rh | head -n 10
echo ""

# 8. Проверка использования по директориям
echo "8️⃣  Использование диска по директориям в /home/user1:"
sudo du -sh /home/user1/* 2>/dev/null | sort -rh | head -n 10
echo ""

echo "✨ Очистка завершена!"
echo ""
echo "📊 Итоговое использование диска:"
df -h /
echo ""
echo "💾 Свободно места:"
df -h / | awk 'NR==2 {print "  "$4" из "$2" ("$5" используется)"}'
echo ""
ENDSSH

echo ""
echo "✅ Cleanup завершен!"
echo ""
echo "Теперь можете повторить деплой:"
echo "  ./deploy-to-server.sh"
echo ""
