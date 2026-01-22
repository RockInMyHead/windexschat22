#!/bin/bash

# WindexsAI Chat - Automatic Server Deployment Script
# Target server: 176.109.111.72 (user1)
# Domain: https://chat.tartihome.online

set -e

# Configuration
SERVER_IP="176.109.111.72"
SERVER_USER="user1"
SERVER_PATH="/home/user1/windexs-ai"
DOMAIN="chat.tartihome.online"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🚀 WindexsAI Chat - Automatic Deployment"
echo "=========================================="
echo ""
echo "📍 Target: $SERVER_USER@$SERVER_IP"
echo "🌐 Domain: https://$DOMAIN"
echo "📁 Path: $SERVER_PATH"
echo ""

# Проверка SSH доступа
print_status "Checking SSH access..."
if ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'SSH OK'" > /dev/null 2>&1; then
    print_success "SSH connection successful"
else
    print_error "Cannot connect to server via SSH"
    echo "Please ensure:"
    echo "  1. SSH key is configured"
    echo "  2. Server is accessible"
    echo "  3. User has proper permissions"
    exit 1
fi

# 1. Локальная подготовка
print_status "Building production version..."
npm run build

if [ ! -d "dist" ]; then
    print_error "Build failed - dist directory not found!"
    exit 1
fi
print_success "Production build completed"

# 2. Создание архива для деплоя
print_status "Creating deployment archive..."
DEPLOY_ARCHIVE="windexs-deploy-$(date +%Y%m%d_%H%M%S).tar.gz"

tar -czf "$DEPLOY_ARCHIVE" \
    --exclude='node_modules' \
    --exclude='logs' \
    --exclude='.git' \
    --exclude='*.tar.gz' \
    --exclude='data/sessions' \
    dist/ \
    server.js \
    package.json \
    package-lock.json \
    .env \
    ecosystem.config.cjs \
    nginx-config/ \
    mcp-server/ \
    src/ \
    init-db.js

print_success "Archive created: $DEPLOY_ARCHIVE"

# 3. Загрузка на сервер
print_status "Uploading to server..."
scp "$DEPLOY_ARCHIVE" $SERVER_USER@$SERVER_IP:/tmp/
print_success "Files uploaded"

# 4. Деплой на сервере
print_status "Deploying on server..."
ssh $SERVER_USER@$SERVER_IP << ENDSSH
set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\${BLUE}[SERVER]${NC} Starting deployment..."

# Создание директории
mkdir -p $SERVER_PATH
cd $SERVER_PATH

# Backup текущей версии
if [ -d "dist" ]; then
    echo -e "\${YELLOW}[SERVER]${NC} Creating backup..."
    BACKUP_DIR="backup-\$(date +%Y%m%d_%H%M%S)"
    mkdir -p backups/\$BACKUP_DIR
    cp -r dist server.js package.json backups/\$BACKUP_DIR/ 2>/dev/null || true
    echo -e "\${GREEN}[SERVER]${NC} Backup created: backups/\$BACKUP_DIR"
fi

# Распаковка новой версии
echo -e "\${BLUE}[SERVER]${NC} Extracting new version..."
tar -xzf /tmp/$DEPLOY_ARCHIVE
rm /tmp/$DEPLOY_ARCHIVE

# Установка/обновление зависимостей
echo -e "\${BLUE}[SERVER]${NC} Installing dependencies..."
npm install --production

# Rebuild native modules для Linux
echo -e "\${BLUE}[SERVER]${NC} Rebuilding native modules..."
npm rebuild better-sqlite3

# Инициализация базы данных (если нужно)
if [ ! -f "windexs_chat.db" ]; then
    echo -e "\${BLUE}[SERVER]${NC} Initializing database..."
    npm run init-db
fi

# Создание директории для логов
mkdir -p logs

# Перезапуск приложения через PM2
echo -e "\${BLUE}[SERVER]${NC} Restarting application..."
if pm2 describe windexs-ai-backend > /dev/null 2>&1; then
    pm2 restart windexs-ai-backend
    echo -e "\${GREEN}[SERVER]${NC} Application restarted"
else
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "\${GREEN}[SERVER]${NC} Application started"
fi

# Проверка статуса
sleep 2
pm2 status windexs-ai-backend

echo -e "\${GREEN}[SERVER]${NC} Deployment completed successfully!"
ENDSSH

print_success "Server deployment completed"

# 5. Настройка Nginx (если не настроен)
print_status "Checking Nginx configuration..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
if [ ! -f "/etc/nginx/sites-available/chat.tartihome.online" ]; then
    echo "⚠️  Nginx configuration not found!"
    echo ""
    echo "Please run the following commands on the server:"
    echo ""
    echo "  sudo cp /home/user1/windexs-ai/nginx-config/chat.tartihome.online.conf /etc/nginx/sites-available/chat.tartihome.online"
    echo "  sudo ln -s /etc/nginx/sites-available/chat.tartihome.online /etc/nginx/sites-enabled/"
    echo "  sudo certbot --nginx -d chat.tartihome.online"
    echo "  sudo nginx -t"
    echo "  sudo systemctl reload nginx"
    echo ""
else
    echo "✅ Nginx configuration exists"
fi
ENDSSH

# 6. Очистка локального архива
rm "$DEPLOY_ARCHIVE"
print_success "Local archive cleaned up"

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📊 Check status:"
echo "   ssh $SERVER_USER@$SERVER_IP 'pm2 status'"
echo ""
echo "📝 View logs:"
echo "   ssh $SERVER_USER@$SERVER_IP 'pm2 logs windexs-ai-backend'"
echo ""
echo "🌐 Website:"
echo "   https://$DOMAIN"
echo ""
echo "🔍 Health check:"
echo "   curl https://$DOMAIN/api/health"
echo ""
