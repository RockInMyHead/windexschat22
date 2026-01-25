# 🎙️ Реализация Реалтайм Голосового Звонка

## 📋 Содержание

1. [Обзор системы](#обзор-системы)
2. [Архитектура](#архитектура)
3. [Компоненты системы](#компоненты-системы)
4. [Протокол WebSocket](#протокол-websocket)
5. [Обработка аудио](#обработка-аудио)
6. [Поток данных](#поток-данных)
7. [Машина состояний](#машина-состояний)
8. [Технические детали](#технические-детали)

---

## 🎯 Обзор системы

Система реалтайм голосовых звонков WindexsAI обеспечивает **низколатентное** (<500ms) общение с AI-ассистентом через голос. Система поддерживает:

- ✅ **Real-time STT** (Speech-to-Text) - распознавание речи в реальном времени
- ✅ **AI Responses** - генерация ответов через DeepSeek LLM
- ✅ **Real-time TTS** (Text-to-Speech) - синтез речи с потоковой передачей
- ✅ **VAD** (Voice Activity Detection) - определение голосовой активности
- ✅ **Barge-in** - возможность перебить ассистента
- ✅ **WebSocket** - низкая задержка передачи данных

---

## 🏗️ Архитектура

### Общая схема

```
┌─────────────────┐
│   Frontend      │
│  (React/TS)     │
│                 │
│  VoiceCall.tsx  │
│  AudioWorklet   │
└────────┬────────┘
         │ WebSocket (ws:// или wss://)
         │ PCM Audio (binary)
         │ JSON Events
         ▼
┌─────────────────┐
│  Nginx Proxy    │
│  /ws-voice/     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  STT Backend    │
│  (Python)       │
│  Port: 2700     │
│                 │
│  server_fixed.py│
│  voice_pipeline │
└────────┬────────┘
         │
         ├──► Vosk (STT)
         ├──► DeepSeek (LLM)
         └──► Silero (TTS)
```

### Компоненты

1. **Frontend** (`src/components/VoiceCall.tsx`)
   - React компонент для UI
   - WebSocket клиент
   - AudioWorklet для обработки аудио
   - Управление состоянием звонка

2. **Nginx Proxy** (`/ws-voice/`)
   - Проксирование WebSocket соединений
   - Поддержка wss:// для HTTPS
   - Маршрутизация на порт 2700

3. **STT Backend** (`voice-backend/stt/server_fixed.py`)
   - WebSocket сервер (порт 2700)
   - Интеграция с Vosk для STT
   - Интеграция с DeepSeek для LLM
   - Интеграция с Silero для TTS
   - Управление сессиями и диалогами

4. **Voice Pipeline** (`voice-backend/stt/voice_pipeline.py`)
   - Логика обработки диалога
   - VAD и endpointing
   - Управление состоянием
   - Barge-in обработка

---

## 🔧 Компоненты системы

### 1. Frontend: VoiceCall.tsx

**Расположение:** `src/components/VoiceCall.tsx`

**Основные функции:**

#### Инициализация WebSocket

```typescript
const wsUrl = window.location.protocol === 'https:' 
  ? `wss://${window.location.hostname}/ws-voice/`
  : `ws://${window.location.hostname}:2700`;
```

- Автоматическое определение протокола (ws:// для HTTP, wss:// для HTTPS)
- Подключение через Nginx proxy при HTTPS

#### Захват микрофона

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000
  }
});
```

- Запрос доступа к микрофону
- Настройка: моно, 16kHz, с шумоподавлением

#### AudioWorklet для обработки PCM

**Расположение:** `public/audioWorklet.js`

**Функции:**
- Конвертация float32 → int16 PCM
- Ресемплинг до 16kHz (если нужно)
- Разбиение на чанки по 20ms (320 samples)
- Отправка через WebSocket

**Процесс:**
1. AudioWorklet получает аудио в формате float32
2. Конвертирует в int16 PCM
3. Ресемплит до 16kHz
4. Накапливает 320 samples (20ms)
5. Отправляет бинарные данные через WebSocket

#### Воспроизведение аудио

```typescript
// Обработка бинарных аудио чанков от сервера
ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Декодирование WAV и воспроизведение
    audioContext.decodeAudioData(event.data)
      .then(audioBuffer => playAudioChunk(audioBuffer));
  }
};
```

### 2. Backend: server_fixed.py

**Расположение:** `voice-backend/stt/server_fixed.py`

**Архитектура:**

#### Transport Layer (server_fixed.py)

**Ответственность:**
- WebSocket жизненный цикл
- Handshake и аутентификация
- Бинарная передача данных
- Маршрутизация событий

**Особенности:**
- Не знает о LLM, TTS или Vosk
- Работает только с байтами и JSON событиями
- Использует callback'и для передачи данных в Logic Layer

#### Logic Layer (voice_pipeline.py)

**Ответственность:**
- Весь интеллектуальный цикл диалога
- VAD & ASR Processing
- Endpointing Logic
- LLM Invocation (DeepSeek)
- TTS Streaming (Silero)
- Barge-in Management
- Session Context

**Основные классы:**

##### VoicePipeline

```python
class VoicePipeline:
    def __init__(
        self, 
        session_id: str,
        preset: dict,
        send_event: Callable[[dict], Any],
        send_audio: Callable[[int, bytes], Any],
        vad_engine: Any,
        recognizer: Any,
        sample_rate: int,
        protocol_version: int = 1
    ):
```

**Методы:**
- `process_pcm_frame()` - обработка PCM кадров
- `handle_final_text()` - обработка финального текста от STT
- `call_llm()` - вызов LLM для генерации ответа
- `synthesize_tts()` - синтез речи через TTS

##### SessionState

```python
@dataclass
class SessionState:
    session_id: str
    turns: list[Turn] = field(default_factory=list)
    llm_buffers: dict[int, str] = field(default_factory=dict)
    summary: str = ""
    ended: bool = False
```

**Функции:**
- Хранение истории диалога
- Построение контекста для LLM
- Управление utterance_id для синхронизации

### 3. STT: Vosk Integration

**Модель:** `vosk-model-small-ru-0.22`

**Использование:**
```python
from vosk import Model, KaldiRecognizer

MODEL = Model(MODEL_PATH)
rec = KaldiRecognizer(MODEL, sample_rate)
```

**Функции:**
- `AcceptWaveform()` - обработка PCM кадров
- `PartialResult()` - промежуточные результаты
- `Result()` - финальный результат

**Параметры:**
- Sample rate: 16000 Hz
- Format: PCM 16-bit mono
- Frame size: 640 bytes (20ms @ 16kHz)

### 4. LLM: DeepSeek Integration

**API:** DeepSeek Chat Completions

**Использование:**
```python
async with httpx.AsyncClient() as client:
    response = await client.post(
        f"{LLM_BASE_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={
            "model": "deepseek-chat",
            "messages": messages,
            "stream": True
        }
    )
```

**Особенности:**
- Streaming ответы (SSE)
- Контекст из истории диалога
- Системный промпт для настройки поведения

### 5. TTS: Silero Integration

**Модель:** Silero TTS (русский/английский)

**Использование:**
```python
import tts_silero

wav_bytes = await tts_silero.synthesize_wav(
    text=text,
    model_name="silero_ru",
    voice="eugene",
    speed=0.93,
    emotion="neutral"
)
```

**Особенности:**
- Прямой вызов (без HTTP)
- Потоковая передача чанков
- Поддержка эмоций и скорости

---

## 📡 Протокол WebSocket

### Подключение

**URL:**
- HTTP: `ws://hostname:2700`
- HTTPS: `wss://hostname/ws-voice/` (через Nginx)

**Handshake:**
1. Клиент подключается к WebSocket
2. Сервер отправляет событие `ready`:
```json
{
  "event": "ready",
  "sample_rate": 16000,
  "frame_ms": 20,
  "vad_mode": 2,
  "early_pause_ms": 300,
  "protocol_version": 2
}
```

### Формат сообщений

#### 1. От клиента к серверу

**Бинарные данные (PCM):**
- Формат: PCM 16-bit mono, 16kHz
- Размер чанка: 640 bytes (20ms)
- Частота отправки: каждые 20ms

**JSON события:**
```json
{
  "type": "ping"
}
```

#### 2. От сервера к клиенту

**JSON события:**

##### `ready` - сервер готов
```json
{
  "event": "ready",
  "sample_rate": 16000,
  "frame_ms": 20,
  "vad_mode": 2,
  "early_pause_ms": 300,
  "protocol_version": 2
}
```

##### `partial` - промежуточный результат STT
```json
{
  "type": "partial",
  "text": "привет как"
}
```

##### `final` - финальный результат STT
```json
{
  "type": "final",
  "text": "привет как дела"
}
```

##### `llm_start` - начало генерации ответа
```json
{
  "type": "llm_start"
}
```

##### `llm_delta` - потоковые чанки ответа
```json
{
  "type": "llm_delta",
  "delta": "Привет"
}
```

##### `llm_end` - конец генерации
```json
{
  "type": "llm_end"
}
```

##### `tts_start` - начало синтеза речи
```json
{
  "type": "tts_start",
  "utterance_id": 1
}
```

##### `tts_audio` - метаданные перед аудио
```json
{
  "type": "tts_audio",
  "utterance_id": 1,
  "mime": "audio/wav"
}
```

##### `tts_end` - конец синтеза
```json
{
  "type": "tts_end",
  "utterance_id": 1
}
```

**Бинарные данные (аудио):**
- Формат: WAV файлы
- Отправляются между `tts_start` и `tts_end`
- Размер: переменный (полные WAV чанки)

---

## 🎵 Обработка аудио

### Frontend: AudioWorklet

**Файл:** `public/audioWorklet.js`

**Процесс:**

1. **Получение аудио от микрофона:**
   ```javascript
   const source = audioContext.createMediaStreamSource(stream);
   source.connect(workletNode);
   ```

2. **Обработка в AudioWorklet:**
   - Вход: float32 samples (128 samples за квант)
   - Ресемплинг до 16kHz (если нужно)
   - Конвертация float32 → int16
   - Накопление до 320 samples (20ms)

3. **Отправка PCM:**
   ```javascript
   workletNode.port.onmessage = (event) => {
     const { pcm } = event.data;
     ws.send(pcm); // Int16Array buffer
   };
   ```

**Параметры:**
- Input: float32, любой sample rate
- Output: int16 PCM, 16kHz mono
- Chunk size: 320 samples = 20ms @ 16kHz

### Backend: Обработка PCM

**Процесс:**

1. **Получение PCM кадров:**
   ```python
   async def handle_websocket(websocket):
       async for message in websocket:
           if isinstance(message, bytes):
               # PCM данные
               await pipeline.process_pcm_frame(message)
   ```

2. **VAD (Voice Activity Detection):**
   ```python
   is_speech = vad.is_speech(frame, sample_rate)
   ```

3. **STT обработка:**
   ```python
   if rec.AcceptWaveform(frame):
       final_text = json.loads(rec.Result())["text"]
   else:
       partial_text = json.loads(rec.PartialResult())["partial"]
   ```

4. **Endpointing:**
   - Early pause detection (300ms)
   - Final pause detection (800ms)
   - Минимальная длина фразы

---

## 🔄 Поток данных

### Полный цикл диалога

```
1. Пользователь говорит
   │
   ▼
2. Микрофон → AudioWorklet → PCM (20ms chunks)
   │
   ▼
3. WebSocket → STT Backend
   │
   ▼
4. Vosk STT → partial/final текст
   │
   ▼
5. Endpointing → финальный текст
   │
   ▼
6. DeepSeek LLM → генерация ответа (streaming)
   │
   ▼
7. Silero TTS → синтез речи (WAV chunks)
   │
   ▼
8. WebSocket → Frontend → воспроизведение
   │
   ▼
9. Цикл повторяется
```

### Детальный поток

#### Этап 1: Захват речи

```
[Микрофон]
    │
    ▼ float32, 48kHz (или другой)
[AudioWorklet]
    │
    ├─► Ресемплинг → 16kHz
    ├─► Конвертация → int16
    └─► Накопление → 320 samples (20ms)
    │
    ▼ Int16Array (640 bytes)
[WebSocket.send()]
```

#### Этап 2: Распознавание речи

```
[WebSocket receive PCM]
    │
    ▼ 640 bytes (20ms)
[VAD Engine]
    │
    ├─► is_speech? → True/False
    └─► VAD state update
    │
    ▼
[Vosk Recognizer]
    │
    ├─► AcceptWaveform() → final result
    └─► PartialResult() → partial text
    │
    ▼
[Endpointing Logic]
    │
    ├─► Early pause? → early endpoint
    ├─► Final pause? → final endpoint
    └─► Stable text? → send final
    │
    ▼ "привет как дела"
[Send final event]
```

#### Этап 3: Генерация ответа

```
[Final text received]
    │
    ▼
[SessionState.add_turn("user", text)]
    │
    ▼
[Build LLM messages]
    │
    ├─► System prompt
    ├─► History (last 12 turns)
    └─► Current user message
    │
    ▼
[DeepSeek API call]
    │
    ├─► POST /v1/chat/completions
    ├─► stream: true
    └─► SSE response
    │
    ▼ Streaming deltas
[Process LLM stream]
    │
    ├─► llm_start event
    ├─► llm_delta events (chunks)
    └─► llm_end event
    │
    ▼ "Привет! Как дела?"
[TTS Synthesis]
```

#### Этап 4: Синтез речи

```
[LLM response text]
    │
    ▼
[Silero TTS]
    │
    ├─► synthesize_wav()
    ├─► Text → WAV bytes
    └─► Split into chunks
    │
    ▼ WAV chunks
[Send audio]
    │
    ├─► tts_start event
    ├─► tts_audio metadata
    ├─► Binary WAV chunks
    └─► tts_end event
    │
    ▼
[Frontend playback]
```

---

## 🎛️ Машина состояний

### VoiceState

```python
class VoiceState(Enum):
    IDLE = "idle"              # Ожидание пользователя
    USER_SPEAKING = "user"     # Пользователь говорит
    ASSISTANT_TTS = "tts"      # Ассистент говорит
```

### Переходы состояний

```
IDLE
  │
  │ (partial text detected)
  ▼
USER_SPEAKING
  │
  │ (final text + endpoint)
  ▼
[LLM Processing]
  │
  │ (TTS starts)
  ▼
ASSISTANT_TTS
  │
  │ (TTS ends)
  ▼
IDLE (loop)
```

### Логика переходов

#### IDLE → USER_SPEAKING

**Условие:**
- Получен partial текст от STT
- VAD определил речь

**Действия:**
- `voice_state = VoiceState.USER_SPEAKING`
- Отправка `partial` события на фронтенд
- Активация endpointing логики

#### USER_SPEAKING → ASSISTANT_TTS

**Условие:**
- Получен final текст
- Endpointing определил конец фразы
- LLM сгенерировал ответ
- TTS начал синтез

**Действия:**
- `voice_state = VoiceState.ASSISTANT_TTS`
- Отправка `tts_start` события
- Блокировка приема PCM (barge-in protection)

#### ASSISTANT_TTS → IDLE

**Условие:**
- TTS завершил синтез
- Все аудио чанки отправлены

**Действия:**
- `voice_state = VoiceState.IDLE`
- Отправка `tts_end` события
- Разблокировка приема PCM
- ASR warmup (200ms)

---

## ⚙️ Технические детали

### Параметры аудио

| Параметр | Значение | Описание |
|----------|----------|----------|
| Sample Rate | 16000 Hz | Частота дискретизации |
| Bit Depth | 16-bit | Разрядность PCM |
| Channels | Mono (1) | Моно канал |
| Frame Size | 640 bytes | 20ms @ 16kHz |
| Format | PCM | Несжатый формат |

### VAD параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| VAD Mode | 2 | Агрессивность (0-3) |
| Frame MS | 20ms | Размер кадра |
| Early Pause | 300ms | Раннее определение паузы |
| Final Pause | 800ms | Финальное определение паузы |
| Stable MS | 250ms | Время стабильности текста |

### Endpointing параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| MIN_WORDS_EARLY | 1 | Минимум слов для early endpoint |
| MIN_CHARS_EARLY | 3 | Минимум символов для early endpoint |
| RESTART_DEBOUNCE | 200ms | Задержка перед перезапуском ASR |

### Производительность

| Метрика | Значение | Описание |
|---------|----------|----------|
| STT Latency | <500ms | Задержка распознавания |
| LLM Latency | <2s | Задержка генерации ответа |
| TTS Latency | <1s | Задержка синтеза |
| Total Latency | <3.5s | Полная задержка цикла |
| Concurrent Users | 10-50 | Одновременные пользователи |

### Безопасность

1. **HTTPS/WSS обязателен** для доступа к микрофону
2. **JWT токены** для аутентификации (опционально)
3. **Session isolation** - каждая сессия изолирована
4. **Rate limiting** - защита от перегрузки

### Обработка ошибок

1. **WebSocket reconnection** - автоматическое переподключение
2. **LLM fallback** - обработка ошибок API
3. **TTS fallback** - резервный синтез
4. **Graceful degradation** - деградация функций при ошибках

---

## 📝 Примеры использования

### Frontend: Инициализация звонка

```typescript
<VoiceCall
  wsUrl="wss://testchat.tartihome.ru/ws-voice/"
  onTranscript={(text, isFinal) => {
    console.log('Transcript:', text, isFinal);
  }}
  onLLMResponse={(delta, isStart, isEnd) => {
    console.log('LLM:', delta, isStart, isEnd);
  }}
  autoStart={false}
/>
```

### Backend: Обработка сессии

```python
# Создание pipeline для сессии
pipeline = VoicePipeline(
    session_id="session_123",
    preset=AGENTS["default"],
    send_event=send_event_callback,
    send_audio=send_audio_callback,
    vad_engine=vad,
    recognizer=rec,
    sample_rate=16000
)

# Обработка PCM кадров
await pipeline.process_pcm_frame(pcm_data)
```

---

## 🔍 Отладка

### Логирование

**Frontend:**
- `🔌 WebSocket connected` - подключение установлено
- `📤 Sending PCM` - отправка PCM данных
- `📨 Received message` - получение события

**Backend:**
- `[STATE]` - переходы состояний
- `[ASR]` - события распознавания
- `[LLM]` - события LLM
- `[TTS]` - события TTS

### Проверка соединения

```bash
# Проверка WebSocket сервера
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:2700
```

### Мониторинг производительности

```python
# Метрики в логах
- Latency: STT, LLM, TTS
- Throughput: frames/sec
- Error rate: failed requests
```

---

## 🚀 Развертывание

### Требования

- Python 3.10+
- Node.js 20+
- Vosk модель (vosk-model-small-ru-0.22)
- Silero TTS (автоматическая загрузка)
- DeepSeek API ключ

### Запуск

```bash
# 1. Запуск STT Backend
cd voice-backend/stt
python3 server_fixed.py

# 2. Запуск Frontend
npm run dev

# 3. Настройка Nginx (для HTTPS)
sudo certbot --nginx -d testchat.tartihome.ru
```

---

## 📚 Дополнительные ресурсы

- [Vosk Models](https://alphacephei.com/vosk/models)
- [Silero TTS](https://github.com/snakers4/silero-models)
- [DeepSeek API](https://platform.deepseek.com/api-docs/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [AudioWorklet API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)

---

**Версия документа:** 1.0  
**Дата обновления:** 2026-01-25  
**Автор:** WindexsAI Development Team
