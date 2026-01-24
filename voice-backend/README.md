# 🎙️ WindexsAI Voice Backend

Профессиональная система realtime голосовых звонков с AI-ассистентом.

## 🏗️ Архитектура

```
voice-backend/
├── app.py              # TTS Service (Silero) - порт 8002
├── stt/
│   └── server_fixed.py # STT Backend (Vosk + LLM) - порт 2700
├── models/             # Vosk модели
│   └── vosk-model-small-ru-0.22/
├── temp_audio/         # Временные аудио файлы
├── requirements.txt    # Python зависимости (TTS)
└── stt/requirements.txt # Python зависимости (STT)
```

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
# TTS Service
cd voice-backend
pip3 install -r requirements.txt

# STT Backend
cd stt
pip3 install -r requirements.txt
```

### 2. Скачивание Vosk модели

```bash
cd voice-backend/models
wget https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip
unzip vosk-model-small-ru-0.22.zip
```

### 3. Запуск сервисов

```bash
# Терминал 1: TTS Service (порт 8002)
cd voice-backend
python3 app.py

# Терминал 2: STT Backend (порт 2700)
cd voice-backend/stt
python3 server_fixed.py
```

## 🔧 Конфигурация

Все настройки в `.env` файлах:
- `voice-backend/.env` - настройки TTS
- `voice-backend/stt/.env` - настройки STT и LLM

## 🎯 Возможности

- ✅ **Realtime STT** - распознавание речи в реальном времени (Vosk)
- ✅ **AI Responses** - ответы от DeepSeek LLM
- ✅ **TTS** - синтез речи (Silero, русский/английский)
- ✅ **VAD** - определение голосовой активности
- ✅ **WebSocket** - низкая задержка (<500ms)
- ✅ **Streaming** - потоковая передача аудио

## 📊 Производительность

- **Latency**: <500ms для STT, <2s для полного ответа
- **Concurrent Users**: 10-50 (зависит от железа)
- **Languages**: Русский, Английский

## 🔗 API

### WebSocket Endpoint

```javascript
ws://127.0.0.1:2700
```

**Отправка аудио:**
- Binary frames: PCM 16-bit mono 16kHz (640 bytes = 20ms)

**Получение:**
- JSON events: `partial`, `final`, `llm_start`, `llm_delta`, `llm_end`, `tts_start`, `tts_chunk`, `tts_end`
- Binary audio: WAV чанки для воспроизведения

### TTS HTTP API

```bash
POST http://127.0.0.1:8002/tts
Content-Type: application/json

{
  "text": "Привет, мир!",
  "model": "silero_ru",
  "voice": "eugene",
  "speed": 1.0,
  "emotion": "neutral"
}
```

## 🧪 Тестирование

```bash
# Health check STT
curl http://127.0.0.1:8081/health

# Health check TTS
curl http://127.0.0.1:8002/health

# Test TTS
curl -X POST http://127.0.0.1:8002/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Тест системы","model":"silero_ru","voice":"eugene"}'
```

## 🐛 Troubleshooting

1. **Vosk model not found**: Проверьте путь MODEL_PATH в .env
2. **Port in use**: Измените PORT в .env или освободите порт
3. **Memory issues**: Vosk модель требует ~2GB RAM
4. **Audio playback issues**: Проверьте формат аудио (должен быть WAV 16kHz mono)

## 📖 Документация

- [Vosk Models](https://alphacephei.com/vosk/models)
- [Silero TTS](https://github.com/snakers4/silero-models)
- [DeepSeek API](https://platform.deepseek.com/api-docs/)
