import asyncio
import json
import logging
from fastapi import FastAPI, Request, Response
from fastapi.responses import Response
import uvicorn
import tts_silero
import os

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts_server")

app = FastAPI()

@app.post("/tts")
async def tts_endpoint(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "")
        model = data.get("model", "silero_ru")
        voice = data.get("voice", "eugene")
        speed = float(data.get("speed", 1.0))
        emotion = data.get("emotion", "neutral")

        if not text:
            return {"error": "text is required"}, 400

        logger.info(f"Generating TTS for: {text[:50]}...")
        
        # Синтезируем WAV
        wav_bytes = await tts_silero.synthesize_wav(
            text=text,
            model_name=model,
            voice=voice,
            speed=speed,
            emotion=emotion
        )

        return Response(content=wav_bytes, media_type="audio/wav")

    except Exception as e:
        logger.error(f"TTS Error: {e}")
        return {"error": str(e)}, 500

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.getenv("TTS_PORT", 8002))
    # Используем порт 8002, так как он уже прописан в server.js (хотя там был конфликт с MCP)
    # На самом деле лучше использовать другой свободный порт, например 8003
    uvicorn.run(app, host="0.0.0.0", port=8003)
