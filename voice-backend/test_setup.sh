#!/bin/bash

# 🧪 Тестовый скрипт для проверки настройки Voice Backend

echo "🧪 ТЕСТИРОВАНИЕ VOICE BACKEND SETUP"
echo "===================================="
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для проверки
check_step() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
        return 0
    else
        echo -e "${RED}❌ $1${NC}"
        return 1
    fi
}

# 1. Проверка Python
echo "1️⃣ Проверка Python..."
python3 --version > /dev/null 2>&1
check_step "Python 3 установлен: $(python3 --version 2>&1)"
echo ""

# 2. Проверка pip зависимостей (TTS)
echo "2️⃣ Проверка TTS зависимостей..."
MISSING_TTS=()
for package in torch torchaudio librosa soundfile numpy fastapi uvicorn; do
    python3 -c "import $package" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✅ $package${NC}"
    else
        echo -e "${RED}  ❌ $package (не установлен)${NC}"
        MISSING_TTS+=($package)
    fi
done
echo ""

# 3. Проверка STT зависимостей
echo "3️⃣ Проверка STT зависимостей..."
MISSING_STT=()
for package in vosk websockets httpx webrtcvad langdetect dotenv jwt; do
    python3 -c "import $package" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✅ $package${NC}"
    else
        echo -e "${RED}  ❌ $package (не установлен)${NC}"
        MISSING_STT+=($package)
    fi
done
echo ""

# 4. Проверка Vosk модели
echo "4️⃣ Проверка Vosk модели..."
if [ -d "models/vosk-model-small-ru-0.22" ]; then
    echo -e "${GREEN}✅ Vosk модель найдена${NC}"
    MODEL_SIZE=$(du -sh models/vosk-model-small-ru-0.22 2>/dev/null | cut -f1)
    echo "   Размер: $MODEL_SIZE"
else
    echo -e "${RED}❌ Vosk модель НЕ найдена${NC}"
    echo -e "${YELLOW}   📥 Скачайте модель:${NC}"
    echo "   cd models"
    echo "   curl -L https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -o vosk.zip"
    echo "   unzip vosk.zip && rm vosk.zip"
fi
echo ""

# 5. Проверка .env файлов
echo "5️⃣ Проверка конфигурации..."
if [ -f "stt/.env" ]; then
    echo -e "${GREEN}✅ stt/.env найден${NC}"
    if grep -q "LLM_API_KEY" stt/.env; then
        echo "   ✓ LLM_API_KEY настроен"
    else
        echo -e "${YELLOW}   ⚠️  LLM_API_KEY не найден${NC}"
    fi
    if grep -q "MODEL_PATH" stt/.env; then
        echo "   ✓ MODEL_PATH настроен"
    else
        echo -e "${YELLOW}   ⚠️  MODEL_PATH не найден${NC}"
    fi
else
    echo -e "${RED}❌ stt/.env НЕ найден${NC}"
fi

if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env найден${NC}"
else
    echo -e "${YELLOW}⚠️  .env не найден (опционально)${NC}"
fi
echo ""

# 6. Проверка директорий
echo "6️⃣ Проверка директорий..."
for dir in models temp_audio logs; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}  ✅ $dir/${NC}"
    else
        echo -e "${RED}  ❌ $dir/ (не существует)${NC}"
        mkdir -p "$dir" 2>/dev/null && echo -e "${GREEN}     └─ создана${NC}"
    fi
done
echo ""

# 7. Проверка портов
echo "7️⃣ Проверка портов..."
for port in 2700 8002 8081; do
    lsof -i :$port > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}  ⚠️  Порт $port занят${NC}"
        echo "     $(lsof -i :$port | tail -1)"
    else
        echo -e "${GREEN}  ✅ Порт $port свободен${NC}"
    fi
done
echo ""

# Итоговый отчет
echo "================================="
echo "📊 ИТОГОВЫЙ ОТЧЕТ"
echo "================================="
echo ""

if [ ${#MISSING_TTS[@]} -eq 0 ] && [ ${#MISSING_STT[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ Все зависимости установлены!${NC}"
else
    echo -e "${YELLOW}⚠️  Отсутствующие зависимости:${NC}"
    echo ""
    if [ ${#MISSING_TTS[@]} -gt 0 ]; then
        echo "   TTS Service:"
        echo "   pip3 install ${MISSING_TTS[@]}"
        echo ""
    fi
    if [ ${#MISSING_STT[@]} -gt 0 ]; then
        echo "   STT Backend:"
        echo "   cd stt && pip3 install ${MISSING_STT[@]}"
        echo ""
    fi
fi

if [ ! -d "models/vosk-model-small-ru-0.22" ]; then
    echo -e "${YELLOW}⚠️  Необходимо скачать Vosk модель${NC}"
fi

if [ -d "models/vosk-model-small-ru-0.22" ] && [ ${#MISSING_TTS[@]} -eq 0 ] && [ ${#MISSING_STT[@]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ВСЕ ГОТОВО К ЗАПУСКУ!${NC}"
    echo ""
    echo "Запустите сервисы:"
    echo "  ./start_voice_backend.sh"
else
    echo ""
    echo -e "${YELLOW}⚠️  Требуется дополнительная настройка${NC}"
fi

echo ""
