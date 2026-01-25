import asyncio
import json
import logging
import os
import re
import struct
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Callable, Tuple, Union

import httpx
from langdetect import detect

import tts_silero

# Настройка логирования
logger = logging.getLogger("voice_pipeline")

# Функция для быстрой конвертации цифр в слова
async def convert_numbers_to_words(text: str) -> str:
    """Конвертирует цифры в слова с правильным склонением через LLM"""
    if not text:
        return text
    
    # Проверяем наличие цифр, научной нотации или математических символов
    has_numbers = (
        re.search(r'\d', text) or  # Обычные цифры
        re.search(r'[×·]', text) or  # Знак умножения
        re.search(r'[²³⁴⁵⁶⁷⁸⁹¹⁰]', text) or  # Степени
        re.search(r'[0-9,\.]+\s*[×·]\s*10', text)  # Научная нотация
    )
    
    if not has_numbers:
        return text  # Нет чисел - возвращаем как есть
    
    try:
        llm_base_url = os.getenv('LLM_BASE_URL', 'https://api.deepseek.com')
        llm_api_key = os.getenv('LLM_API_KEY', '')
        
        if not llm_api_key:
            logger.warning("LLM_API_KEY not set, skipping number conversion")
            return text
        
        # Быстрый запрос с таймаутом 2 секунды
        async with httpx.AsyncClient(timeout=2.0) as client:
                    response = await client.post(
                        f"{llm_base_url}/v1/chat/completions",
                        headers={"Authorization": f"Bearer {llm_api_key}"},
                        json={
                            "model": "deepseek-chat",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": "Ты помощник для конвертации чисел в слова на русском языке. Замени ВСЕ числа (включая десятичные, дроби, научную нотацию типа 5,97 × 10²⁴) на слова с правильным склонением. Научную нотацию преобразуй в полную форму (например, '5,97 × 10²⁴' → 'пять целых девяносто семь сотых умножить на десять в двадцать четвертой степени' или 'пять целых девяносто семь сотых на десять в двадцать четвертой степени'). Сохраняй весь остальной текст без изменений. Отвечай ТОЛЬКО преобразованным текстом, без объяснений."
                                },
                                {
                                    "role": "user",
                                    "content": f"Преобразуй все числа (включая научную нотацию) в слова с правильным склонением:\n\n{text}"
                                }
                            ],
                            "max_tokens": 300,  # Увеличено для научной нотации
                            "temperature": 0.1
                        }
                    )
            
            if response.status_code == 200:
                data = response.json()
                converted = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if converted:
                    logger.info(f"✅ Numbers converted: {text[:50]}... → {converted[:50]}...")
                    return converted
        
        return text  # Fallback на оригинал
    except asyncio.TimeoutError:
        logger.warning("Number conversion timeout, using original text")
        return text
    except Exception as e:
        logger.warning(f"Number conversion error: {e}, using original text")
        return text

class VoiceState(Enum):
    IDLE = "idle"
    USER_SPEAKING = "user"
    ASSISTANT_TTS = "tts"

@dataclass
class Turn:
    role: str            # "user" | "assistant"
    text: str
    ts: int = field(default_factory=lambda: int(time.time() * 1000))
    utterance_id: int | None = None

@dataclass
class SessionState:
    session_id: str
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

    def build_llm_messages(self, system_prompt: str, max_turns: int = 12):
        history = self.turns[-max_turns:]
        messages = [{"role": "system", "content": system_prompt}]
        for t in history:
            messages.append({"role": "user" if t.role == "user" else "assistant", "content": t.text})
        return messages

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
        self.session_id = session_id
        self.preset = preset
        self.send_event_cb = send_event
        self.send_audio_cb = send_audio
        self.vad = vad_engine
        self.rec = recognizer
        self.sample_rate = sample_rate
        self.protocol_version = protocol_version

        # State management
        self.voice_state = VoiceState.IDLE
        self.session = SessionState(session_id=session_id)
        
        # Runtime flags
        self.asr_enabled = True
        self.asr_warming_up = False
        self.asr_warmup_deadline = 0
        
        # Utterance tracking
        self.utterance_id = 0
        self.active_output_u = 0
        self.tts_allowed_u = 0
        self.tts_sending = False
        self.tts_playing = False
        self.output_active = False
        self.tts_epoch = 0
        
        # Barge-in tracking
        self.last_voice_ms = 0
        self.last_tts_chunk_ms = 0
        self.last_barge_in_ms = 0
        self.barge_armed = False
        self.silent_run_ms = 0
        self.voice_run_ms = 0
        
        # Endpointing & Context
        self.current_llm_input = ""
        self.llm_started = False
        self.silence_start_ms = 0
        self.audio_buf = bytearray()
        self.llm_to_tts_q = asyncio.Queue(maxsize=100)
        
        # Config (moved from server_fixed.py)
        self.BARGE_IN_ENABLED = os.getenv("BARGE_IN_ENABLED", "true").lower() == "true"
        self.BARGE_IN_MIN_VOICE_MS = int(os.getenv("BARGE_IN_MIN_VOICE_MS", "100"))
        self.BARGE_IN_COOLDOWN_MS = int(os.getenv("BARGE_IN_COOLDOWN_MS", "2000"))
        self.BARGE_IN_IGNORE_AFTER_TTS_MS = int(os.getenv("BARGE_IN_IGNORE_AFTER_TTS_MS", "500"))
        self.BARGE_IN_ARM_SILENCE_MS = int(os.getenv("BARGE_IN_ARM_SILENCE_MS", "300"))
        self.ASR_WARMUP_MS = int(os.getenv("ASR_WARMUP_MS", "200"))
        self.EARLY_PAUSE_MS = int(os.getenv("EARLY_PAUSE_MS", "350"))
        self.MIN_CHARS_EARLY = int(os.getenv("MIN_CHARS_EARLY", "12"))
        
        # Async tasks
        self.current_llm_task = None
        self.tts_task = asyncio.create_task(self._run_tts_loop())

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    async def process_pcm(self, pcm_bytes: bytes):
        """Main entry point for audio data from transport"""
        if self.voice_state == VoiceState.ASSISTANT_TTS and not self.BARGE_IN_ENABLED:
            return

        if not self.asr_enabled:
            return

        # Warmup handler
        if self.asr_warming_up:
            if time.time() < self.asr_warmup_deadline:
                return
            self.asr_warming_up = False
            print("[PIPELINE] ASR Warmup finished")

        self.audio_buf.extend(pcm_bytes)
        fb = int(self.sample_rate * 0.02) * 2 # 20ms frame
        
        while len(self.audio_buf) >= fb:
            frame = bytes(self.audio_buf[:fb])
            del self.audio_buf[:fb]
            
            is_voice = self.vad.is_speech(frame, self.sample_rate)
            now = self.now_ms()
            
            if is_voice:
                self.last_voice_ms = now
            
            # 1. Barge-in detection
            await self._handle_barge_in(is_voice, now)
            
            # 2. ASR & Endpointing (only if user can speak)
            if self.voice_state != VoiceState.ASSISTANT_TTS:
                if await asyncio.to_thread(self.rec.AcceptWaveform, frame):
                    res = json.loads(self.rec.Result())
                    text = res.get("text", "").strip()
                    if text:
                        await self.handle_final_text(text, "asr_final")
                else:
                    partial = json.loads(self.rec.PartialResult()).get("partial", "").strip()
                    if partial:
                        await self.send_event_cb({"type": "partial", "partial": partial})
                        await self._handle_endpointing(partial, is_voice, now)

    async def _handle_barge_in(self, is_voice: bool, now: int):
        if not self.output_active:
            self.barge_armed = False
            self.silent_run_ms = 0
            return

        if not is_voice:
            self.silent_run_ms += 20
            if self.silent_run_ms >= self.BARGE_IN_ARM_SILENCE_MS:
                self.barge_armed = True
        else:
            if self.barge_armed and not self.tts_playing:
                if now - self.last_tts_chunk_ms > self.BARGE_IN_IGNORE_AFTER_TTS_MS:
                    if now - self.last_barge_in_ms > self.BARGE_IN_COOLDOWN_MS:
                        self.voice_run_ms += 20
                        if self.voice_run_ms >= self.BARGE_IN_MIN_VOICE_MS:
                            await self.abort_output("barge_in")
            else:
                self.voice_run_ms = 0

    async def _handle_endpointing(self, partial: str, is_voice: bool, now: int):
        if not is_voice and len(partial) > self.MIN_CHARS_EARLY:
            if self.silence_start_ms == 0:
                self.silence_start_ms = now
            elif now - self.silence_start_ms > self.EARLY_PAUSE_MS:
                await self.handle_final_text(partial, "endpoint_early")
        else:
            self.silence_start_ms = 0

    async def handle_final_text(self, final_text: str, reason: str):
        final_text = final_text.strip()
        if not final_text or self.current_llm_input == final_text:
            return

        # Protection against echo
        if self.tts_playing or (self.now_ms() - self.last_tts_chunk_ms < self.BARGE_IN_IGNORE_AFTER_TTS_MS):
            return

        print(f"[PIPELINE] Final text: '{final_text}' ({reason})")
        self.current_llm_input = final_text
        self.session.add_turn("user", final_text, utterance_id=self.utterance_id)
        
        # Start response generation
        await self.start_or_restart_llm(final_text)

    async def start_or_restart_llm(self, text: str):
        self.utterance_id += 1
        u_id = self.utterance_id
        
        if self.current_llm_task:
            self.current_llm_task.cancel()
            
        self.output_active = True
        self.active_output_u = u_id
        self.tts_allowed_u = u_id
        self.tts_epoch += 1 # Invalidate previous TTS chunks
        
        # Clear queue
        while not self.llm_to_tts_q.empty():
            try: self.llm_to_tts_q.get_nowait()
            except: break
            
        await self.send_event_cb({"type": "llm_start", "utterance_id": u_id, "text": text})
        self.current_llm_task = asyncio.create_task(self._run_llm(u_id, text))

    async def _run_llm(self, u_id: int, prompt_text: str):
        messages = self.session.build_llm_messages(self.preset["system_prompt"])
        self.session.llm_buffers[u_id] = ""
        
        try:
            # Inline Step 3 logic
            payload = {
                "model": self.preset["model"],
                "messages": messages,
                "stream": True,
                "temperature": self.preset["temperature"],
                "max_tokens": self.preset["max_tokens"],
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {"Authorization": f"Bearer {os.getenv('LLM_API_KEY')}"}
                async with client.stream("POST", f"{os.getenv('LLM_BASE_URL')}/v1/chat/completions", json=payload, headers=headers) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if u_id != self.active_output_u: break
                        if not line.startswith("data: "): continue
                        
                        data = line[6:]
                        if data == "[DONE]": break
                        
                        try:
                            chunk = json.loads(data)
                            tok = chunk["choices"][0]["delta"].get("content")
                            if tok:
                                self.session.llm_buffers[u_id] += tok
                                await self.send_event_cb({"type": "llm_delta", "utterance_id": u_id, "delta": tok})
                                await self.llm_to_tts_q.put((u_id, tok))
                        except: continue
            
            await self.llm_to_tts_q.put((u_id, "")) # End signal
            await self.send_event_cb({"type": "llm_end", "utterance_id": u_id})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self.send_event_cb({"type": "llm_error", "error": str(e)})

    async def _run_tts_loop(self):
        buf = ""
        current_u = 0
        
        while True:
            u_id, tok = await self.llm_to_tts_q.get()
            
            if u_id != current_u:
                if self.tts_sending:
                    await self.send_event_cb({"type": "tts_end", "utterance_id": current_u})
                
                current_u = u_id
                buf = ""
                self.voice_state = VoiceState.ASSISTANT_TTS
                self.tts_sending = True
                await self.send_event_cb({"type": "tts_start", "utterance_id": u_id})
                self.asr_enabled = False

            if tok == "": # EOF
                if buf.strip():
                    await self._synthesize_and_send(current_u, buf.strip())
                
                await self.send_event_cb({"type": "tts_end", "utterance_id": current_u})
                self.voice_state = VoiceState.IDLE
                self.tts_sending = False
                self.tts_playing = False
                self.output_active = False
                self.asr_enabled = True
                self.asr_warming_up = True
                self.asr_warmup_deadline = time.time() + (self.ASR_WARMUP_MS / 1000.0)
                
                # Commit response to history
                assistant_text = self.session.llm_buffers.pop(current_u, "").strip()
                if assistant_text:
                    self.session.add_turn("assistant", assistant_text, utterance_id=current_u)
                continue

            buf += tok
            # Отправляем чанк размером ~10 символов для максимально быстрого старта
            # Условия: минимум 10 символов И (пунктуация в текущем токене ИЛИ пробел в буфере ИЛИ превышение 50 символов)
            has_punctuation = any(p in tok for p in ".!?\n")
            has_space = " " in buf
            should_send = len(buf) >= 10 and (has_punctuation or has_space or len(buf) > 50)
            if should_send:
                chunk_text = buf.strip()
                # Пропускаем слишком короткие или пустые чанки
                if chunk_text and len(chunk_text) >= 3:
                    await self._synthesize_and_send(current_u, chunk_text)
                buf = ""

    async def _synthesize_and_send(self, u_id: int, text: str):
        if not text or u_id != self.active_output_u: return
        
        try:
            # Конвертируем цифры в слова перед TTS (с таймаутом и обработкой ошибок)
            converted_text = text
            try:
                converted_text = await asyncio.wait_for(convert_numbers_to_words(text), timeout=1.5)
            except asyncio.TimeoutError:
                logger.warning(f"Number conversion timeout for text: {text[:50]}..., using original")
                converted_text = text
            except Exception as conv_error:
                logger.warning(f"Number conversion failed: {conv_error}, using original text")
                converted_text = text
            
            # Проверяем, что текст не пустой после конвертации
            if not converted_text or not converted_text.strip():
                logger.warning(f"Empty text after conversion, skipping TTS")
                return
            
            self.tts_playing = True
            wav = await tts_silero.synthesize_wav(
                converted_text,
                model_name=self.preset["tts"]["model"],
                voice=self.preset["tts"]["voice"]
            )
            self.last_tts_chunk_ms = self.now_ms()
            await self.send_audio_cb(u_id, wav)
        except Exception as e:
            logger.error(f"TTS Error: {e}")
            # Отправляем ошибку клиенту
            await self.send_event_cb({"type": "tts_error", "utterance_id": u_id, "error": str(e)})

    async def abort_output(self, reason: str):
        print(f"[PIPELINE] Aborting output: {reason}")
        self.tts_epoch += 1
        self.output_active = False
        self.active_output_u = 0
        self.tts_playing = False
        self.tts_sending = False
        self.barge_armed = False
        self.voice_state = VoiceState.IDLE
        self.asr_enabled = True
        self.last_barge_in_ms = self.now_ms()
        
        if self.current_llm_task:
            self.current_llm_task.cancel()
            
        while not self.llm_to_tts_q.empty():
            try: self.llm_to_tts_q.get_nowait()
            except: break
            
        await self.send_event_cb({"type": "abort", "reason": reason})

    def close(self):
        if self.tts_task: self.tts_task.cancel()
        if self.current_llm_task: self.current_llm_task.cancel()
