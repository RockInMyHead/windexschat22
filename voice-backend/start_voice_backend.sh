#!/bin/bash

# 🎙️ WindexsAI Voice Backend Startup Script

PROJECT_DIR="/Users/artembutko/Desktop/WindexsChat2.0mainкопия/voice-backend"

echo "🚀 Starting WindexsAI Voice Backend..."
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
cd "$PROJECT_DIR/stt"
python3 server_fixed.py > ../logs/stt.log 2>&1 &
STT_PID=$!
echo $STT_PID > ../.stt.pid
echo "✅ Unified Voice Runtime started (PID: $STT_PID)"

echo ""
echo "🎉 Voice Backend is running!"
echo ""
echo "📊 Services:"
echo "   • TTS Service:  http://127.0.0.1:8002"
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
