# Agents configuration (legacy compatibility)
# After STEP 4, all agents were collapsed into a single preset
# This file exists only for backward compatibility with server_fixed.py

AGENTS = {
    "assistant": {
        "system_prompt": "Ты топ 1 в мире ИИ-ассистент WindexsAI. Ты отлично разбираешься во всех темах. Отвечай кратко и по делу. 1-2 предложения. Без рассуждений.",
        "model": "deepseek-chat",
        "temperature": 0.4,
        "max_tokens": 220,
        "tts_voice": "eugene",
        "tts_speed": 1.05,
        "tts_emotion": "neutral",
        "tts_pause": 0.12
    }
}

# Default agent ID
DEFAULT_AGENT_ID = "assistant"
