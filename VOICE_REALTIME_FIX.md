# 🔧 КРИТИЧЕСКИЙ ФИКС: Realtime Voice Mode

## ❗ ПРОБЛЕМА

Backend ИИ-ассистента работает в **local stub mode**:

```
Local mode: Voice API not configured.
Set VOICE_CONTROL_API_KEY
```

Это значит, что **Voice API физически не вызывается**, даже если сам Voice API работает правильно.

---

## ✅ РЕШЕНИЕ

### 1. Создать файл `.env` на сервере

```bash
ssh user1@176.109.111.72
cd /home/user1
nano .env
```

### 2. Вставить следующее содержимое:

```env
# ===========================================
# WindexsAI Backend Environment Configuration
# ===========================================

# ========== VOICE API (КРИТИЧНО для realtime) ==========
VOICE_API_MODE=true
VOICE_CONTROL_API_KEY=key-assist
VOICE_CONTROL_URL=http://176.123.165.23:8080
VOICE_WS_PUBLIC_HOST=176.123.165.23
VOICE_WS_PUBLIC_PORT=2700

# ========== OpenAI API ==========
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE

# ========== DeepSeek API (optional) ==========
# DEEPSEEK_API_KEY=your_deepseek_key_here

# ========== PROXY (optional) ==========
# PROXY_URL=http://username:password@proxy-host:port

# ========== Node Environment ==========
NODE_ENV=production
PORT=1062
```

**Сохранить:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 3. Перезапустить backend через PM2

```bash
pm2 restart windexs-ai
```

### 4. Проверить логи

```bash
pm2 logs windexs-ai --lines 50
```

**Должно быть:**
```
✅ VOICE_CONTROL_API_KEY loaded: true
🎤 Creating voice session for user...
🎤 Calling Voice API at http://176.123.165.23:8080...
```

**НЕ должно быть:**
```
❌ VOICE_CONTROL_API_KEY not set, using local session mode
❌ Local mode: Voice API not configured
```

---

## 📌 ЧТО БЫЛО ИСПРАВЛЕНО

### Frontend (уже применено):

1. ✅ **AudioWorklet** (`public/audioWorklet.js`)
   - Фиксированные чанки 320 samples (20ms @ 16kHz)
   - Transferable buffers без копирования
   
2. ✅ **useVoiceSession** (`src/hooks/useVoiceSession.ts`)
   - Не отправляем PCM до получения `ready`
   - Правильный парсинг AUD0 протокола (header = 16 bytes)
   - FSM с состоянием `ready`

### Backend (требует конфигурации):

3. ⚠️ **server.js** - проверяет `VOICE_CONTROL_API_KEY`
   - Если НЕТ → local stub mode (не работает realtime)
   - Если ЕСТЬ → проксирует в Voice API ✅

---

## 🎯 ИТОГ

После создания `.env` и рестарта PM2:

- ✅ Backend начнёт проксировать в Voice API
- ✅ Придёт событие `ready`
- ✅ STT начнёт распознавать речь
- ✅ LLM будет генерировать ответы
- ✅ TTS будет воспроизводиться

**Без `.env` realtime ФИЗИЧЕСКИ НЕ МОЖЕТ работать.**
