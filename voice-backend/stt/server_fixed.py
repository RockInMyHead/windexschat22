import asyncio
import base64
import json
import logging
import os
import signal
import struct
import time
from typing import Optional, List, Dict, AsyncIterator, Union
from dataclasses import dataclass
from enum import Enum
# from urllib.parse import urlparse, parse_qs  # REMOVED: no longer needed
from pathlib import Path

import websockets
from websockets.server import WebSocketServerProtocol
import httpx
import webrtcvad
from langdetect import detect
from dotenv import load_dotenv
import jwt

# Voice Session States
class VoiceState(Enum):
    IDLE = "idle"              # Waiting for user input
    USER_SPEAKING = "user"     # ASR active, user is speaking
    ASSISTANT_TTS = "tts"      # Assistant is speaking via TTS

# Import for JWT fallback
from urllib.parse import urlparse, parse_qs

"""
WS PROTOCOL CONTRACT - REALTIME VOICE AI

This contract MUST be maintained at all times. Violations are logged as PROTO VIOLATION.

1. JSON Messages (always allowed):
   - status: connection status
   - tts_start: assistant starts speaking
   - tts_end: assistant stops speaking
   - partial: ASR partial results (frontend only)
   - final: ASR final results
   - llm_*: LLM streaming deltas
   - ack: acknowledgment sounds

2. Binary Messages (ONLY allowed between tts_start and tts_end):
   - Format: WAV or AUD0(WAV/PCM16)
   - Size: variable, but complete WAV files
   - Ordering: must be sent through ws_send() for strict ordering

3. Voice State Machine:
   IDLE → USER_SPEAKING → ASSISTANT_TTS → IDLE (loop)

4. PCM from User:
   - Frame size: EXACTLY 640 bytes (20ms @ 16kHz int16 mono)
   - Allowed ONLY when voice_state != ASSISTANT_TTS
   - Dropped otherwise (logged as violation)

5. TTS Ordering Invariant:
   tts_start → [binary audio chunks 1..N] → tts_end
   NEVER: binary before tts_start, tts_end before binary, overlapping TTS

6. ASR Invariants:
   - ASR warmup after TTS (200ms)
   - No vad.reset() during conversation
   - ASR enabled only when voice_state != ASSISTANT_TTS

7. Event Normalization:
   - Only 'user' and 'assistant' events reach Voice Control
   - Events filtered and validated before sending
   - Empty texts dropped, roles validated

Violations MUST be logged and fixed immediately.
"""

from vosk import Model, KaldiRecognizer, SetLogLevel
from agents import AGENTS
import tts_silero

# Загрузка переменных окружения из .env файла
load_dotenv()

# Настройка логирования
logger = logging.getLogger("ws")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Оптимизация event loop для Linux
try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ImportError:
    pass  # uvloop не доступен, используем стандартный asyncio

# Feature flag для отключения VoiceAsk (legacy)
VOICE_API_MODE = os.getenv('VOICE_API_MODE', 'true').lower() == 'true'
if VOICE_API_MODE:
    logger.info("🎯 VOICE API MODE: ENABLED (только WS realtime)")
else:
    logger.info("🔄 VOICE API MODE: DISABLED (legacy VoiceAsk активен)")

# Voice Control integration
VOICE_CONTROL_URL = os.getenv("VOICE_CONTROL_URL", "http://localhost:8080")
VOICE_INTERNAL_KEY = os.getenv("VOICE_INTERNAL_KEY", "")

def normalize_event(*, event_type: str, role: str, text: str | None, timestamp: float | None = None) -> dict | None:
    """
    Приводит событие к валидному формату Voice Control.
    Возвращает None, если событие невалидно и не должно быть отправлено.
    """
    if not text:
        return None

    text = text.strip()
    if not text:
        return None

    if role not in ("user", "assistant"):
        return None

    return {
        "role": role,
        "text": text,
        "utterance_id": None,  # Пока не используем utterance_id для простоты
        "ts": int((timestamp or time.time()) * 1000),
    }

async def push_event_to_voice_control(session_id: str, event_payload: dict):
    """Отправить нормализованное событие диалога в Voice Control"""
    if not VOICE_INTERNAL_KEY or not VOICE_CONTROL_URL:
        return

    if not event_payload:
        print(f"[EVENT] Dropped invalid event for session {session_id}")
        return

    url = f"{VOICE_CONTROL_URL}/v1/internal/voice/sessions/{session_id}/events"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(2.0)) as client:
            response = await client.post(
                url,
                headers={"X-Internal-Key": VOICE_INTERNAL_KEY, "Content-Type": "application/json"},
                json=event_payload,
            )
            if response.status_code == 200:
                print(f"[VOICE_CONTROL] Event pushed: {event_payload.get('role')} ({len(event_payload.get('text', ''))} chars)")
            else:
                print(f"[VOICE_CONTROL] Push failed: HTTP {response.status_code}")
    except Exception as e:
        # Не блокируем realtime, просто логируем
        print(f"[VOICE_CONTROL] Push error: {e}")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "2700"))
MODEL_PATH = os.getenv("MODEL_PATH", "/Users/artembutko/Desktop/VS/models/vosk-model-small-ru-0.22")
DEFAULT_SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", "16000"))

# LLM API configuration (OpenAI by default)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")  # openai, deepseek, or other
LLM_API_KEY = os.getenv("LLM_API_KEY")
if not LLM_API_KEY:
    raise RuntimeError("LLM_API_KEY is not set")

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com")
OPENAI_BASE_URL = LLM_BASE_URL  # Для совместимости с кодом
OPENAI_API_KEY = LLM_API_KEY  # Для совместимости с кодом
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-3.5-turbo")
OPENAI_MODEL = LLM_MODEL  # Для совместимости с кодом
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "160"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.3"))

# TTS настройки
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "local")  # local (silero) or openai
TTS_BASE_URL = os.getenv("TTS_BASE_URL", "http://127.0.0.1:8002")
TTS_API_KEY = os.getenv("TTS_API_KEY")  # для внешних API
TTS_MODEL = os.getenv("TTS_MODEL", "silero_ru")
TTS_VOICE = os.getenv("TTS_VOICE", "eugene")
TTS_SPEED = float(os.getenv("TTS_SPEED", "0.93"))
TTS_EMOTION = os.getenv("TTS_EMOTION", "neutral")
TTS_PAUSE = float(os.getenv("TTS_PAUSE", "0.12"))
TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "10"))

# JWT Configuration для проверки токенов
VOICE_JWT_SECRET = os.getenv("VOICE_JWT_SECRET", "super-secret-voice-2026")
# Локальный режим: отключить проверку токена для разработки
LOCAL_MODE = os.getenv("LOCAL_MODE", "true").lower() == "true"
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "true").lower() == "true"
VOICE_JWT_ISSUER = os.getenv("VOICE_JWT_ISSUER", "voice-control")
VOICE_JWT_AUD = "voice-ws"

# TTS Settings dataclass для передачи параметров в TTSBackend
@dataclass(frozen=True)
class TTSSettings:
    model: str
    voice: str
    speed: float
    emotion: str
    pause: float
    timeout: float

# Бинарный протокол аудио
MIME_WAV = 1
AUDIO_MAGIC = b"AUD0"

# Фиксированная политика sample rate
ALLOWED_SAMPLE_RATE = 16000

def normalize_sample_rate(requested: int | None) -> int:
    """Нормализует sample_rate: сервер поддерживает только 16000 Hz PCM16 mono"""
    if requested != ALLOWED_SAMPLE_RATE:
        print(f"[CONFIG] Client requested sample_rate={requested}, forcing to {ALLOWED_SAMPLE_RATE}")
        return ALLOWED_SAMPLE_RATE
    return requested

# Структуры для хранения истории диалога
from dataclasses import dataclass, field

@dataclass
class Turn:
    role: str            # "user" | "assistant"
    text: str
    ts: int = field(default_factory=lambda: int(time.time() * 1000))
    utterance_id: int | None = None

@dataclass
class SessionState:
    session_id: str
    agent_id: str
    turns: list[Turn] = field(default_factory=list)
    llm_buffers: dict[int, str] = field(default_factory=dict)
    summary: str = ""
    ended: bool = False
    ended_at_ms: int | None = None

    def add_turn(self, role: str, text: str, utterance_id: int | None = None):
        text = (text or "").strip()
        if not text:
            return
        self.turns.append(Turn(role=role, text=text, utterance_id=utterance_id))
        print(f"[SESSION:{self.session_id}] Added {role} turn: '{text[:50]}...'")

    def build_llm_messages(self, system_prompt: str, max_turns: int = 12):
        history = self.turns[-max_turns:]
        messages = [{"role": "system", "content": system_prompt}]
        for t in history:
            messages.append({"role": "user" if t.role == "user" else "assistant", "content": t.text})
        return messages

# Глобальный реестр сессий
SESSIONS: dict[str, SessionState] = {}

def build_session_summary(session: SessionState) -> str:
    """Формирует резюме сессии на основе истории диалога"""
    turns = session.turns
    user_facts = []
    emotions = []
    topics = []

    # Собираем информацию из реплик пользователя
    for t in turns:
        if t.role == "user":
            user_facts.append(t.text)
            # Простой анализ эмоций
            text_lower = t.text.lower()
            if any(word in text_lower for word in ["устал", "грустно", "плохо", "стресс", "тревога"]):
                emotions.append("тревожное состояние")
            elif any(word in text_lower for word in ["хорошо", "отлично", "в порядке", "спасибо"]):
                emotions.append("положительное")
            else:
                emotions.append("нейтральное")

    # Формируем резюме
    return (
        "Краткое резюме сессии:\n"
        f"Основные темы: {', '.join(topics[:3] if topics else ['консультация'])[:50]}\n"
        f"Состояние пользователя: {', '.join(set(emotions))[:50]}\n"
        f"Ключевые высказывания: {' | '.join(user_facts[-3:])[:100]}"
    )

# Health check настройки
HEALTH_PORT = int(os.getenv("HEALTH_PORT", "8081"))

# VAD и endpointing параметры
FRAME_MS = int(os.getenv("FRAME_MS", "20"))          # 10/20/30 ms
VAD_MODE = int(os.getenv("VAD_MODE", "2"))           # 0..3 (0 мягкий, 3 агрессивный)
EARLY_PAUSE_MS = int(os.getenv("EARLY_PAUSE_MS", "300"))   # Уменьшено: быстрее старт
FINAL_PAUSE_MS = int(os.getenv("FINAL_PAUSE_MS", "800"))   # Уменьшено: быстрее финал
STABLE_MS = int(os.getenv("STABLE_MS", "250"))
PARTIAL_RATE_LIMIT_MS = int(os.getenv("PARTIAL_RATE_LIMIT_MS", "150"))
MIN_WORDS_EARLY = int(os.getenv("MIN_WORDS_EARLY", "1"))   # Было 3: теперь реагирует на 1 слово
MIN_CHARS_EARLY = int(os.getenv("MIN_CHARS_EARLY", "3"))   # Было 12: теперь реагирует на "Да", "Нет"
RESTART_DEBOUNCE_MS = int(os.getenv("RESTART_DEBOUNCE_MS", "200")) # Было 1200! Теперь мгновенно.

# Глобальный HTTP клиент для DeepSeek (keep-alive)
_deepseek_http: httpx.AsyncClient | None = None

# Глобальный HTTP клиент для TTS (keep-alive)
_tts_http: httpx.AsyncClient | None = None

# Опционально: ограничить Origin (продовая гигиена)
ALLOWED_ORIGINS = set(
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()
)

# Чтобы event loop не “умирал” на CPU-bound декодинге, гоняем декод в thread pool
DECODE_IN_THREAD = os.getenv("DECODE_IN_THREAD", "1") == "1"

print(f"[boot] loading model: {MODEL_PATH}")
MODEL = Model(MODEL_PATH)
print("[boot] model loaded")


def verify_ws_token(token: str) -> dict:
    """Проверяет JWT токен и возвращает payload"""
    return jwt.decode(
        token,
        VOICE_JWT_SECRET,
        algorithms=["HS256"],
        audience=VOICE_JWT_AUD,
        issuer=VOICE_JWT_ISSUER,
    )


def build_llm_payload(question: str, *, model: str, system_prompt: str, max_tokens: int, temperature: float) -> dict:
    """Строит payload для LLM API с параметрами агента"""
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,  # ВКЛЮЧАЕМ STREAMING для минимального TTFT
    }

async def init_openai_http():
    """Инициализирует глобальный HTTP клиент для OpenAI с keep-alive"""
    global _deepseek_http
    if _deepseek_http is None:
        _deepseek_http = httpx.AsyncClient(
            base_url=OPENAI_BASE_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(30.0, connect=5.0),
            http2=True,
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=60.0,
            ),
        )

async def close_openai_http():
    """Закрывает глобальный HTTP клиент для OpenAI"""
    global _deepseek_http
    if _deepseek_http is not None:
        await _deepseek_http.aclose()
        _deepseek_http = None

# TTS HTTP клиент для внешних API
_tts_api_http: httpx.AsyncClient | None = None

async def init_tts_api_http():
    """Инициализирует HTTP клиент для внешних TTS API"""
    global _tts_api_http
    if _tts_api_http is None:
        _tts_api_http = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=5.0),
            http2=True,
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=20,
                keepalive_expiry=60.0,
            ),
        )

async def close_tts_api_http():
    """Закрывает HTTP клиент для внешних TTS API"""
    global _tts_api_http
    if _tts_api_http is not None:
        await _tts_api_http.aclose()
        _tts_api_http = None

async def init_tts_http():
    """Инициализирует глобальный HTTP клиент для TTS"""
    global _tts_http
    if _tts_http is None:
        _tts_http = httpx.AsyncClient(
            base_url=TTS_BASE_URL,
            timeout=httpx.Timeout(TTS_TIMEOUT, connect=2.0),
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=10,
                keepalive_expiry=60.0,
            ),
        )

async def close_tts_http():
    """Закрывает глобальный HTTP клиент для TTS"""
    global _tts_http
    if _tts_http is not None:
        await _tts_http.aclose()
        _tts_http = None

async def health_server():
    async def handle(reader, writer):
        try:
            data = await reader.read(4096)
            if not data:
                writer.close()
                return

            # parse first line: METHOD PATH HTTP/1.1
            line0 = data.split(b"\r\n", 1)[0].decode("utf-8", "ignore")
            parts = line0.split()
            method = parts[0] if len(parts) > 0 else ""
            path = parts[1] if len(parts) > 1 else ""

            # --- /health ---
            if method == "GET" and path.startswith("/health"):
                body = b"ok"
                writer.write(
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: text/plain\r\n"
                    b"Content-Length: 2\r\n\r\n" + body
                )
                await writer.drain()
                writer.close()
                return

            # --- /v1/voice/sessions/{id}/summary ---
            if method == "GET" and path.startswith("/v1/voice/sessions/") and path.endswith("/summary"):
                session_id = path.split("/v1/voice/sessions/", 1)[1].rsplit("/summary", 1)[0]
                sess = SESSIONS.get(session_id)
                if not sess:
                    body = json.dumps({"ok": False, "error": "unknown_session"}).encode()
                    writer.write(
                        b"HTTP/1.1 404 Not Found\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                    )
                    await writer.drain()
                    writer.close()
                    return

                body = json.dumps({"ok": True, "session_id": session_id, "summary": sess.summary}).encode("utf-8")
                writer.write(
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: application/json\r\n"
                    b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                )
                await writer.drain()
                writer.close()
                return

            # --- /v1/voice/sessions/{id}/end ---
            if method == "POST" and path.startswith("/v1/voice/sessions/") and path.endswith("/end"):
                session_id = path.split("/v1/voice/sessions/", 1)[1].rsplit("/end", 1)[0]
                sess = SESSIONS.get(session_id)
                if not sess:
                    body = json.dumps({"ok": False, "error": "unknown_session"}).encode()
                    writer.write(
                        b"HTTP/1.1 404 Not Found\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                    )
                    await writer.drain()
                    writer.close()
                    return

                if not sess.summary and sess.turns:
                    try:
                        sess.summary = build_session_summary(sess)
                    except Exception as e:
                        sess.summary = f"summary_error: {e}"

                sess.ended = True
                sess.ended_at_ms = now_ms()

                body = json.dumps({"ok": True, "session_id": session_id, "summary": sess.summary}).encode("utf-8")
                writer.write(
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: application/json\r\n"
                    b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                )
                await writer.drain()
                writer.close()
                return

            # default 404
            body = b"not found"
            writer.write(
                    b"HTTP/1.1 404 Not Found\r\n"
                    b"Content-Type: text/plain\r\n"
                b"Content-Length: 9\r\n\r\n" + body
                )
            await writer.drain()
        except Exception as e:
            print(f"[HEALTH] Ошибка: {e}")
        finally:
            try:
                writer.close()
            except:
                pass

    try:
        srv = await asyncio.start_server(handle, "0.0.0.0", HEALTH_PORT)
        print(f"[HTTP] Health/API сервер запущен на порту {HEALTH_PORT}")
        return srv
    except Exception as e:
        print(f"[HTTP] Не удалось запустить health/api сервер: {e}")
        return None

async def openai_stream(
    question: str = None,
    *,
    messages: list[dict] = None,
    model: str = None,
    system_prompt: str = None,
    max_tokens: int = None,
    temperature: float = None,
):
    """
    Streaming генератор для OpenAI API.
    Yield'ит токены по мере генерации для минимального TTFT.

    - Если передали messages -> используем их
    - Иначе собираем messages из system_prompt + question (legacy)
    """
    # Если параметры не переданы, используем глобальные дефолты
    if model is None:
        model = LLM_MODEL
    if max_tokens is None:
        max_tokens = MAX_TOKENS
    if temperature is None:
        temperature = TEMPERATURE

    # СТРОИМ MESSAGES
    if messages is None:
        if question is None:
            raise ValueError("Either messages or question must be provided")
        if system_prompt is None:
            system_prompt = "Отвечай кратко и по делу. 1-2 предложения. Без рассуждений."
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]

    print(f"[OPENAI] Начинаем streaming для: {len(messages)} messages")
    await init_openai_http()
    assert _deepseek_http is not None

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    print(f"[OPENAI] Payload ready, streaming...")

    try:
        async with _deepseek_http.stream("POST", "/v1/chat/completions", json=payload) as r:
            print(f"[OPENAI] Response status: {r.status_code}")
            r.raise_for_status()

            async for line in r.aiter_lines():
                if not line:
                    continue
                if line.startswith(":"):
                    # keep-alive comment, игнорируем
                    continue
                if not line.startswith("data:"):
                    continue

                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    print("[OPENAI] Streaming completed")
                    break

                try:
                    chunk = json.loads(data)
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue

                    delta = (choices[0].get("delta") or {})
                    text = delta.get("content")
                    if text:
                        print(f"[OPENAI] Yielding token: '{text}'")
                        yield text
                except json.JSONDecodeError:
                    continue  # игнорируем битые чанки
    except Exception as e:
        print(f"[OPENAI] Error in streaming: {e}")
        raise


def build_recognizer(sample_rate: int, phrase_list: Optional[list] = None, words: bool = False) -> KaldiRecognizer:
    if phrase_list:
        # grammar / phrase list: ограничивает словарь, ускоряет/улучшает в узких доменах
        rec = KaldiRecognizer(MODEL, sample_rate, json.dumps(phrase_list, ensure_ascii=False))
    else:
        rec = KaldiRecognizer(MODEL, sample_rate)
    rec.SetWords(bool(words))
    return rec

def now_ms() -> int:
    """Текущее время в миллисекундах"""
    return int(time.time() * 1000)

def frame_bytes(sample_rate: int, frame_ms: int) -> int:
    """Размер фрейма в байтах для mono PCM16"""
    return int(sample_rate * frame_ms / 1000) * 2

def word_count(text: str) -> int:
    """Количество слов в тексте"""
    return len([w for w in text.strip().split() if w])

def is_meaningful(text: str) -> bool:
    """Проверяет, имеет ли текст достаточный смысл для запуска ответа"""
    t = (text or "").strip()
    return (len(t) >= MIN_CHARS_EARLY) and (word_count(t) >= MIN_WORDS_EARLY)

async def call_with_retry(fn, retries=1, backoff=0.2):
    """Простой retry для сетевых вызовов"""
    for attempt in range(retries + 1):
        try:
            return await fn()
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            if attempt == retries:
                raise
            print(f"[RETRY] Попытка {attempt + 1} не удалась: {e}, ждем {backoff}s")
            await asyncio.sleep(backoff)
            backoff *= 2
        except httpx.HTTPStatusError as e:
            # Не ретраим 4xx ошибки
            if e.response.status_code < 500:
                raise
            if attempt == retries:
                raise
            print(f"[RETRY] Попытка {attempt + 1} не удалась: {e}, ждем {backoff}s")
            await asyncio.sleep(backoff)
            backoff *= 2

def split_for_tts(buf: str) -> tuple[list[str], str]:
    """
    Разбивает буфер текста на чанки для TTS.
    Возвращает (готовые_чанки, остаток_буфера).
    """
    N = 120  # Максимальная длина чанка в символах
    seps = [".", "!", "?", "\n"]

    out = []
    while True:
        cut = -1
        # Ищем ближайший разделитель предложений
        for s in seps:
            idx = buf.find(s)
            if idx != -1:
                cut = idx if cut == -1 else min(cut, idx)

        if cut != -1:
            # Нашли разделитель - отрезаем предложение
            chunk = buf[:cut+1].strip()
            buf = buf[cut+1:].lstrip()
            if chunk:
                out.append(chunk)
            continue

        if len(buf) >= N:
            # Ищем последнюю запятую или пробел перед лимитом для более естественного разбиения
            space_cut = buf.rfind(' ', 0, N)
            comma_cut = buf.rfind(',', 0, N)
            best_cut = max(space_cut, comma_cut)
            
            if best_cut > 50:  # Если нашли хорошую точку разбиения
                chunk = buf[:best_cut+1].strip()
                buf = buf[best_cut+1:].lstrip()
            else:
                # Разбиваем по лимиту
                chunk = buf[:N].strip()
                buf = buf[N:].lstrip()
            
            if chunk:
                out.append(chunk)
            continue

        break

    return out, buf

class TTSBackend:
    """Backend для работы с TTS API"""

    def __init__(self):
        self.cache: dict[str, bytes] = {}

    async def warmup_ack(self):
        """Прогреваем и кешируем ACK фразы для быстрого ответа"""
        self.ack_texts = (
            "Понимаю о чем речь.", "Давай разберемся.", "Слушаю внимательно.",
            "Продолжаем разговор.", "Я готов.", "Вникаю в суть.",
            "Разбираюсь в вопросе.", "Анализирую информацию.", "Обрабатываю данные.",
            "Изучаю детали.", "Концентрируюсь на теме.", "Воспринимаю информацию.",
            "Осмысливаю вопрос.", "Принимаю к сведению.", "Извлекаю смысл.",
            "Прорабатываю детали.", "Вникаю в контекст.", "Уясняю задачу.",
            "Принимаю запрос.", "Анализирую ситуацию."
        )
        for txt in self.ack_texts:
            try:
                self.cache[txt] = await self.synthesize_wav(txt)
                print(f"[TTS] ACK кеширован: '{txt}' ({len(self.cache[txt])} bytes)")
            except Exception as e:
                print(f"[TTS] Не удалось прогреть ACK '{txt}': {e}")

    def get_random_ack_text(self):
        """Возвращает случайную ACK фразу"""
        import random
        return random.choice(self.ack_texts)

    def get_random_ack_wav(self):
        """Возвращает случайную ACK фразу и её WAV данные"""
        ack_text = self.get_random_ack_text()
        return ack_text, self.cache.get(ack_text)

    async def _synthesize_openai_tts(self, text: str, lang: Optional[str] = None, settings: Optional[TTSSettings] = None) -> bytes:
        """Синтезирует речь через OpenAI TTS API"""
        # Если settings не переданы, используем глобальные дефолты
        if settings is None:
            settings = TTSSettings(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                speed=TTS_SPEED,
                emotion=TTS_EMOTION,
                pause=TTS_PAUSE,
                timeout=TTS_TIMEOUT,
            )
        
        await init_tts_api_http()
        assert _tts_api_http is not None

        # Определение голоса на основе языка
        voice = "alloy"  # default voice
        if lang and lang.startswith('ru'):
            voice = "alloy"  # OpenAI пока не имеет русскоязычных голосов, используем alloy
        elif lang and lang.startswith('en'):
            voice = "alloy"  # или "echo", "fable", "onyx", "nova", "shimmer"

        # Модель для OpenAI TTS
        model = "tts-1"  # или "tts-1-hd" для лучшего качества

        payload = {
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "wav",
            "speed": settings.speed
        }

        headers = {
            "Authorization": f"Bearer {TTS_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            response = await _tts_api_http.post(
                "https://api.openai.com/v1/audio/speech",
                json=payload,
                headers=headers
            )
            response.raise_for_status()
            print(f"[TTS] OpenAI TTS synthesized: '{text[:50]}...' ({len(response.content)} bytes)")
            return response.content
        except Exception as e:
            print(f"[TTS] OpenAI TTS failed: {e}")
            # Fallback to local TTS if available
            if TTS_PROVIDER == "openai":
                raise
            print("[TTS] Falling back to local TTS")
            return await self._synthesize_local_tts(text, lang)

    async def synthesize_wav(self, text: str, lang: Optional[str] = None, settings: Optional[TTSSettings] = None) -> bytes:
        """Синтезирует WAV из текста с автоопределением языка"""
        # Если settings не переданы, используем глобальные дефолты
        if settings is None:
            settings = TTSSettings(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                speed=TTS_SPEED,
                emotion=TTS_EMOTION,
                pause=TTS_PAUSE,
                timeout=TTS_TIMEOUT,
            )
        
        # Проверяем кеш
        if text in self.cache:
            return self.cache[text]

        # Выбор провайдера TTS
        if TTS_PROVIDER == "openai":
            return await self._synthesize_openai_tts(text, lang, settings)
        else:
            # Локальный TTS (Silero)
            await init_tts_http()
            assert _tts_http is not None

        # Автоопределение языка если не указан
        if lang is None:
            try:
                lang = detect(text.strip())
                print(f"[TTS] Detected language: {lang} for text: '{text[:50]}...'")
            except Exception as e:
                print(f"[TTS] Language detection failed: {e}, using 'ru' as default")
                lang = "ru"

        return await self._synthesize_local_tts(text, lang, settings)

    async def _synthesize_local_tts(self, text: str, lang: Optional[str] = None, settings: Optional[TTSSettings] = None) -> bytes:
        """Локальный TTS через Silero (прямой вызов без HTTP)"""
        # Если settings не переданы, используем глобальные дефолты
        if settings is None:
            settings = TTSSettings(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                speed=TTS_SPEED,
                emotion=TTS_EMOTION,
                pause=TTS_PAUSE,
                timeout=TTS_TIMEOUT,
            )
        
        try:
            # Выбор модели и голоса на основе языка
            model_to_use = settings.model
            voice_to_use = settings.voice

            if lang and lang.startswith('en'):
                if settings.model == "silero_ru":
                    model_to_use = "silero_en"
                    voice_to_use = "en_0"  # Английский голос по умолчанию
                elif settings.model == "silero_en":
                    voice_to_use = settings.voice if settings.voice.startswith('en_') else "en_0"
            elif lang and lang.startswith('ru'):
                if settings.model == "silero_en":
                    model_to_use = "silero_ru"
                    voice_to_use = "eugene"  # Русский голос по умолчанию
                elif settings.model == "silero_ru":
                    voice_to_use = settings.voice if settings.voice in ["eugene", "aidar", "xenia", "baya", "kseniya"] else "eugene"

            print(f"[TTS] Using direct Silero: model={model_to_use}, voice={voice_to_use}, lang={lang}")
            
            # Прямой вызов tts_silero без HTTP
            wav_bytes = await tts_silero.synthesize_wav(
                text=text,
                model_name=model_to_use,
                voice=voice_to_use,
                speed=settings.speed,
                emotion=settings.emotion,
                pause=settings.pause
            )
            
            print(f"[TTS] Synthesized {len(wav_bytes)} bytes directly")
            return wav_bytes
            
        except Exception as e:
            print(f"[TTS] Direct synthesis failed: {e}")
            # Fallback: попробуем через HTTP, если доступен
            try:
                await init_tts_http()
                if _tts_http is not None:
                    print(f"[TTS] Trying HTTP fallback...")
                    r = await _tts_http.post("/tts_wav", json={
                        "text": text,
                        "model": model_to_use,
                        "voice": voice_to_use,
                        "speed": settings.speed,
                        "emotion": settings.emotion,
                        "pause_between_sentences": settings.pause,
                    }, timeout=5.0)
                    r.raise_for_status()
                    return r.content
            except Exception as http_e:
                raise RuntimeError(f"TTS synthesis failed (direct: {e}, HTTP: {http_e})")
            raise RuntimeError(f"TTS synthesis failed: {e}")


async def decode_accept(rec: KaldiRecognizer, chunk: bytes) -> bool:
    if DECODE_IN_THREAD:
        return await asyncio.to_thread(rec.AcceptWaveform, chunk)
    return rec.AcceptWaveform(chunk)


async def call_tts_api(text: str) -> str:
    """Вызывает TTS API для озвучки текста - возвращает base64 WAV bytes"""
    try:
        import base64

        tts_url = "http://localhost:8000/tts_wav"
        payload = {
            "text": text,
            "model": "silero_ru",
            "voice": "eugene",
            "speed": 1.05,  # Немного быстрее для realtime
            "emotion": "neutral",
            "pause_between_sentences": 0.12  # Минимальная пауза
        }

        async with httpx.AsyncClient(timeout=30.0) as client:  # Уменьшен таймаут
            response = await client.post(tts_url, json=payload)
            if response.status_code == 200:
                # Возвращаем base64 encoded WAV bytes
                wav_bytes = response.content
                wav_base64 = base64.b64encode(wav_bytes).decode('utf-8')
                return f"data:audio/wav;base64,{wav_base64}"
            else:
                return f"Ошибка TTS: {response.status_code}"
    except Exception as e:
        return f"Ошибка TTS API: {str(e)}"


def should_restart_llm(new_text: str, old_text: str) -> bool:
    """Эвристика: нужно ли перезапускать LLM при изменении текста"""
    new_text = (new_text or "").strip()
    old_text = (old_text or "").strip()
    if not old_text:
        return True
    if new_text == old_text:
        return False

    # 1) существенный рост длины (>30%)
    if len(new_text) > int(len(old_text) * 1.3):
        return True

    # 2) если новая строка сильно "перестроилась"
    # общий префикс меньше половины старого текста
    common = 0
    for a, b in zip(new_text, old_text):
        if a == b:
            common += 1
        else:
            break
    if common < max(1, len(old_text) // 2):
        return True

    return False

# ---------- Интеллектуальный endpointing: функции ----------

def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v

def update_pause_ema(pause_ema_ms: float, pause_ms: float, alpha: float) -> float:
    # учитываем только "внутренние" паузы (запинки), не финальные
    if pause_ms <= 800:
        return pause_ema_ms * (1 - alpha) + pause_ms * alpha
    return pause_ema_ms

def compute_adaptive_thresholds(text: str, wps: float, pause_ema: float) -> tuple[int, int, int]:
    """Расчет адаптивных порогов для FSM endpointing"""
    wc = len(text.strip().split())

    # Базовые пороги от типичной внутрипредложенческой паузы
    tent = max(int(pause_ema * 1.2), 300)
    confirm = max(int(pause_ema * 2.5), 900)
    final = confirm + 500

    # Коррекция по длине фразы
    if wc < 4:
        confirm += 200
        final += 300

    # Коррекция по качеству концовки
    if not is_good_end(text):
        confirm += 300

    # Коррекция по скорости речи
    if wps > 2.5:
        confirm += 100

    return tent, confirm, final

def compute_thresholds(pause_ema_ms: float, tentative_min: int, confirm_min: int, confirm_max: int) -> tuple[int, int]:
    """Устаревшая версия для совместимости"""
    tentative = int(clamp(pause_ema_ms * 1.3, tentative_min, 650))
    confirm = int(clamp(pause_ema_ms * 3.0, confirm_min, confirm_max))
    return tentative, confirm

CONTINUE_WORDS = {
    "что","который","которая","которые","чтобы","потому","потому что",
    "если","когда","почему","зачем","как","где","куда","откуда",
    "и","а","но","или","ли","то","это","вот"
}
FILLERS = {"э","эм","ну","типа","короче","значит","мм"}

# Расширенные словари для continuation penalty
# Эвристики для определения плохих концовок фраз
BAD_ENDINGS = {
    "и", "а", "но", "или", "что", "если", "то", "который", "которая", "которые",
    "чтобы", "потому", "также", "либо", "вот", "это", "так", "как", "где", "куда",
    "откуда", "зачем", "почему", "когда", "тогда", "здесь", "там", "тут"
}

def is_good_end(text: str) -> bool:
    """Проверяет, является ли конец фразы хорошим для завершения"""
    words = text.strip().lower().split()
    if len(words) < 3:
        return False
    return words[-1] not in BAD_ENDINGS

def common_prefix_len(a: str, b: str) -> int:
    """Длина общего префикса двух строк"""
    n = 0
    for x, y in zip(a, b):
        if x == y:
            n += 1
        else:
            break
    return n

def is_tail_jitter(new: str, old: str, max_tail: int = 3) -> bool:
    """Проверяет, является ли изменение только jitter'ом на хвосте"""
    new = (new or "").strip()
    old = (old or "").strip()
    if not old or not new or new == old:
        return False
    cp = common_prefix_len(new, old)
    tail_new = len(new) - cp
    tail_old = len(old) - cp
    return max(tail_new, tail_old) <= max_tail

def update_wps_ema(wps_ema: float, prev_words: int, new_words: int, dt_ms: int, alpha: float = 0.2) -> float:
    """Обновляет EMA скорости речи (слов/сек)"""
    if dt_ms <= 0:
        return wps_ema
    dw = max(0, new_words - prev_words)
    inst = (dw * 1000.0) / dt_ms
    if inst <= 0:
        return wps_ema
    return wps_ema * (1 - alpha) + inst * alpha

def continuation_penalty_ms(text: str) -> int:
    """Штраф на продолжение по лексическому контексту"""
    w = last_word(text)
    if not w:
        return 0
    # жёсткий штраф за явное продолжение
    if w in CONJ or w in PREPOSITIONS:
        return 450
    if w in PARTICLES or w in FILLERS:
        return 300
    # короткие служебные слова на конце
    if len(w) <= 2:
        return 250
    # обрыв на цифре/сокращении часто не конец
    if w.isdigit():
        return 300
    return 0

def last_word(text: str) -> str:
    t = (text or "").strip().lower()
    if not t:
        return ""
    parts = t.split()
    return parts[-1] if parts else ""

def need_stricter_confirm(text: str) -> bool:
    w = last_word(text)
    return (w in CONTINUE_WORDS) or (w in FILLERS)

async def handler(ws: WebSocketServerProtocol):
    print("[HANDLER] Новое WebSocket соединение")

    # Состояние WebSocket и очередности сообщений
    ws_send_lock = asyncio.Lock()
    tts_sending = False  # Флаг активной отправки TTS сессии (окно между tts_start и tts_end)

    # Voice Protocol State Machine
    voice_state = VoiceState.IDLE
    handshake_done = False  # Флаг завершения handshake (получен config)

    async def ws_send(message: Union[str, bytes]):
        """Единый метод отправки для гарантии порядка"""
        async with ws_send_lock:
            await ws.send(message)

    async def safe_send_locked(payload: dict):
        """Потокобезопасная отправка WebSocket сообщений (JSON)"""
        msg_type = payload.get('type') or payload.get('event') or 'unknown'
        print(f"[WS] → JSON {msg_type}")
        data = json.dumps(payload, ensure_ascii=False)
        await ws_send(data)

    def proto_violation(msg: str):
        """Log protocol violation for debugging"""
        print(f"[PROTO VIOLATION] {msg}")

    async def send_audio_binary(u_id: int, wav_bytes: bytes):
        """Отправка аудио бинарным фреймом вместо base64"""
        if voice_state != VoiceState.ASSISTANT_TTS:
            proto_violation(f"Audio chunk sent while not in ASSISTANT_TTS state (u_id={u_id})")
            return

        if not tts_sending:
            proto_violation(f"Audio chunk sent outside tts window (u_id={u_id})")
            return

        print(f"[WS] → BIN audio {len(wav_bytes)} bytes")
        header = struct.pack("<4sIHI", AUDIO_MAGIC, u_id, MIME_WAV, len(wav_bytes))
        await ws_send(header + wav_bytes)

    # Origin check (опционально)
    if ALLOWED_ORIGINS:
        try:
            request_headers_origin = ws.request_headers if hasattr(ws, 'request_headers') else ws.request.headers
            origin = request_headers_origin.get("Origin")
        except AttributeError:
            origin = None
        if not origin or origin not in ALLOWED_ORIGINS:
            await ws.close(code=1008, reason="Origin not allowed")
            return

    # JWT Token проверка и загрузка профиля агента
    # Читаем токен из Authorization header
    # Поддержка разных версий websockets
    try:
        request_headers = ws.request_headers if hasattr(ws, 'request_headers') else ws.request.headers
    except AttributeError:
        request_headers = {}

    auth_header = request_headers.get("Authorization")

    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "").strip()

    # FALLBACK: token из query (?token=...)
    if not token:
        try:
            # Поддержка разных версий websockets
            ws_path = ws.path if hasattr(ws, 'path') else (ws.request.path if hasattr(ws, 'request') else '/unknown')
            parsed = urlparse(ws_path)  # содержит query
            qs = parse_qs(parsed.query)
            token = (qs.get("token") or qs.get("access_token") or qs.get("jwt") or [None])[0]
        except Exception as e:
            print(f"[AUTH] Error parsing query: {e}")
            token = None

    # Локальный режим: пропускаем аутентификацию
    if DISABLE_AUTH or LOCAL_MODE:
        print("[AUTH] 🔓 Local mode: authentication disabled")
        agent_id = "assistant"  # Используем дефолтный агент
        session_id = f"local-{int(time.time() * 1000)}"
        payload = {"agent": agent_id, "sub": session_id}
    else:
        # Production режим: требуется токен
        if not token:
            print("[AUTH] Missing token (Authorization/query), closing connection")
            try:
                ws_path = ws.path if hasattr(ws, 'path') else (ws.request.path if hasattr(ws, 'request') else '/unknown')
                print(f"[AUTH] Debug: ws.path = {ws_path}")
            except Exception as e:
                print(f"[AUTH] Debug: Cannot access path: {e}")
            print(f"[AUTH] Debug: Authorization header = {auth_header}")
            await ws.close(code=4001, reason="Missing token")
            return

        try:
            payload = verify_ws_token(token)
        except Exception as e:
            print(f"[AUTH] Invalid token: {e}")
            await ws.close(code=4001, reason="Invalid token")
            return

        agent_id = payload.get("agent")
        if not agent_id or agent_id not in AGENTS:
            print(f"[AUTH] Unknown agent: {agent_id}")
            await ws.close(code=1008, reason="Unknown agent")
            return

        session_id = payload.get("sub")

    agent = AGENTS[agent_id]

    print(f"[AUTH] ✅ Authenticated: session={session_id}, agent={agent_id}")

    # State transition: authenticated, ready for user input
    voice_state = VoiceState.USER_SPEAKING

    # ИНИЦИАЛИЗАЦИЯ СЕССИИ ДЛЯ ХРАНЕНИЯ КОНТЕКСТА
    session = SESSIONS.get(session_id)
    if not session:
        session = SessionState(session_id=session_id, agent_id=agent_id)
        SESSIONS[session_id] = session
        print(f"[SESSION:{session_id}] Created new session with agent {agent_id}")
    else:
        print(f"[SESSION:{session_id}] Resumed existing session with {len(session.turns)} turns")

    # Настройки LLM для этой сессии
    llm_model = agent.get("model") or agent.get("llm_model", "deepseek-chat")
    llm_temp = agent.get("temperature", 0.4)
    llm_max_tokens = agent.get("max_tokens", 220)
    system_prompt = agent.get("system_prompt", "Ты ассистент.")

    # Настройки TTS для этой сессии
    tts_settings = TTSSettings(
        model=agent.get("tts_model", "silero_ru"),
        voice=agent.get("tts_voice", "eugene"),
        speed=agent.get("tts_speed", 1.05),
        emotion=agent.get("tts_emotion", "neutral"),
        pause=agent.get("tts_pause", 0.12),
        timeout=TTS_TIMEOUT,
    )

    print(f"[AGENT] Profile: model={llm_model}, temp={llm_temp}, max_tokens={llm_max_tokens}")
    print(f"[AGENT] TTS: model={tts_settings.model}, voice={tts_settings.voice}, speed={tts_settings.speed}")

    # HELPER FUNCTIONS ДЛЯ ОБРАБОТКИ FINAL TEXT И ЗАЩИТЫ ОТ ЭХА
    def _norm(s: str) -> str:
        return " ".join((s or "").lower().strip().split())

    def _is_echo_like(text: str, session: SessionState) -> bool:
        # простая защита: если final слишком похож на последний assistant
        u = _norm(text)
        if len(u) < 8:
            return False
        last_a = ""
        for t in reversed(session.turns):
            if t.role == "assistant" and t.text:
                last_a = _norm(t.text)
                break
        if not last_a:
            return False
        # грубый similarity: совпадение по префиксу/подстроке
        return (u in last_a) or (last_a in u) or (u[:40] == last_a[:40])

    async def handle_final_text(final_text: str, reason: str):
        nonlocal ack_sent_for_turn, llm_started, current_llm_input, active_output_u, tts_allowed_u

        final_text = (final_text or "").strip()
        if not final_text:
            return

        session = SESSIONS.get(session_id)
        if session:
            # 1) анти-эхо: если сейчас шёл TTS или очень близко к последнему чанку — не принимаем final как user
            if tts_playing or (now_ms() - last_tts_chunk_ms) < BARGE_IN_IGNORE_AFTER_TTS_MS:
                print(f"[ECHO] drop final during/after tts: '{final_text[:80]}...'")
                return

            # 2) анти-эхо по содержанию
            if _is_echo_like(final_text, session):
                print(f"[ECHO] drop echo-like final: '{final_text[:80]}...'")
                return

            # 3) сохраняем user turn (ВАЖНО: делать именно тут)
            session.add_turn("user", final_text)

            # Отправляем нормализованное событие в Voice Control
            event = normalize_event(
                event_type="final",
                role="user",
                text=final_text,
            )
            if event:
                await push_event_to_voice_control(session_id, event)
                print(f"[SESSION:{session_id}] Added user turn, total turns: {len(session.turns)}")
            else:
                print(f"[EVENT] Dropped invalid user event: text='{final_text[:50]}...'")

        # 4) запуск/рестарт LLM
        print(f"[TTS] enqueue: '{final_text[:50]}...'")
        if not llm_started:
            play_ack = not ack_sent_for_turn
            await start_or_restart_llm(final_text, reason=reason, play_ack=play_ack, allow_tts=True)
            if play_ack:
                ack_sent_for_turn = True
        elif should_restart_llm(final_text, current_llm_input):
            await start_or_restart_llm(final_text, reason=f"{reason}_restart", play_ack=False, allow_tts=True)
        else:
            # LLM уже идёт, просто разрешаем озвучку
            if tts_allowed_u == 0 and active_output_u != 0:
                tts_allowed_u = active_output_u

    sample_rate = DEFAULT_SAMPLE_RATE
    phrase_list = None
    words = False

    rec = build_recognizer(sample_rate, phrase_list=phrase_list, words=words)

    # Инициализация VAD
    vad = webrtcvad.Vad(VAD_MODE)

    # Добавляем soft_reset метод для плавной реинициализации
    def vad_soft_reset():
        """
        Мягкий сброс VAD: сохраняет историю, но сбрасывает временные счетчики.
        Не требует новой длинной тишины для старта детекта речи.
        """
        # webrtcvad не имеет публичного API для soft reset
        # поэтому просто ничего не делаем - VAD продолжит работу с текущим состоянием
        pass

    vad.soft_reset = vad_soft_reset

    fb = frame_bytes(sample_rate, FRAME_MS)
    audio_buf = bytearray()

    # Состояние для VAD и endpointing
    last_voice_ms = now_ms()
    last_partial = ""
    last_partial_change_ms = now_ms()
    last_partial_sent_ms = 0
    early_endpoint_fired = False

    # Состояние для управления turn и ACK
    turn_id = 0
    ack_sent_for_turn = False
    pause_gate_open = True  # gate для триггера старта/рестарта по паузе
    last_restart_ms = 0

    # ASR mute во время TTS
    asr_enabled = True
    asr_warming_up = False
    ASR_WARMUP_MS = 200  # 200ms оптимально для turn-taking
    asr_warmup_deadline = 0.0

    # Состояние LLM конвейера
    utterance_id = 0
    current_llm_task: asyncio.Task | None = None
    llm_started = False
    current_llm_input = ""
    llm_started_at_ms = 0
    llm_first_token_at_ms = 0

    # TTS конвейер
    tts = TTSBackend()
    print("[INIT] Начинаем warmup ACK фраз...")
    await tts.warmup_ack()  # Прогреваем ACK
    print("[INIT] Warmup ACK завершен")

    # Очередь от LLM к TTS
    llm_to_tts_q: asyncio.Queue[tuple[int, str]] = asyncio.Queue(maxsize=5000)
    # tuple: (utterance_id, token_or_marker)
    # пустая строка "" - сигнал завершения

    tts_task: asyncio.Task | None = None

    # --- Barge-in config ---
    BARGE_IN_ENABLED = os.getenv("BARGE_IN_ENABLED", "1") == "1"
    BARGE_IN_MIN_VOICE_MS = int(os.getenv("BARGE_IN_MIN_VOICE_MS", "1000"))   # Увеличено до 1 сек для теста
    BARGE_IN_COOLDOWN_MS = int(os.getenv("BARGE_IN_COOLDOWN_MS", "2000"))    # Увеличен cooldown
    BARGE_IN_IGNORE_AFTER_TTS_MS = int(os.getenv("BARGE_IN_IGNORE_AFTER_TTS_MS", "500"))  # Увеличено
    BARGE_IN_ARM_SILENCE_MS = int(os.getenv("BARGE_IN_ARM_SILENCE_MS", "1000"))  # Увеличено до 1 сек

    # Endpointing интеллектуальные настройки
    TENTATIVE_PAUSE_MIN_MS = int(os.getenv("TENTATIVE_PAUSE_MIN_MS", "350"))
    CONFIRM_PAUSE_MIN_MS = int(os.getenv("CONFIRM_PAUSE_MIN_MS", "1100"))
    CONFIRM_PAUSE_MAX_MS = int(os.getenv("CONFIRM_PAUSE_MAX_MS", "1700"))

    PAUSE_EMA_ALPHA = float(os.getenv("PAUSE_EMA_ALPHA", "0.15"))  # сглаживание

    # --- Output state ---
    active_output_u = 0          # utterance_id, который сейчас озвучивается/генерится
    output_active = False        # идёт ответ (LLM/TTS)
    tts_epoch = 0                # версия потока TTS, чтобы мгновенно "обесценивать" отправки после abort

    # --- Barge-in runtime ---
    voice_run_ms = 0
    last_barge_in_ms = 0
    last_tts_chunk_ms = 0        # когда последний раз отправили аудио (ACK/чанк)

    # --- Barge-in arming state ---
    tts_playing = False          # сервер считает, что сейчас идёт озвучка
    barge_armed = False          # barge-in разрешён только после тишины
    silent_run_ms = 0            # сколько подряд тишины во время output_active

    # --- Intelligent endpointing state ---
    pause_ema_ms = 350.0         # адаптивная оценка "типичной внутрипредложенческой паузы"
    silence_start_ms = 0         # когда началась последняя тишина
    was_voice_prev = False       # предыдущее состояние голоса

    # Скорость речи (WPS - words per second) для динамических порогов
    wps_ema = 2.2  # начальная оценка ~2.2 слов/сек
    prev_wc = 0     # предыдущее количество слов
    prev_wc_ts_ms = 0  # timestamp предыдущего измерения

    # FSM для endpointing (определения окончания фразы)
    endpoint_state = "listening"  # listening | tentative | confirmed | final
    endpoint_tentative_start_ms = 0  # когда вошли в tentative
    endpoint_confirmed_start_ms = 0  # когда вошли в confirmed

    # --- TTS gating: нельзя говорить, пока нет подтверждения конца ---
    tts_allowed_u = 0            # utterance_id, которому разрешено озвучивание

    async def run_llm(u_id: int, prompt_text: str):
        """Запуск LLM streaming для конкретного utterance_id"""
        print(f"[LLM] run_llm started for utterance {u_id}: '{prompt_text}'")
        nonlocal llm_first_token_at_ms

        try:
            await safe_send_locked({"type": "nlu_start", "utterance_id": u_id, "text": prompt_text})
        except Exception as e:
            print(f"[LLM] Failed to send nlu_start (connection may be closed): {e}")
            return  # Прерываем выполнение, если соединение закрыто

        session = SESSIONS.get(session_id)
        if session:
            messages = session.build_llm_messages(system_prompt, max_turns=12)
            print(f"[SESSION:{session_id}] Building messages: {len(messages)} messages, turns: {len(session.turns)}")
            # гарантируем буфер
            session.llm_buffers[u_id] = ""
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt_text}
            ]

        print(f"[LLM-PAYLOAD] session_id={session_id}, len(messages)={len(messages)}")

        first = True
        try:
            async for tok in openai_stream(
                None,
                messages=messages,  # <-- ключевой момент
                model=llm_model,
                system_prompt=system_prompt,
                max_tokens=llm_max_tokens,
                temperature=llm_temp,
            ):
                if first:
                    llm_first_token_at_ms = now_ms()
                    first = False
                    await safe_send_locked({
                        "type": "metric",
                        "utterance_id": u_id,
                        "llm_first_token_ms": llm_first_token_at_ms - llm_started_at_ms
                    })

                # копим ассистента
                if session:
                    session.llm_buffers[u_id] += tok

                await safe_send_locked({"type": "llm_delta", "utterance_id": u_id, "delta": tok})

                # Кладём токен в очередь для TTS (только если TTS разрешен для этого utterance)
                if tts_allowed_u == u_id:
                    try:
                        await llm_to_tts_q.put((u_id, tok))
                        print(f"[LLM] Токен '{tok}' добавлен в очередь TTS (size={llm_to_tts_q.qsize()}, allowed_u={tts_allowed_u})")
                    except asyncio.QueueFull:
                        print(f"[LLM] ⚠️ Очередь TTS переполнена, пропускаем токен '{tok}'")
                else:
                    print(f"[LLM] ⚠️ Токен '{tok}' НЕ добавлен в очередь TTS (tts_allowed_u={tts_allowed_u}, u_id={u_id})")

        except asyncio.CancelledError:
            # Корректная отмена
            raise
        except Exception as e:
            print(f"[LLM] Error in run_llm: {e}")
            try:
                await safe_send_locked({"type": "llm_error", "utterance_id": u_id, "error": str(e)})
            except Exception as send_err:
                print(f"[LLM] Failed to send error (connection closed): {send_err}")
        finally:
            # Сигнал завершения для TTS
            try:
                await llm_to_tts_q.put((u_id, ""))
            except asyncio.QueueFull:
                print(f"[LLM] Очередь TTS переполнена, не удалось отправить сигнал завершения")

            try:
                await safe_send_locked({"type": "llm_end", "utterance_id": u_id})
            except Exception as send_err:
                print(f"[LLM] Failed to send llm_end (connection closed): {send_err}")

    async def start_or_restart_llm(new_text: str, reason: str, play_ack: bool = False, allow_tts: bool = False):
        nonlocal utterance_id, current_llm_task, llm_started, current_llm_input, llm_started_at_ms, llm_first_token_at_ms
        nonlocal active_output_u, output_active, tts_epoch, last_tts_chunk_ms, tts_playing, tts_allowed_u
        nonlocal barge_armed, silent_run_ms, voice_run_ms, tts_sending, voice_state

        prev_u = active_output_u  # что сейчас играет

        # новый ответ → barge-in не армим, пока не увидим тишину
        barge_armed = False
        silent_run_ms = 0
        voice_run_ms = 0
        tts_playing = False

        utterance_id += 1
        u_id = utterance_id

        # устанавливаем разрешение на TTS
        if allow_tts:
            tts_allowed_u = u_id
            print(f"[LLM] TTS allowed for utterance {u_id}")
        else:
            tts_allowed_u = 0
            print(f"[LLM] TTS NOT allowed for utterance {u_id}")

        # отменяем предыдущую LLM задачу
        if current_llm_task and not current_llm_task.done():
            current_llm_task.cancel()
            if prev_u:
                await safe_send_locked({"type": "abort", "scope": "llm", "reason": reason, "utterance_id": prev_u})

        # останавливаем предыдущее аудио (ВАЖНО: prev_u)
        if prev_u:
            await safe_send_locked({"type": "abort", "scope": "tts", "reason": reason, "utterance_id": prev_u})

        # обесцениваем текущие отправки TTS
        tts_epoch += 1

        # чистим очередь TTS
        while not llm_to_tts_q.empty():
            try:
                llm_to_tts_q.get_nowait()
            except asyncio.QueueEmpty:
                break

        # активируем новый output
        active_output_u = u_id
        output_active = True

        current_llm_input = new_text
        llm_started = True
        llm_started_at_ms = now_ms()
        llm_first_token_at_ms = 0

        await safe_send_locked({
            "type": "llm_start",
            "utterance_id": u_id,
            "text": current_llm_input
        })

        # ACK звук только если нужно И разрешено озвучивание
        if play_ack and allow_tts:
            if tts_sending:
                proto_violation("Attempted ACK while TTS window is active")
            elif voice_state == VoiceState.ASSISTANT_TTS:
                proto_violation("Attempted ACK while in ASSISTANT_TTS state")
            else:
                # State transition: start ACK TTS
                voice_state = VoiceState.ASSISTANT_TTS
                tts_sending = True

                ack_text, ack_wav = tts.get_random_ack_wav()
                if ack_wav is None:
                    # Если кэш не готов, синтезируем на лету
                    ack_text = tts.get_random_ack_text()
                    ack_wav = await call_with_retry(lambda: tts.synthesize_wav(ack_text, settings=tts_settings), retries=1)

                # Жёстко открываем окно TTS для ACK
                print(f"[WS] → JSON tts_start (ack)")
                await safe_send_locked({
                    "type": "tts_start",
                    "utterance_id": u_id,
                    "mime": "audio/wav",
                    "note": "ack"
                })

                await send_audio_binary(u_id, ack_wav)

                # Отправляем tts_end для ACK, чтобы закрыть этот мини-сеанс
                # Основной ответ LLM откроет свой tts_start в run_tts
                print(f"[WS] → JSON tts_end (ack, u_id={u_id})")
                await safe_send_locked({
                    "type": "tts_end",
                    "utterance_id": u_id
                })
                
                # НЕ сбрасываем voice_state здесь, run_tts сам установит ASSISTANT_TTS
                # voice_state = VoiceState.USER_SPEAKING # Эта строка вызывает race condition!
                tts_sending = False  # ACK сессия завершена, run_tts откроет новую
            tts_playing = True
            last_tts_chunk_ms = now_ms()  # anti-echo окно
            print(f"[ACK] Отправлен ACK '{ack_text}' для utterance {u_id}")

        current_llm_task = asyncio.create_task(run_llm(u_id, current_llm_input))

    async def abort_output(reason: str):
        nonlocal output_active, active_output_u, tts_epoch
        nonlocal voice_run_ms, last_barge_in_ms
        nonlocal tts_playing, barge_armed, silent_run_ms
        nonlocal current_llm_task

        if not output_active or active_output_u == 0:
            return

        u = active_output_u
        output_active = False
        active_output_u = 0
        tts_epoch += 1           # после этого run_tts перестанет отправлять аудио

        # сброс barge-in state, иначе состояние может "залипнуть"
        tts_playing = False
        tts_sending = False
        barge_armed = False

        # State transition: abort resets to idle/speaking
        if voice_state == VoiceState.ASSISTANT_TTS:
            voice_state = VoiceState.USER_SPEAKING
        silent_run_ms = 0
        voice_run_ms = 0
        tts_allowed_u = 0  # сброс разрешения на TTS

        # сброс LLM состояний при abort
        llm_started = False
        current_llm_input = ""

        last_barge_in_ms = now_ms()

        # cancel LLM
        if current_llm_task and not current_llm_task.done():
            current_llm_task.cancel()

        # команда клиенту остановить проигрывание
        print(f"[WS] → JSON abort (llm)")
        await safe_send_locked({"type": "abort", "scope": "llm", "reason": reason, "utterance_id": u})
        print(f"[WS] → JSON abort (tts)")
        await safe_send_locked({"type": "abort", "scope": "tts", "reason": reason, "utterance_id": u})

        # чистим очередь, чтобы хвосты не догоняли
        while not llm_to_tts_q.empty():
            try:
                llm_to_tts_q.get_nowait()
            except asyncio.QueueEmpty:
                break

    async def run_tts():
        """
        Consumer для очереди LLM→TTS.
        Читает токены, собирает в чанки и озвучивает.
        """
        print(f"[TTS] run_tts STARTED")
        nonlocal tts_epoch, active_output_u, output_active, last_tts_chunk_ms, tts_playing, tts_allowed_u
        nonlocal asr_enabled, asr_warming_up, asr_warmup_deadline, llm_started, current_llm_input, tts_sending
        nonlocal voice_state  # КРИТИЧНО: без этого изменения voice_state не видны в основном цикле!
        current_u = -1  # Используем -1 вместо 0, чтобы избежать ложных cleanup
        buf = ""
        local_epoch = tts_epoch

        print(f"[TTS] Consumer started with initial epoch {local_epoch}")

        while True:
            print(f"[TTS] Ожидание токена из очереди (epoch={local_epoch}, active={active_output_u})...")
            u_id, tok = await llm_to_tts_q.get()
            print(f"[TTS] Получен токен: utterance={u_id}, token='{tok[:20]}...', queue_size={llm_to_tts_q.qsize()}")

            # Новый utterance - сбрасываем буфер и открываем окно TTS
            if u_id != current_u and current_u != -1:  # Проверяем, что current_u был установлен ранее
                if tts_sending:
                    # Завершаем предыдущую TTS сессию, если она не была закрыта
                    print(f"[WS] → JSON tts_end (overlap cleanup, current_u={current_u})")
                    await safe_send_locked({"type": "tts_end", "utterance_id": current_u})
                    tts_sending = False

            # Устанавливаем новый utterance (если это первый запуск или новый utterance)
            if u_id != current_u:
                current_u = u_id
                buf = ""
                local_epoch = tts_epoch

                # ВСЕГДА посылаем tts_start для основного ответа, даже если был ACK
                # Это гарантирует, что фронтенд готов принимать новые чанки основного ответа
                voice_state = VoiceState.ASSISTANT_TTS
                tts_sending = True
                
                print(f"[WS] → JSON tts_start (main response, u_id={current_u})")
                await safe_send_locked({
                    "type": "tts_start",
                    "utterance_id": current_u,
                    "mime": "audio/wav"
                })

                # HARD MUTE ASR во время TTS
                asr_enabled = False
                asr_warming_up = False
                print(f"[ASR] Muted during TTS utterance {current_u}")

            # Игнорируем токены старых utterance
            if u_id != current_u:
                print(f"[TTS] SKIP token from old utterance: u_id={u_id}, current_u={current_u}, tok='{tok[:20] if tok else 'EOF'}'")
                continue

            # Маркер завершения LLM
            if tok == "":
                print(f"[TTS] ✅ EOF MARKER received for utterance {current_u}, buf: '{buf}' (len={len(buf)})")
                print(f"[TTS] Starting cleanup: tts_sending={tts_sending}, voice_state={voice_state}")
                
                # Сначала обрабатываем все оставшиеся чанки из буфера
                while buf.strip():
                    chunks, buf = split_for_tts(buf)
                    print(f"[TTS] Финальная обработка: разбито на {len(chunks)} чанков, остаток: '{buf}'")
                    for chunk in chunks:
                        if len(chunk) < 10:  # Очень маленькие чанки пропускаем
                            continue
                        try:
                            wav = await call_with_retry(lambda: tts.synthesize_wav(chunk, settings=tts_settings), retries=1)
                            guard_active = not output_active
                            guard_u = current_u != active_output_u
                            guard_epoch = local_epoch != tts_epoch
                            guard_tts_allowed = (tts_allowed_u != current_u)
                            if guard_active or guard_u or guard_epoch or guard_tts_allowed:
                                print(f"[TTS] Финальный чанк пропущен: active={output_active}({guard_active}), current_u={current_u} != active_u={active_output_u}({guard_u})")
                                continue
                            await safe_send_locked({
                                "type": "tts_audio",
                                "utterance_id": current_u,
                                "mime": "audio/wav"
                            })
                            tts_playing = True
                            await send_audio_binary(current_u, wav)
                            last_tts_chunk_ms = now_ms()
                            print(f"[TTS] Финальный чанк отправлен: '{chunk[:30]}...' ({len(wav)} bytes)")
                        except Exception as e:
                            print(f"[TTS] Ошибка финального чанка: {e}")
                    
                    # Если после разбиения остался маленький остаток, отправляем его как есть
                    if buf.strip() and len(buf.strip()) >= 10:
                        tail = buf.strip()
                        try:
                            wav = await call_with_retry(lambda: tts.synthesize_wav(tail, settings=tts_settings), retries=1)
                            guard_active = not output_active
                            guard_u = current_u != active_output_u
                            guard_epoch = local_epoch != tts_epoch
                            guard_tts_allowed = (tts_allowed_u != current_u)
                            if not (guard_active or guard_u or guard_epoch or guard_tts_allowed):
                                await safe_send_locked({
                                    "type": "tts_audio",
                                    "utterance_id": current_u,
                                    "mime": "audio/wav"
                                })
                                tts_playing = True
                                await send_audio_binary(current_u, wav)
                                last_tts_chunk_ms = now_ms()
                                print(f"[TTS] Последний остаток отправлен: '{tail[:30]}...' ({len(wav)} bytes)")
                        except Exception as e:
                            print(f"[TTS] Ошибка последнего остатка: {e}")
                        buf = ""  # Очищаем буфер после отправки

                if current_u == active_output_u:
                    output_active = False
                    active_output_u = 0
                
                print(f"[WS] → JSON tts_end")
                
                # КРИТИЧНО: Сбрасываем флаги ДО отправки tts_end, чтобы избежать гонки условий
                # Это гарантирует, что к моменту получения tts_end клиентом, состояние уже обновлено
                tts_playing = False
                tts_sending = False
                
                # State transition: TTS finished
                if voice_state != VoiceState.ASSISTANT_TTS:
                    proto_violation("tts_end received while not in TTS state")
                
                # Возвращаемся в IDLE, чтобы начать ждать новую реплику пользователя
                voice_state = VoiceState.IDLE
                print(f"[STATE] ASSISTANT_TTS → IDLE (TTS finished for utterance {current_u})")
                
                await safe_send_locked({"type": "tts_end", "utterance_id": current_u})

                # Сбрасываем распознаватель Vosk, чтобы он не учитывал старый шум/эхо
                try:
                    rec.Reset()
                    print("[ASR] Vosk recognizer reset after TTS")
                except Exception as e:
                    print(f"[ASR] Failed to reset Vosk: {e}")

                # СБРОС ТАЙМЕРОВ ТИШИНЫ: крайне важно для продолжения диалога
                now_after_tts = now_ms()
                last_voice_ms = now_after_tts
                last_partial_change_ms = now_after_tts
                last_tts_chunk_ms = 0  # КРИТИЧНО: сбрасываем таймер TTS, чтобы не блокировать обработку
                last_partial = ""
                endpoint_state = "listening"
                ack_sent_for_turn = False # Разрешаем ACK для следующей фразы
                print("[ASR] Silence timers, TTS timer, and endpoint state reset after TTS")

                # ASR WARMUP: мягкая реинициализация после TTS
                asr_enabled = True
                asr_warming_up = True
                asr_warmup_deadline = time.time() + (ASR_WARMUP_MS / 1000.0)
                print(f"[ASR] Warmup mode after TTS utterance {current_u} (deadline: {asr_warmup_deadline:.3f})")

                # СОХРАНИТЬ ПОЛНЫЙ ОТВЕТ АССИСТЕНТА В ИСТОРИЮ СЕССИИ (СТРОГО ОДИН РАЗ)
                session = SESSIONS.get(session_id)
                if session:
                    assistant_text = session.llm_buffers.pop(current_u, "").strip()
                    if assistant_text:
                        session.add_turn("assistant", assistant_text, utterance_id=current_u)

                        # Отправляем нормализованное событие в Voice Control
                        event = normalize_event(
                            event_type="final",
                            role="assistant",
                            text=assistant_text,
                        )
                        if event:
                            await push_event_to_voice_control(session_id, event)
                            print(f"[SESSION:{session_id}] Saved assistant response: '{assistant_text[:50]}...'")
                            print(f"[SESSION:{session_id}] Session now has {len(session.turns)} turns total")
                        else:
                            print(f"[EVENT] Dropped invalid assistant event: text='{assistant_text[:50]}...'")
                
                # СБРОС состояний после завершения utterance
                llm_started = False
                current_llm_input = ""
                tts_allowed_u = 0
                continue

            # Нормальный токен - добавляем в буфер с фильтром дублирования
            # Фильтруем очевидные дублирования слов
            test_buf = buf + tok
            words = test_buf.split()
            filtered_words = []
            for word in words:
                # Убираем слова, которые повторяются подряд
                if len(filtered_words) == 0 or word != filtered_words[-1]:
                    filtered_words.append(word)
                elif word == filtered_words[-1] and len(word) > 3:  # Для коротких слов дублирование нормально
                    continue  # Пропускаем дублирование длинных слов

            buf = ' '.join(filtered_words)
            print(f"[TTS] Буфер после фильтрации: '{buf}' (len={len(buf)})")

            # Разбиваем на чанки и озвучиваем (только если чанк достаточно большой)
            chunks, buf = split_for_tts(buf)
            if chunks:
                print(f"[TTS] Разбито на {len(chunks)} чанков, остаток: '{buf}'")
            for chunk in chunks:
                # Пропускаем слишком маленькие чанки, кроме завершающих предложений
                # Снизили порог с 20 до 10 для более быстрой озвучки коротких ответов
                if len(chunk) < 10 and not chunk.endswith(('.', '!', '?', '\n', ',')):
                    print(f"[TTS] Чанк слишком маленький, откладываем: '{chunk}' (len={len(chunk)})")
                    buf = chunk + ' ' + buf  # Возвращаем обратно в буфер
                    continue
                try:
                    wav = await call_with_retry(lambda: tts.synthesize_wav(chunk, settings=tts_settings), retries=1)
                    guard_active = not output_active
                    guard_u = current_u != active_output_u
                    guard_epoch = local_epoch != tts_epoch
                    guard_tts_allowed = (tts_allowed_u != current_u)
                    print(f"[TTS] Guard check: active={output_active}, current_u={current_u}, active_u={active_output_u}, tts_allowed_u={tts_allowed_u}, epoch={local_epoch}/{tts_epoch}")
                    if guard_active or guard_u or guard_epoch or guard_tts_allowed:
                        # ответ уже прерван или устарел или TTS не разрешено
                        print(f"[TTS] ❌ Чанк пропущен: active={output_active}({guard_active}), current_u={current_u} != active_u={active_output_u}({guard_u}), local_epoch={local_epoch} != global_epoch={tts_epoch}({guard_epoch}), tts_allowed_u={tts_allowed_u}({guard_tts_allowed})")
                        continue
                    print(f"[TTS] ✅ Отправка чанка: '{chunk[:30]}...' ({len(wav)} bytes)")
                    await safe_send_locked({
                        "type": "tts_audio",
                        "utterance_id": current_u,
                        "mime": "audio/wav"
                    })
                    tts_playing = True
                    await send_audio_binary(current_u, wav)
                    last_tts_chunk_ms = now_ms()
                    print(f"[TTS] ✅ Чанк отправлен: '{chunk[:30]}...' ({len(wav)} bytes)")
                except Exception as e:
                    print(f"[TTS] Ошибка чанка '{chunk[:30]}...': {e}")
                    await safe_send_locked({
                        "type": "tts_error",
                        "utterance_id": current_u,
                        "error": f"Chunk failed: {str(e)}"
                    })

    # Запускаем TTS consumer
    if tts_task is None:
        tts_task = asyncio.create_task(run_tts())
        print("[TTS] Consumer запущен")
    else:
        print("[TTS] Consumer уже запущен")

    await safe_send_locked({
        "event": "ready",
        "sample_rate": sample_rate,
        "frame_ms": FRAME_MS,
        "vad_mode": VAD_MODE,
        "early_pause_ms": EARLY_PAUSE_MS,
        "final_pause_ms": FINAL_PAUSE_MS,
        "stable_ms": STABLE_MS
    })

    # Для cancel предыдущих chat запросов (legacy)
    current_chat_task: asyncio.Task | None = None

    async def run_chat(question: str):
        """Запускает streaming chat с DeepSeek"""
        try:
            print(f"[CHAT] Начинаем обработку вопроса: '{question}'")
            await safe_send_locked({"type": "chat_start", "question": question})
            print(f"[CHAT] Отправлено chat_start")

            acc = []
            token_count = 0
            async for token in openai_stream(question, model=llm_model, system_prompt=system_prompt, max_tokens=llm_max_tokens, temperature=llm_temp):
                acc.append(token)
                token_count += 1
                await safe_send_locked({"type": "chat_delta", "delta": token})

            answer = "".join(acc).strip()
            print(f"[CHAT] Завершено. Токенов: {token_count}, Ответ: '{answer[:100]}...'")

            # Автоматически озвучиваем ответ через TTS
            print(f"[TTS] Отправляем на озвучку: '{answer[:50]}...'")
            audio_data = await call_tts_api(answer)
            print(f"[TTS] Аудио данные получены (длина: {len(audio_data) if audio_data else 0})")

            await safe_send_locked({"type": "chat_end", "question": question, "answer": answer, "audio_data": audio_data})
        except asyncio.CancelledError:
            print(f"[CHAT] Задача отменена для вопроса: '{question}'")
            # Задача отменена, ничего не делаем
            pass
        except Exception as e:
            print(f"[CHAT] Ошибка при обработке вопроса '{question}': {e}")
            await safe_send_locked({"type": "chat_error", "error": str(e)})

    try:
        async for msg in ws:
            # === ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (JSON) ===
            if isinstance(msg, str):
                print(f"[WS] Получено текстовое сообщение: {msg[:100]}..." if len(msg) > 100 else f"[WS] Получено текстовое сообщение: {msg}")
                try:
                    data = json.loads(msg)
                    print(f"[WS] Распарсено JSON: {data}")
                except json.JSONDecodeError as e:
                    print(f"[WS] Ошибка парсинга JSON: {e}")
                    continue

                # === CONFIG HANDLER (HANDSHAKE) ===
                if "config" in data:
                    try:
                        if handshake_done:
                            # Повторный config — протокольное нарушение, но не рвём соединение
                            logger.warning("[PROTO] Duplicate config received, ignored")
                            await safe_send_locked({
                                "event": "warning",
                                "reason": "config_already_applied"
                            })
                            continue  # Продолжаем обработку, не закрываем соединение

                        cfg = data.get("config") or {}
                        print(f"[HANDSHAKE] Received config: {cfg}")

                        # --- sample_rate ---
                        requested_sr = cfg.get("sample_rate")
                        try:
                            requested_sr = int(requested_sr) if requested_sr is not None else None
                        except Exception:
                            requested_sr = None

                        new_sr = normalize_sample_rate(requested_sr)

                        if requested_sr and requested_sr != new_sr:
                            await safe_send_locked({
                                "event": "reconfigured",
                                "sample_rate": new_sr,
                                "note": "server supports pcm16 mono 16000 only"
                            })

                        # --- ASR options ---
                        words = bool(cfg.get("words", False))
                        phrase_list = cfg.get("phrase_list")

                        # --- apply settings ---
                        sample_rate = new_sr
                        fb = frame_bytes(sample_rate, FRAME_MS)

                        audio_buf.clear()
                        # webrtcvad.Vad не имеет метода reset(), но состояние VAD не критично для handshake
                        # VAD продолжит работу с текущим состоянием
                        rec = build_recognizer(
                            sample_rate=sample_rate,
                            phrase_list=phrase_list,
                            words=words,
                        )

                        # --- handshake completed ---
                        handshake_done = True
                        asr_enabled = True

                        print("[HANDSHAKE] Config applied, sending READY")

                        await safe_send_locked({
                            "event": "ready",
                            "sample_rate": sample_rate,
                            "frame_ms": FRAME_MS,
                            "vad_mode": VAD_MODE,
                            "early_pause_ms": EARLY_PAUSE_MS,
                        })

                        print("[HANDSHAKE] READY sent")
                        continue  # Продолжаем обработку следующих сообщений

                    except Exception as e:
                        print("[HANDSHAKE][FATAL]", e)
                        import traceback
                        traceback.print_exc()
                        await ws.close(code=1011, reason="config handler failed")
                        return

                # ОБРАБОТКА КОМАНДЫ ЗАВЕРШЕНИЯ СЕССИИ
                if data.get("type") == "end_session":
                    print(f"[SESSION] Received end_session command for session {session_id}")
                    session = SESSIONS.get(session_id)
                    summary = ""

                    if session and session.turns:
                        print(f"[SESSION] Building summary for session {session_id} with {len(session.turns)} turns")
                        try:
                            summary = build_session_summary(session)
                            print(f"[SESSION] Summary generated: {len(summary)} chars")
                        except Exception as e:
                            print(f"[SESSION] Error generating summary: {e}")
                            summary = f"Ошибка генерации summary: {e}"
                    else:
                        print(f"[SESSION] No session or turns found for summary")
                        summary = "Сессия пуста или не найдена"

                    # Отправляем summary клиенту
                    await safe_send_locked({
                        "type": "session_summary",
                        "session_id": session_id,
                        "agent_id": agent_id,
                        "summary": summary,
                    })

                    # Отправляем подтверждение завершения
                    await safe_send_locked({
                        "type": "session_end",
                        "session_id": session_id,
                    })

                    # Отмечаем сессию как завершенную (не удаляем сразу - нужен для HTTP API)
                    if session:
                        session.ended = True
                        session.ended_at_ms = now_ms()
                        session.summary = summary
                        print(f"[SESSION] Session {session_id} marked as ended (will be cleaned up by TTL)")

                    # Закрываем соединение
                    await ws.close(code=1000, reason="client_end")
                    return


                # reset: финализировать текущую фразу и продолжить
                if data.get("reset") == 1:
                    final_json = json.loads(rec.FinalResult())
                    final_text = (final_json.get("text") or "").strip()
                    if final_text:  # НЕ отправляем пустые final
                        await safe_send_locked({"type": "final", **final_json})

                        # State transition: user finished speaking, starting LLM
                        if voice_state == VoiceState.USER_SPEAKING:
                            voice_state = VoiceState.IDLE  # User input complete, waiting for LLM

                    # ЗАПУСК LLM ПО ФИНАЛЬНОМУ РЕЗУЛЬТАТУ ASR
                    await handle_final_text(final_json.get("text"), reason="final_reset")

                    # Новая пользовательская реплика - сбрасываем состояния turn
                    turn_id += 1
                    ack_sent_for_turn = False
                    llm_started = False
                    current_llm_input = ""
                    pause_gate_open = True

                    # Сброс WPS состояний для новой реплики
                    wps_ema = 2.2
                    prev_wc = 0
                    prev_wc_ts_ms = 0
                    rec = build_recognizer(sample_rate, phrase_list=phrase_list, words=words)
                    last_partial = ""
                    continue

                # partial: имитация ASR partial для тестирования
                if data.get("type") == "partial":
                    partial_text = data.get("partial", "").strip()
                    if partial_text:
                        # Имитируем ASR partial результат
                        last_partial = partial_text
                        last_partial_change_ms = now_ms()

                        part_json = {
                            "partial": partial_text,
                            "result": []
                        }
                        await safe_send_locked({"type": "partial", **part_json})
                        print(f"[ASR] Имитирован ASR partial: '{partial_text}'")
                    continue

                # final: имитация ASR final для тестирования - ВЫЗЫВАЕМ FINAL ENDPOINT ЛОГИКУ
                if data.get("type") == "final":
                    final_text = data.get("text", "").strip()
                    if final_text:
                        # Имитируем ASR final результат
                        final_json = {
                            "text": final_text,
                            "result": []
                        }

                        # ВЫЗЫВАЕМ FINAL ENDPOINT ЛОГИКУ ЗДЕСЬ
                        await handle_final_text(final_text, reason="final_json")

                        await safe_send_locked({"type": "final", **final_json})

                        # State transition: test final
                        if voice_state == VoiceState.USER_SPEAKING:
                            voice_state = VoiceState.IDLE
                        print(f"[TEST] Имитирован ASR final: '{final_text}'")

                        # Новая пользовательская реплика - сбрасываем состояния turn
                        turn_id += 1
                        ack_sent_for_turn = False
                        llm_started = False
                        current_llm_input = ""
                        pause_gate_open = True

                        # Сброс WPS состояний для новой реплики
                        wps_ema = 2.2
                        prev_wc = 0
                        prev_wc_ts_ms = 0

                        # Сброс FSM endpointing состояний
                        endpoint_state = "listening"
                        endpoint_tentative_start_ms = 0
                        endpoint_confirmed_start_ms = 0

                    continue

                # ping: keep-alive от клиента
                if "ping" in data:
                    # Отвечаем pong для keep-alive
                    await safe_send_locked({"pong": data["ping"]})
                    continue

                # eof: финализировать и закрыть
                if data.get("eof") == 1:
                    final_json = json.loads(rec.FinalResult())
                    final_text = (final_json.get("text") or "").strip()
                    if final_text:  # НЕ отправляем пустые final
                        await safe_send_locked({"type": "final", **final_json})
                    # Новая пользовательская реплика - сбрасываем состояния turn
                    turn_id += 1
                    ack_sent_for_turn = False
                    llm_started = False
                    current_llm_input = ""
                    pause_gate_open = True

                    # Сброс WPS состояний для новой реплики
                    wps_ema = 2.2
                    prev_wc = 0
                    prev_wc_ts_ms = 0
                    await ws.close(code=1000, reason="eof")
                    return

                # chat: отправить вопрос в DeepSeek API с streaming
                if "chat" in data:
                    question = data["chat"].strip()
                    print(f"[CHAT] Получен вопрос: '{question}'")
                    if question:
                        # Отменяем предыдущий LLM запрос если он еще выполняется
                        if current_llm_task and not current_llm_task.done():
                            print(f"[CHAT] Отменяем предыдущий LLM task")
                            current_llm_task.cancel()
                            await safe_send_locked({"type": "abort", "scope": "llm", "reason": "new_chat"})

                        async def run_llm(q: str):
                            """Запуск LLM streaming для конкретного utterance_id (chat версия)"""
                            nonlocal llm_first_token_at_ms

                            utterance_id = 1  # Для chat запросов используем фиксированный utterance_id
                            await safe_send_locked({"type": "nlu_start", "utterance_id": utterance_id, "text": q})
                            await safe_send_locked({"type": "chat_start", "question": q})

                            first = True
                            acc = []  # Собираем полный ответ
                            try:
                                async for tok in openai_stream(q, model=llm_model, system_prompt=system_prompt, max_tokens=llm_max_tokens, temperature=llm_temp):
                                    if first:
                                        llm_first_token_at_ms = now_ms()
                                        first = False
                                        await safe_send_locked({
                                            "type": "metric",
                                            "utterance_id": utterance_id,
                                            "llm_first_token_ms": llm_first_token_at_ms - llm_started_at_ms
                                        })

                                    await safe_send_locked({"type": "llm_delta", "utterance_id": utterance_id, "delta": tok})

                                    # Кладём токен в очередь для TTS
                                    try:
                                        await llm_to_tts_q.put((utterance_id, tok))
                                    except asyncio.QueueFull:
                                        print(f"[LLM] Очередь TTS переполнена, пропускаем токен")

                            except asyncio.CancelledError:
                                # Корректная отмена
                                raise
                            except Exception as e:
                                await safe_send_locked({"type": "llm_error", "utterance_id": utterance_id, "error": str(e)})
                            finally:
                                # Сигнал завершения для TTS
                                try:
                                    await llm_to_tts_q.put((utterance_id, ""))
                                except asyncio.QueueFull:
                                    print(f"[LLM] Очередь TTS переполнена, не удалось отправить сигнал завершения")

                                await safe_send_locked({"type": "chat_response", "question": q, "answer": "".join(acc)})
                                await safe_send_locked({"type": "llm_end", "utterance_id": utterance_id})

                        print(f"[CHAT] Запускаем новый LLM task для вопроса: '{question}'")
                        current_llm_task = asyncio.create_task(run_llm(question))
                    else:
                        print(f"[CHAT] Пустой вопрос, пропускаем")
                    continue

                continue

            # === ОБРАБОТКА БИНАРНЫХ СООБЩЕНИЙ (PCM) ===
            else:  # Бинарный аудио-чанк: 16-bit mono PCM little-endian
                # Проверка протокола
                if not handshake_done:
                    proto_violation("PCM received before READY")
                    continue

                if voice_state == VoiceState.ASSISTANT_TTS:
                    proto_violation("User PCM received during ASSISTANT_TTS state - dropped")
                    continue

                pcm_data = msg
                print(f"[PCM] Получены бинарные данные: {len(pcm_data)} bytes")

                # Проверяем что PCM в правильном формате (int16 mono)
                if len(pcm_data) % 2 != 0:
                    proto_violation(f"PCM data size {len(pcm_data)} not divisible by 2 (expected int16)")
                    continue

                expected_samples_per_20ms = int(sample_rate * 0.02)  # 20ms фрейм
                expected_bytes_per_20ms = expected_samples_per_20ms * 2  # int16 = 2 bytes
                if len(pcm_data) != expected_bytes_per_20ms:
                    proto_violation(f"Bad PCM frame size: {len(pcm_data)} bytes, expected {expected_bytes_per_20ms} bytes (20ms @ {sample_rate}Hz int16 mono)")
                    continue

                # ПРОВЕРКА ASR MUTE
                if not asr_enabled:
                    continue

                # ASR WARMUP: собираем буфер в течении ASR_WARMUP_MS
                if asr_warming_up:
                    # Добавляем PCM в буфер
                    audio_buf.extend(pcm_data)

                    # Проверяем завершение warmup
                    if time.time() >= asr_warmup_deadline:
                        asr_warming_up = False
                        # Мягкий сброс VAD (только временные счетчики)
                        vad.soft_reset()
                        print("[ASR] Warmup completed, ASR fully active, processing buffered audio")
                        # НЕ continue - обрабатываем накопленный буфер сразу
                    else:
                        continue  # Продолжаем собирать буфер
                else:
                    # Нормальная работа: добавляем новый PCM в буфер
                    print(f"[AUDIO] Получен чанк: {len(pcm_data)} bytes, буфер: {len(audio_buf)}")
                    audio_buf.extend(pcm_data)

                # Обрабатываем аудио по фреймам
                frames_processed = 0
                while len(audio_buf) >= fb:
                    frame = bytes(audio_buf[:fb])
                    del audio_buf[:fb]
                    frames_processed += 1

                    # 1) VAD: определяем речь/тишину
                    try:
                        is_voice = vad.is_speech(frame, sample_rate)
                    except ValueError as e:
                        # Защита от некорректного фрейма / несостыковки sample_rate
                        print(f"[VAD] Frame mismatch error: {e} (frame_len={len(frame)}, sample_rate={sample_rate})")
                        # Сбрасываем буфер и продолжаем работу (не рвём соединение)
                        audio_buf.clear()
                        continue
                    if is_voice:
                        last_voice_ms = now_ms()
                        print(f"[VAD] Речь обнаружена в фрейме {frames_processed}")
                        
                        # Если мы были в IDLE, переходим в состояние USER_SPEAKING
                        if voice_state == VoiceState.IDLE:
                            voice_state = VoiceState.USER_SPEAKING
                            print("[STATE] IDLE → USER_SPEAKING")
                    else:
                        print(f"[VAD] Тишина в фрейме {frames_processed}")

                    # ---------- Обновление статистики пауз для адаптивности ----------
                    if was_voice_prev and (not is_voice):
                        silence_start_ms = now_ms()
                    if (not was_voice_prev) and is_voice and silence_start_ms:
                        pause_ms = now_ms() - silence_start_ms
                        pause_ema_ms = update_pause_ema(pause_ema_ms, pause_ms, PAUSE_EMA_ALPHA)
                        silence_start_ms = 0
                    was_voice_prev = is_voice

                    # ---------- BARGE-IN ARMING (только после тишины) ----------
                    if output_active:
                        if not is_voice:
                            silent_run_ms += FRAME_MS
                            if silent_run_ms >= BARGE_IN_ARM_SILENCE_MS:
                                barge_armed = True
                        else:
                            silent_run_ms = 0
                    else:
                        # если нет активного ответа — сбрасываем
                        barge_armed = False
                        silent_run_ms = 0
                        voice_run_ms = 0

                    # ---------- BARGE-IN (прерывание ответа) ----------
                    if BARGE_IN_ENABLED and output_active and is_voice:
                        now_bi = now_ms()

                        # 1) пока озвучка "идёт" — barge-in запрещён (иначе эхо рубит)
                        if tts_playing:
                            voice_run_ms = 0

                        # 2) ещё не было тишины во время ответа → это хвост пользовательской реплики, НЕ barge-in
                        elif not barge_armed:
                            voice_run_ms = 0

                        # 3) cooldown
                        elif now_bi - last_barge_in_ms < BARGE_IN_COOLDOWN_MS:
                            pass

                        # 4) анти-эхо окно после последнего отправленного аудио
                        elif now_bi - last_tts_chunk_ms < BARGE_IN_IGNORE_AFTER_TTS_MS:
                            voice_run_ms = 0

                        else:
                            voice_run_ms += FRAME_MS
                            if voice_run_ms >= BARGE_IN_MIN_VOICE_MS:
                                await abort_output("barge_in_user_speaking")
                    else:
                        if not is_voice:
                            voice_run_ms = 0

                    # 2) ASR: скармливаем Vosk тот же фрейм
                    # Если идёт озвучка — не пускаем аудио в ASR, иначе ловим эхо TTS
                    if output_active and tts_playing:
                        continue
                    # Доп. окно после чанка TTS
                    if output_active and (now_ms() - last_tts_chunk_ms) < BARGE_IN_IGNORE_AFTER_TTS_MS:
                        continue
                    ok = await decode_accept(rec, frame)

                    if ok:
                        # Vosk решил, что фраза завершилась (по своей логике)
                        final_json = json.loads(rec.Result())
                        final_text = (final_json.get("text") or "").strip()
                        if final_text:  # НЕ отправляем пустые final
                            await safe_send_locked({"type": "final", **final_json})

                            # State transition: user finished speaking, starting LLM
                            voice_state = VoiceState.IDLE
                            print("[STATE] USER_SPEAKING → IDLE (final received)")

                        # ВАЖНО: Запуск LLM по final из Vosk (rec.Result())
                        await handle_final_text(final_json.get("text"), reason="final_vosk_result")

                        # сброс состояний под новую фразу
                        last_partial = ""
                        last_partial_change_ms = now_ms()
                        early_endpoint_fired = False
                        # СБРОС: новая фраза пользователя
                        llm_started = False
                        current_llm_input = ""
                        continue

                    # 3) partial: ограничиваем частоту + отслеживаем стабильность
                    now = now_ms()
                    if now - last_partial_sent_ms >= PARTIAL_RATE_LIMIT_MS:
                        part_json = json.loads(rec.PartialResult())
                        partial = (part_json.get("partial") or "").strip()

                        if partial and partial != last_partial:
                            # Если мы получили текст, а состояние всё еще IDLE - значит пользователь начал говорить
                            if voice_state == VoiceState.IDLE:
                                voice_state = VoiceState.USER_SPEAKING
                                print(f"[STATE] IDLE → USER_SPEAKING (detected by partial: '{partial[:30]}')")

                            # Фильтр tail jitter: не сбрасываем стабильность на мелкие изменения хвоста
                            if not is_tail_jitter(partial, last_partial):
                                last_partial_change_ms = now

                                # Обновляем скорость речи
                                curr_wc = word_count(partial)
                                if prev_wc_ts_ms > 0 and curr_wc > prev_wc:
                                    dt = now - prev_wc_ts_ms
                                    wps_ema = update_wps_ema(wps_ema, prev_wc, curr_wc, dt)
                                prev_wc = curr_wc
                                prev_wc_ts_ms = now

                            last_partial = partial
                            await safe_send_locked({"type": "partial", **part_json})
                            last_partial_sent_ms = now


                    # 4) FSM Endpointing логика: listening -> tentative -> confirmed -> final
                    silent_ms = now - last_voice_ms
                    stable_ms = now - last_partial_change_ms

                    # Рассчитываем адаптивные пороги для текущего текста
                    if last_partial:
                        tent_ms, conf_ms, fin_ms = compute_adaptive_thresholds(last_partial, wps_ema, pause_ema_ms)
                    else:
                        tent_ms, conf_ms, fin_ms = 350, 1100, 1600  # дефолтные значения

                    # FSM логика переходов
                    print(f"[ENDPOINT] state={endpoint_state} | silence={silent_ms}ms | stable={stable_ms}ms | text='{last_partial[:50]}...'")

                    if endpoint_state == "listening":
                        # Переход в tentative при достаточной паузе и стабильности
                        if (last_partial and is_meaningful(last_partial) and
                            stable_ms >= 300 and silent_ms >= tent_ms):
                            endpoint_state = "tentative"
                            endpoint_tentative_start_ms = now
                            print(f"[ENDPOINT] → tentative (tent_ms={tent_ms})")

                            await safe_send_locked({
                                "type": "asr_tentative_pause",
                                "text": last_partial,
                                "silent_ms": silent_ms,
                                "stable_ms": stable_ms,
                                "tentative_ms": tent_ms,
                                "confirm_ms": conf_ms
                            })

                            # LLM стартует ТОЛЬКО из final - убираем tentative_pause

                    elif endpoint_state == "tentative":
                        # Возврат в listening если partial изменился
                        if last_partial and last_partial != part_json.get("partial", ""):
                            endpoint_state = "listening"
                            print("[ENDPOINT] ← listening (partial changed)")
                        # Переход в confirmed при достаточной паузе и хорошем конце
                        elif (silent_ms >= conf_ms and stable_ms >= 500 and
                              last_partial and is_good_end(last_partial)):
                            endpoint_state = "confirmed"
                            endpoint_confirmed_start_ms = now
                            print(f"[ENDPOINT] → confirmed (conf_ms={conf_ms})")

                            await safe_send_locked({
                                "type": "asr_confirmed_end",
                                "text": last_partial,
                                "silent_ms": silent_ms,
                                "stable_ms": stable_ms,
                                "confirm_ms": conf_ms,
                                "tentative_ms": tent_ms,
                                "final_ms": fin_ms,
                                "pause_ema_ms": pause_ema_ms,
                                "wps_ema": wps_ema,
                                "word_count": len(last_partial.strip().split()),
                                "is_good_end": is_good_end(last_partial)
                            })

                            # LLM стартует ТОЛЬКО из final - confirmed_end_start удален

                    elif endpoint_state == "confirmed":
                        # Возврат в listening если partial изменился
                        if last_partial and last_partial != part_json.get("partial", ""):
                            endpoint_state = "listening"
                            print("[ENDPOINT] ← listening (partial changed in confirmed)")
                        # Переход в final при максимальной паузе
                        elif silent_ms >= fin_ms:
                            endpoint_state = "final"
                            print(f"[ENDPOINT] → final (fin_ms={fin_ms})")

                    # Сброс FSM при начале новой речи
                    if is_voice and endpoint_state != "listening":
                        endpoint_state = "listening"
                        print("[ENDPOINT] ← listening (voice detected)")

                    # FINAL ENDPOINT: длинная пауза -> финализируем принудительно
                    # Обрабатывается только по аудио данным (не по JSON)
                    if last_partial and silent_ms >= fin_ms:
                        final_json = json.loads(rec.FinalResult())
                        final_text = (final_json.get("text") or "").strip()
                        if final_text:  # НЕ отправляем пустые final
                            await safe_send_locked({"type": "final", **final_json})

                            # State transition: user finished speaking (pause timeout)
                            if voice_state == VoiceState.USER_SPEAKING:
                                voice_state = VoiceState.IDLE

                        # Проверяем, нужно ли запустить/перезапустить LLM по финальному тексту
                        await handle_final_text(final_json.get("text"), reason="final_pause")

                        # Новая пользовательская реплика - сбрасываем состояния turn
                        turn_id += 1
                        ack_sent_for_turn = False
                        llm_started = False  # СБРОС: разрешаем запуск LLM для следующей реплики
                        current_llm_input = ""  # СБРОС: очищаем предыдущий input
                        pause_gate_open = True

                        # Сброс WPS состояний для новой реплики
                        wps_ema = 2.2
                        prev_wc = 0
                        prev_wc_ts_ms = 0

                        # Сброс FSM endpointing состояний
                        endpoint_state = "listening"
                        endpoint_tentative_start_ms = 0
                        endpoint_confirmed_start_ms = 0

                        # пересоздаём recognizer под следующую фразу
                        rec = build_recognizer(sample_rate, phrase_list=phrase_list, words=words)

                        last_partial = ""
                        last_partial_change_ms = now_ms()
                        early_endpoint_fired = False

    except websockets.exceptions.ConnectionClosed as e:
        logger.info(f"WebSocket connection closed normally: {e.code} {e.reason}")
        # Cancel активные tasks при закрытии соединения
        if current_chat_task and not current_chat_task.done():
            current_chat_task.cancel()
        if current_llm_task and not current_llm_task.done():
            current_llm_task.cancel()
        if tts_task and not tts_task.done():
            tts_task.cancel()
        return
    except Exception as e:
        print(f"[HANDLER][FATAL] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        logger.exception("handler crashed with unexpected error")
        # Короткая причина (reason должен быть коротким)
        try:
            await ws.close(code=1011, reason="internal_error")
        except:
            pass
    finally:
        # Отменяем все активные задачи при закрытии соединения
        print("[HANDLER] Закрытие соединения, отменяем задачи")
        if tts_task and not tts_task.done():
            tts_task.cancel()
            print("[HANDLER] TTS task отменен")


async def main():
    print(f"[boot] ws://{HOST}:{PORT}, health:{HEALTH_PORT}")

    # Graceful shutdown event
    stop_event = asyncio.Event()

    def _stop(*_):
        print("[SHUTDOWN] Получен сигнал завершения")
        stop_event.set()

    # Настраиваем обработчики сигналов
    loop = asyncio.get_running_loop()
    for s in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(s, _stop)

    # Инициализируем HTTP клиенты
    await init_openai_http()
    if TTS_PROVIDER == "openai":
        await init_tts_api_http()
    await init_tts_http()

    # Запускаем health сервер
    health_srv = await health_server()

    async def cleanup_sessions_task():
        while True:
            await asyncio.sleep(60)
            now = now_ms()
            ttl = 10 * 60 * 1000  # 10 минут
            dead = []
            for sid, sess in SESSIONS.items():
                if sess.ended and sess.ended_at_ms and (now - sess.ended_at_ms) > ttl:
                    dead.append(sid)
            for sid in dead:
                SESSIONS.pop(sid, None)
                print(f"[SESSION] cleaned {sid}")

    try:
        # Запускаем cleanup task
        asyncio.create_task(cleanup_sessions_task())

        # Отключаем compression для минимального CPU overhead и latency
        async with websockets.serve(
            handler,
            HOST,
            PORT,
            compression=None,  # ОТКЛЮЧАЕМ COMPRESSION для скорости
            max_size=4 * 1024 * 1024,  # Уменьшаем лимит для защиты
            ping_interval=None,  # Отключаем ping - используем клиентский keep-alive
            ping_timeout=None,
        ):
            print("[boot] WS сервер запущен, ждем сигнала завершения...")
            await stop_event.wait()
            print("[SHUTDOWN] Начинаем graceful shutdown...")
    finally:
        # Закрываем HTTP клиенты
        await close_openai_http()
        await close_tts_api_http()
        await close_tts_http()

        # Закрываем health сервер
        if health_srv:
            health_srv.close()
            await health_srv.wait_closed()
            print("[SHUTDOWN] Health сервер закрыт")

        print("[SHUTDOWN] Graceful shutdown завершен")


if __name__ == "__main__":
    asyncio.run(main())

