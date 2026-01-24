# 🚀 Быстрый Старт: Голосовые Звонки WindexsAI

## Шаг 1: Установка Python зависимостей

```bash
# TTS Service
cd voice-backend
pip3 install torch torchaudio librosa soundfile numpy fastapi uvicorn

# STT Backend
cd stt
pip3 install vosk websockets httpx webrtcvad langdetect python-dotenv pyjwt
```

## Шаг 2: Скачивание Vosk модели

```bash
cd voice-backend/models
curl -L https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -o vosk-model.zip
unzip vosk-model.zip
rm vosk-model.zip
```

## Шаг 3: Запуск сервисов

### Автоматический запуск (рекомендуется)

```bash
cd voice-backend
./start_voice_backend.sh
```

### Ручной запуск

```bash
# Терминал 1: TTS Service
cd voice-backend
python3 app.py

# Терминал 2: STT Backend  
cd voice-backend/stt
python3 server_fixed.py

# Терминал 3: Frontend (если не запущен)
cd ../..
npm run dev
```

## Шаг 4: Проверка работы

### Проверка сервисов

```bash
# STT Backend health check
curl http://127.0.0.1:8081/health

# TTS Service health check
curl http://127.0.0.1:8002/health

# Frontend
curl http://127.0.0.1:8081
```

### Проверка WebSocket

Откройте DevTools в браузере:

```javascript
const ws = new WebSocket('ws://127.0.0.1:2700');
ws.onopen = () => {
  ws.send(JSON.stringify({config: {sample_rate: 16000}}));
  console.log('✅ WebSocket подключен');
};
ws.onmessage = (e) => console.log('Сообщение:', e.data);
```

## Шаг 5: Использование

1. Откройте `http://127.0.0.1:8081`
2. Нажмите "🎙️ Голосовой звонок"
3. Нажмите "Начать звонок"
4. Разрешите доступ к микрофону
5. Говорите с AI!

## 🎯 Ожидаемые порты

- **Frontend:** 8081
- **Backend API:** 1062
- **STT Backend:** 2700
- **STT Health:** 8081
- **TTS Service:** 8002

## ❗ Частые проблемы

### Ошибка: "Vosk model not found"

```bash
cd voice-backend/models
ls -la vosk-model-small-ru-0.22/
```

Если модели нет - скачайте заново (Шаг 2).

### Ошибка: "Port already in use"

```bash
# Освободить порты
lsof -ti:2700 | xargs kill -9
lsof -ti:8002 | xargs kill -9
```

### Ошибка: "ModuleNotFoundError"

```bash
# Установить зависимости заново
cd voice-backend
pip3 install -r requirements.txt

cd stt
pip3 install -r requirements.txt
```

### Микрофон не работает

1. Проверьте разрешения браузера (иконка замка в адресной строке)
2. Используйте Chrome/Edge (лучшая поддержка WebRTC)
3. Проверьте что микрофон работает в других приложениях

## 📊 Мониторинг

### Логи

```bash
# TTS Service
tail -f voice-backend/logs/tts.log

# STT Backend
tail -f voice-backend/logs/stt.log
```

### Метрики

```bash
# Посмотреть использование памяти
ps aux | grep python | grep -E "app.py|server_fixed.py"

# Посмотреть активные соединения
lsof -i :2700
lsof -i :8002
```

## 🛑 Остановка сервисов

```bash
cd voice-backend
./stop_voice_backend.sh
```

Или вручную:

```bash
# Остановить по портам
lsof -ti:2700 | xargs kill
lsof -ti:8002 | xargs kill

# Остановить по имени процесса
pkill -f "python3 server_fixed.py"
pkill -f "python3 app.py"
```

## 🎉 Готово!

Теперь вы можете общаться с AI голосом в реальном времени!

Для подробной информации см. [VOICE_CALL_GUIDE.md](VOICE_CALL_GUIDE.md)
