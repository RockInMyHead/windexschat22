# 🚀 WindexsAI Chat v2.2 — Realtime Voice + Multimodal AI

**WindexsAI Chat** — это платформа с чат‑интерфейсом, генерацией сайтов, обработкой файлов и **realtime голосовыми звонками** (ASR → LLM → TTS) в одном приложении.

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-brightgreen)](https://ai.windexs.ru)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/RockInMyHead/windexschat22)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 🔥 Что нового в текущей версии

- **Realtime Voice Call**: потоковый аудиозвонок, быстрый ASR, TTS и ответы LLM без задержек.
- **Надёжное аудио‑воспроизведение**: очередь чанков и корректная синхронизация TTS.
- **Стабильный протокол WS**: поддержка бинарных аудио‑чанков и метаданных.

---

## ✨ Ключевые возможности

- 🤖 **AI‑чат** с потоковыми ответами LLM.
- 🎙️ **Realtime голосовые звонки** (WebSocket, ASR, TTS).
- 🏗️ **Генерация сайтов** и артефактов (Sandpack, live preview).
- 📊 **Визуализации данных** (графики и отчёты).
- 📁 **Обработка файлов** (PDF, DOCX, изображения, OCR).
- 🌐 **Поиск в интернете** через MCP.
- 💬 **Управление чатами**: история, сессии, удаление, экспорт.

---

## 🧩 Архитектура

```
Frontend (React + TypeScript)
├── Vite + SWC
├── Shadcn/ui + Tailwind CSS
└── Recharts / Sandpack

Backend (Node.js)
├── Express API
├── SQLite (better-sqlite3)
└── MCP / инструменты

Voice Backend (Python)
├── WebSocket realtime
├── Vosk ASR + VAD
├── LLM streaming → TTS
└── TTS: Silero (local) или OpenAI
```

---

## 🚀 Быстрый старт (локально)

### Требования
- Node.js 18+
- Python 3.9+
- Git

### Установка

```bash
git clone https://github.com/RockInMyHead/windexschat22.git
cd windexschat22

npm install
npm run init-db
```

### Запуск приложения

```bash
# API (Express)
npm run server

# Frontend (Vite)
npm run dev
```

### Запуск голосового backend

```bash
cd voice-backend
./start_voice_backend.sh
```

**Откройте:** `http://127.0.0.1:8081`  
**WS голос:** `ws://127.0.0.1:2700`

---

## 🔑 Переменные окружения

### Основной backend
```env
DEEPSEEK_API_KEY=...
OPENAI_API_KEY=...        # если используете OpenAI
TAVILY_API_KEY=...         # для поиска (опционально)
VITE_API_BASE_URL=http://127.0.0.1:1062
```

### Голосовой backend
```env
TTS_PROVIDER=local         # local | openai
TTS_BASE_URL=http://127.0.0.1:8002
TTS_MODEL=silero_ru
TTS_VOICE=eugene
TTS_SPEED=0.93
```

---

## 🧪 Полезные команды

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Frontend (Vite) |
| `npm run server` | API сервер |
| `npm run mcp` | MCP сервер |
| `npm run init-db` | Инициализация БД |
| `npm run build` | Production сборка |

---

## 📘 Документация по голосу

- `VOICE_CALL_GUIDE.md`
- `VOICE_ARCHITECTURE_FIXED.md`
- `VOICE_ROLE_MODEL.md`
- `QUICK_START_VOICE.md`

---

## 🆘 Troubleshooting (голос)

Если текст в чате есть, а звука нет:
1. Проверьте `voice-backend/logs/stt.log`
2. Убедитесь, что `TTS_PROVIDER` настроен корректно
3. Проверьте, что WebSocket `ws://127.0.0.1:2700` доступен

---

## 📄 Лицензия

MIT — подробнее в [LICENSE](LICENSE).

---

## ✅ Статус

**Версия:** 2.2  
**Статус:** Production Ready  
**Последнее обновление:** Январь 2026