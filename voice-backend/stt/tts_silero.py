import asyncio
import io
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf
import torch

# Настройка логирования
logger = logging.getLogger("tts_silero")

# Конфигурация моделей TTS (из app.py)
MODEL_CONFIGS = {
    "silero_ru": {
        "repo": "snakers4/silero-models",
        "model": "silero_tts",
        "language": "ru",
        "model_id": "v5_1_ru",
        "voices": ["eugene", "aidar", "xenia", "baya", "kseniya", "random"],
        "default_voice": "eugene",
        "sample_rate": 48000,
    },
    "silero_en": {
        "repo": "snakers4/silero-models",
        "model": "silero_tts",
        "language": "en",
        "model_id": "v3_en",
        "voices": ["en_0", "en_1", "en_2", "en_3", "en_4", "en_5", "en_6", "en_7", "en_8", "en_9", "en_10", "en_11", "en_12", "en_13", "en_14", "en_15", "random"],
        "default_voice": "en_0",
        "sample_rate": 48000,
    }
}

EMOTION_PRESETS = {
    "neutral": {"speed": 1.0, "pause": 0.3},
    "happy":   {"speed": 1.1, "pause": 0.2},
    "sad":     {"speed": 0.9, "pause": 0.5},
    "angry":   {"speed": 1.15, "pause": 0.15},
}

# Глобальные переменные рантайма
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model_cache = {}
model_lock = threading.Lock()

def load_model(model_name: str):
    """Загрузка модели TTS (с кэшированием и блокировкой)"""
    if model_name in model_cache:
        return model_cache[model_name]

    with model_lock:
        if model_name in model_cache:
            return model_cache[model_name]

        logger.info(f"Загрузка модели {model_name}...")
        try:
            model_config = MODEL_CONFIGS[model_name]
            model, _ = torch.hub.load(
                repo_or_dir=model_config["repo"],
                model=model_config["model"],
                language=model_config["language"],
                speaker=model_config["model_id"]
            )
            model.to(device)
            model_cache[model_name] = model
            logger.info(f"Модель {model_name} загружена успешно")
            return model
        except Exception as e:
            logger.error(f"Ошибка загрузки модели {model_name}: {e}")
            raise

def split_text_by_sentences(text: str, pause_duration: float) -> List[Dict[str, Any]]:
    """Разбиение текста на предложения с паузами"""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    result = []
    for i, sentence in enumerate(sentences):
        if sentence.strip():
            result.append({
                "text": sentence.strip(),
                "pause_after": pause_duration if i < len(sentences) - 1 else 0.0
            })
    return result

def generate_audio_sync(text: str, model_name: str, voice: str, speed: float = 1.0,
                       emotion: str = "neutral", pause_between_sentences: float = 0.3) -> Tuple[bytes, int]:
    """Синхронная генерация аудио (WAV bytes)"""
    try:
        model_config = MODEL_CONFIGS.get(model_name, MODEL_CONFIGS["silero_ru"])
        model = load_model(model_name)

        emotion_config = EMOTION_PRESETS.get(emotion, EMOTION_PRESETS["neutral"])
        effective_speed = speed * emotion_config["speed"]
        effective_pause = pause_between_sentences if pause_between_sentences is not None else emotion_config["pause"]

        sentences = split_text_by_sentences(text, effective_pause)
        audio_parts = []
        sample_rate = model_config["sample_rate"]

        with torch.inference_mode():
            for sentence_info in sentences:
                sentence_text = sentence_info["text"]
                if not sentence_text.strip():
                    continue

                sentence_audio = model.apply_tts(
                    text=sentence_text,
                    speaker=voice if voice != "random" else model_config["default_voice"],
                    sample_rate=sample_rate
                )

                if isinstance(sentence_audio, torch.Tensor):
                    sentence_audio = sentence_audio.cpu().numpy()

                audio_parts.append(sentence_audio)

                if sentence_info["pause_after"] > 0:
                    pause_samples = int(sample_rate * sentence_info["pause_after"])
                    pause_audio = np.zeros(pause_samples, dtype=np.float32)
                    audio_parts.append(pause_audio)

        if audio_parts:
            combined_audio = np.concatenate(audio_parts)
        else:
            combined_audio = np.array([], dtype=np.float32)

        # Пакуем WAV в памяти
        buf = io.BytesIO()
        sf.write(buf, combined_audio, sample_rate, format="WAV", subtype="PCM_16")
        wav_bytes = buf.getvalue()

        return wav_bytes, sample_rate

    except Exception as e:
        logger.error(f"Ошибка генерации аудио: {e}")
        raise

async def synthesize_wav(text: str, model_name: str, voice: str, speed: float = 1.0,
                        emotion: str = "neutral", pause: float = 0.3) -> bytes:
    """Асинхронная обертка для генерации WAV"""
    wav_bytes, _ = await asyncio.to_thread(
        generate_audio_sync, text, model_name, voice, speed, emotion, pause
    )
    return wav_bytes
