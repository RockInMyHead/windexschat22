#!/bin/bash
# ===========================================
# Автоматический фикс Voice Realtime Mode
# ===========================================

set -e

echo "🔧 Starting Voice Realtime Fix..."
echo ""

# Проверяем подключение к серверу
echo "📡 Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 user1@176.109.111.72 "echo 'SSH OK'" &>/dev/null; then
    echo "❌ Cannot connect to server. Check SSH connection."
    exit 1
fi
echo "✅ SSH connection OK"
echo ""

# Создаём .env файл
echo "📝 Creating .env file on server..."
ssh user1@176.109.111.72 << 'ENDSSH'
cat > /home/user1/.env << 'EOF'
# ===========================================
# WindexsAI Backend Environment Configuration
# ===========================================

# ========== VOICE API (КРИТИЧНО для realtime) ==========
VOICE_API_MODE=true
VOICE_CONTROL_API_KEY=key-assist
VOICE_CONTROL_URL=http://176.123.165.23:8080
VOICE_WS_PUBLIC_HOST=176.123.165.23
VOICE_WS_PUBLIC_PORT=2700

# ========== OpenAI API ==========
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE

# ========== DeepSeek API (optional) ==========
# DEEPSEEK_API_KEY=your_deepseek_key_here

# ========== PROXY (optional) ==========
# PROXY_URL=http://username:password@proxy-host:port

# ========== Node Environment ==========
NODE_ENV=production
PORT=1062
EOF

echo "✅ .env file created at /home/user1/.env"
chmod 600 /home/user1/.env
echo "✅ Set permissions to 600"
ENDSSH

echo ""
echo "🔄 Restarting PM2 app..."
ssh user1@176.109.111.72 "pm2 restart windexs-ai"
echo "✅ PM2 restarted"
echo ""

echo "⏳ Waiting 3 seconds for startup..."
sleep 3
echo ""

echo "📋 Checking logs for Voice API configuration..."
ssh user1@176.109.111.72 "pm2 logs windexs-ai --lines 30 --nostream" | grep -E "VOICE_CONTROL_API_KEY|Voice API|Local mode" || true
echo ""

echo "✅ Fix completed!"
echo ""
echo "🎯 Next steps:"
echo "   1. Open browser → https://chat.tartihome.online"
echo "   2. Click Phone Call button (☎️)"
echo "   3. Check browser console for 'ready' event"
echo ""
echo "❗ If you see 'Local mode' in logs above - .env not loaded properly"
echo "   Run: ssh user1@176.109.111.72 'cat /home/user1/.env'"
