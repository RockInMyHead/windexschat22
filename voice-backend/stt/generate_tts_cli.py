#!/usr/bin/env python3
"""CLI script for generating Silero TTS audio"""
import sys
import os

# Добавляем путь к модулям
sys.path.insert(0, os.path.dirname(__file__))

from tts_silero import generate_audio_sync

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python3 generate_tts_cli.py <text> <model> [voice] [speed] [emotion]', file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else 'silero_ru'
    voice = sys.argv[3] if len(sys.argv) > 3 else 'eugene'
    speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    emotion = sys.argv[5] if len(sys.argv) > 5 else 'neutral'
    
    try:
        wav_bytes, sample_rate = generate_audio_sync(text, model, voice, speed, emotion)
        # Выводим WAV данные в stdout
        sys.stdout.buffer.write(wav_bytes)
        sys.stdout.buffer.flush()
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)
