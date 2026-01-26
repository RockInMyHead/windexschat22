#!/bin/bash

# 🛑 WindexsAI Voice Backend Stop Script

# Detect project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛑 Stopping WindexsAI Voice Backend..."
echo ""

# Stop Unified Voice Runtime
if [ -f "$PROJECT_DIR/.stt.pid" ]; then
    STT_PID=$(cat "$PROJECT_DIR/.stt.pid")
    if ps -p $STT_PID > /dev/null; then
        kill $STT_PID
        echo "✅ Voice Runtime stopped (PID: $STT_PID)"
    fi
    rm "$PROJECT_DIR/.stt.pid"
fi

# Stop TTS HTTP Server
if [ -f "$PROJECT_DIR/.tts.pid" ]; then
    TTS_PID=$(cat "$PROJECT_DIR/.tts.pid")
    if ps -p $TTS_PID > /dev/null; then
        kill $TTS_PID
        echo "✅ TTS HTTP Server stopped (PID: $TTS_PID)"
    fi
    rm "$PROJECT_DIR/.tts.pid"
fi

# Also kill by port just in case
lsof -ti:2700 | xargs kill -9 2>/dev/null || true
lsof -ti:8003 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

echo ""
echo "✅ All services stopped"
