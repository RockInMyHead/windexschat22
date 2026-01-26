#!/bin/bash

# 🎙️ WindexsAI Voice Backend Startup Script

# Detect project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Load LLM configuration from main .env if available
if [ -f "../.env" ]; then
    # Load DEEPSEEK_API_KEY as LLM_API_KEY
    export LLM_API_KEY=$(grep '^DEEPSEEK_API_KEY=' ../.env | cut -d '=' -f2)
    if [ -z "$LLM_API_KEY" ]; then
        export LLM_API_KEY=$(grep '^OPENAI_API_KEY=' ../.env | cut -d '=' -f2)
    fi
    
    # Load LLM configuration (with defaults if not set)
    export LLM_PROVIDER=$(grep '^LLM_PROVIDER=' ../.env | cut -d '=' -f2 || echo "deepseek")
    export LLM_BASE_URL=$(grep '^LLM_BASE_URL=' ../.env | cut -d '=' -f2 || echo "https://api.deepseek.com")
    export LLM_MODEL=$(grep '^LLM_MODEL=' ../.env | cut -d '=' -f2 || echo "deepseek-chat")
    
    echo "🔑 Loaded LLM configuration from ../.env"
    echo "   LLM_PROVIDER: ${LLM_PROVIDER:-not set}"
    echo "   LLM_BASE_URL: ${LLM_BASE_URL:-not set}"
    echo "   LLM_MODEL: ${LLM_MODEL:-not set}"
    echo "   LLM_API_KEY: ${LLM_API_KEY:+set (${#LLM_API_KEY} chars)}"
fi

if [ -z "$LLM_API_KEY" ]; then
    echo "⚠️  LLM_API_KEY not found in environment or ../.env"
fi

echo "🚀 Starting WindexsAI Voice Backend..."
echo "📍 Directory: $PROJECT_DIR"
echo ""

# Check if Vosk model exists
if [ ! -d "$PROJECT_DIR/models/vosk-model-small-ru-0.22" ]; then
    echo "❌ Vosk model not found!"
    echo "📥 Downloading Vosk model..."
    mkdir -p "$PROJECT_DIR/models"
    cd "$PROJECT_DIR/models"
    curl -L https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -o vosk-model-small-ru-0.22.zip
    unzip vosk-model-small-ru-0.22.zip
    rm vosk-model-small-ru-0.22.zip
    echo "✅ Vosk model downloaded"
    cd "$PROJECT_DIR"
fi

# Check Python dependencies
echo "🔍 Checking dependencies..."

# TTS dependencies
if ! python3 -c "import torch" 2>/dev/null; then
    echo "📦 Installing TTS dependencies..."
    cd "$PROJECT_DIR"
    pip3 install -r requirements.txt
fi

# STT dependencies
if ! python3 -c "import vosk" 2>/dev/null; then
    echo "📦 Installing STT dependencies..."
    cd "$PROJECT_DIR/stt"
    pip3 install -r requirements.txt
fi

echo "✅ All dependencies installed"
echo ""

# Start Voice Runtime (Unified STT + LLM + TTS)
echo "🎤 Starting Unified Voice Runtime (port 2700)..."
mkdir -p "$PROJECT_DIR/logs"
cd "$PROJECT_DIR/stt"
python3 server_fixed.py > ../logs/stt.log 2>&1 &
STT_PID=$!
echo $STT_PID > ../.stt.pid
echo "✅ Unified Voice Runtime started (PID: $STT_PID)"

# Start standalone TTS HTTP Server (port 8003)
echo "🔊 Starting Standalone TTS HTTP Server (port 8003)..."
python3 tts_server.py > ../logs/tts.log 2>&1 &
TTS_PID=$!
echo $TTS_PID > ../.tts.pid
echo "✅ TTS HTTP Server started (PID: $TTS_PID)"

echo ""
echo "🎉 Voice Backend is running!"
echo ""
echo "📊 Services:"
echo "   • TTS Service:  http://127.0.0.1:8003"
echo "   • STT Backend:  ws://127.0.0.1:2700"
echo "   • Health API:   http://127.0.0.1:8081"
echo ""
echo "📝 Logs:"
echo "   • TTS: $PROJECT_DIR/logs/tts.log"
echo "   • STT: $PROJECT_DIR/logs/stt.log"
echo ""
echo "🛑 To stop services:"
echo "   ./stop_voice_backend.sh"
echo ""
