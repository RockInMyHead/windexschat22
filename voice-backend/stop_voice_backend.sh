#!/bin/bash

# 🛑 WindexsAI Voice Backend Stop Script

PROJECT_DIR="/Users/artembutko/Desktop/WindexsChat2.0mainкопия/voice-backend"

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

# Also kill by port just in case
lsof -ti:2700 | xargs kill -9 2>/dev/null || true
lsof -ti:8082 | xargs kill -9 2>/dev/null || true

echo ""
echo "✅ All services stopped"
