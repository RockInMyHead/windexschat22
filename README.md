# 🚀 WindexsChat 2.0 - AI-ассистент с расширенными возможностями

**WindexsChat 2.0** - это полнофункциональный AI-ассистент с поддержкой чатов, обработки файлов, визуализации данных и многого другого.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://ai.windexs.ru)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/RockInMyHead/windexschat22)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌐 Онлайн версия

**Проект доступен онлайн:** [https://ai.windexs.ru](https://ai.windexs.ru)

- ✅ Полностью функциональная версия
- ✅ Бесплатный план WindexsAI Lite
- ✅ Платный план WindexsAI Pro (₽399/месяц)

📖 **[Инструкции по развертыванию](DEPLOYMENT.md)** - как запустить проект на своем сервере

## 🚀 Быстрый старт

### Установка и запуск

**Требования:**
- Node.js 18+ и npm
- Git

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/RockInMyHead/windexschat22.git
cd windexschat22

# 2. Установите зависимости
npm install

# 3. Инициализируйте базу данных
npm run init-db

# 4. Запустите приложение
npm run dev:full
```

Приложение будет доступно по адресу:
- **Frontend:** https://ai.windexs.ru
- **API сервер:** https://ai.windexs.ru/api
- **MCP сервер:** https://ai.windexs.ru/api/mcp

### Настройка API ключей

1. **DeepSeek API ключ:**
   - Получите ключ от [DeepSeek](https://platform.deepseek.com/)
   - Добавьте в `.env`:
   ```bash
   DEEPSEEK_API_KEY=your_deepseek_key_here
   ```

2. **Tavily API ключ (для поиска в интернете):**
   - Получите ключ от [Tavily](https://tavily.com/)
   - Добавьте в `.env`:
   ```bash
   TAVILY_API_KEY=your_tavily_key_here
   ```

3. **Создайте файл `.env`:**
   ```bash
   DEEPSEEK_API_KEY=your_deepseek_key_here
   TAVILY_API_KEY=your_tavily_key_here
   ```

### Доступные скрипты

```bash
npm run dev          # Запуск frontend (Vite)
npm run server       # Запуск API сервера (Express)
npm run mcp          # Запуск MCP сервера для поиска
npm run dev:full     # Запуск всего приложения (API + Frontend + MCP)
npm run init-db      # Инициализация базы данных
npm run build        # Сборка для production
npm run preview      # Просмотр сборки
npm run deploy       # Подготовка к деплою на сервер
```

### 🚀 Деплой на сервер

Для развертывания на production сервере:

```bash
# 1. Подготовка к деплою
npm run deploy

# 2. Загрузка на сервер
scp -r deploy/* user@your-server:/path/to/app/

# 3. На сервере:
cd /path/to/app
npm install --production
pm2 start ecosystem.config.js
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- SQLite (better-sqlite3)
- OpenAI API
- Express.js (API server)

## Database Features

The application includes a local SQLite database that stores:

- Chat sessions with titles and timestamps
- All messages (user and AI responses)
- Automatic session management

## File Processing Features

The application can process various types of documents and images:

### Supported File Types
- **PDF documents** - text extraction from PDF files
- **DOCX documents** - text extraction from Word documents
- **TXT files** - plain text files
- **Images** - OCR (Optical Character Recognition) for:
  - PNG, JPG, JPEG images
  - BMP, TIFF, WebP formats
  - Support for Russian and English text

### How File Processing Works
1. Click the 📎 button in the chat input
2. Select a supported file (max 10MB)
3. The file is processed locally in your browser
4. Extracted text is automatically sent to AI for analysis
5. AI provides a summary and analysis of the document content

### Privacy & Security
- All file processing happens locally in your browser
- Files are not uploaded to external servers
- OCR processing uses Tesseract.js for offline text recognition
- Your documents remain private and secure

## AI Response Planning Features

The application includes an advanced intelligent response planning system that creates structured, multi-step responses for complex queries:

### Dynamic Plan Generation
- **Adaptive complexity** - Plans adjust based on query type:
  - Simple questions (greetings, facts): 1-2 steps
  - Creative tasks (writing, design): 3-6 steps
  - Analytical tasks: 4-8 steps
  - Business planning: 5-10 detailed steps
- **Context-aware planning** - Specialized strategies for different task types
- **Smart categorization** - Automatic detection of business, creative, analytical, and simple queries

### Business Planning Intelligence
The system includes specialized templates for comprehensive business planning:

#### **Market Analysis**
- Competitor research and positioning
- Demographic studies and target audience analysis
- Market trends and seasonal demand patterns
- Potential market size estimation

#### **Financial Planning**
- Initial investment calculations (rent, equipment, renovation)
- Monthly operational cost projections
- Revenue forecasting based on customer volume and average check
- Break-even point analysis and profitability projections

#### **Marketing Strategy**
- Unique value proposition (UVP) development
- Pricing strategy formulation
- Multi-channel promotion planning
- Customer loyalty program design

#### **Operational Planning**
- Staff scheduling and management
- Menu development and process optimization
- Supplier selection and procurement planning
- Quality control standards and service protocols

#### **Risk Assessment**
- Market risks (competition, changing preferences)
- Financial risks (funding gaps, price fluctuations)
- Operational risks (supplies, staff, equipment)
- Reputational risk management

### Real-time Progress Tracking
- **Visual step indicators** - Progress bars with completion status
- **Detailed descriptions** - Each step includes specific actions and expected outcomes
- **Streaming responses** - Real-time content generation for each planning phase
- **Context preservation** - Previous steps inform subsequent responses

### How It Works
1. User submits a complex query (e.g., "business plan for a coffee shop")
2. AI analyzes the query and determines appropriate complexity level
3. System generates a structured plan with 5-10 specific steps
4. Each step is executed sequentially with detailed instructions
5. User sees real-time progress and can track completion
6. Final comprehensive response covers all aspects of the query

## Data Visualization Features

The application can create interactive charts and graphs in the chat interface:

### Supported Chart Types
- **Line Charts** 📈 - for trends and time series data
- **Bar Charts** 📊 - for comparisons and categories
- **Pie Charts** 🥧 - for proportions and percentages
- **Area Charts** 📉 - for cumulative data visualization

### How Data Visualization Works
1. Ask AI about data analysis or visualization
2. AI creates a structured plan including visualization step
3. AI generates chart configuration in JSON format
4. Chart is automatically rendered in the chat message
5. Interactive tooltips and responsive design

### Chart Configuration Format
```json
{
  "type": "bar",
  "data": [
    {"name": "Category A", "value": 100},
    {"name": "Category B", "value": 200}
  ],
  "title": "Chart Title",
  "xAxisKey": "name",
  "yAxisKey": "value"
}
```

### Examples of Chart Requests
- "Покажи график продаж по месяцам"
- "Создай круговую диаграмму распределения бюджета"
- "Визуализируй данные о росте компании"
- "Нарисуй линейный график трендов"

### Technical Details
- Built with **Recharts** library for React
- **Responsive design** - adapts to screen size
- **Interactive elements** - hover effects and tooltips
- **Customizable colors** and styling
- **JSON-based configuration** for easy AI generation

### Chat Management Features

The application provides comprehensive chat management:

#### **Chat History**
- **Persistent storage** - All chats are saved to SQLite database
- **Automatic titles** - Chat titles are generated from first user message
- **Date grouping** - Chats are organized by date (Today, Yesterday, X days ago)
- **Real-time updates** - Chat list updates immediately after changes

#### **Chat Deletion**
- **Hover to delete** - Delete button appears on chat hover (desktop)
- **Right-click menu** - Context menu with delete option
- **Safety checks** - Cannot delete active chat or last remaining chat
- **Instant deletion** - Chats are deleted immediately without confirmation

#### **Safety Features**
- **Active chat protection** - Cannot delete currently open chat
- **Last chat protection** - At least one chat must remain
- **Error handling** - Proper error messages for failed operations
- **Immediate updates** - UI updates instantly after deletion

### Running with Database

```sh
# Initialize database (one-time setup)
npm run init-db

# Start both API server and frontend
npm run dev:full

# Or run them separately:
npm run server    # API server on port 3001
npm run dev       # Frontend on port 8083
```

The database file (`windexs_chat.db`) is created automatically and stores all your chat history locally.

## ✨ Ключевые возможности

### 🤖 AI интеграция
- **Две модели:** WindexsAI Lite (GPT-4o-mini) и WindexsAI Pro (расширенная логика)
- **Windexs Pro:** Двухэтапная логика (поиск + анализ) для глубоких ответов
- Интеллектуальное планирование ответов
- Потоковая генерация текста
- Анализ и обработка документов

### 🌐 Поиск в интернете (MCP)
- **MCP сервер** для реального поиска в интернете
- **Tavily API** интеграция для качественных результатов
- **Умное распознавание** запросов, требующих актуальной информации:
  - 📈 Финансовые данные (курсы валют, акции, криптовалюты)
  - 🌤️ Погода и географическая информация
  - 📰 Новости и текущие события
  - 📊 Статистика и аналитика
  - 🏢 Бизнес и маркетинговые данные

### 📊 Визуализация данных
- Интерактивные графики (линейные, столбчатые, круговые)
- Реальные данные из интернета
- Автоматическая генерация JSON конфигураций
- Адаптивный дизайн

### 📁 Обработка файлов
- **PDF документы** - извлечение текста
- **Word документы** (DOCX) - обработка контента
- **Текстовые файлы** - прямое чтение
- **Изображения** - OCR на русском и английском
- **Безопасность** - локальная обработка, без загрузки на сервер

### 🏗️ Генерация артефактов (сайты)
- **Создание сайтов через AI** - "Создай лендинг для кофейни"
- **Интерактивный редактор** Sandpack с live preview
- **Полноценные React приложения** с TypeScript и Tailwind CSS
- **Сохранение и загрузка** созданных сайтов
- **Экспорт проектов** в ZIP архивы
- **Множество шаблонов** - лендинги, приложения, дашборды

### 💬 Управление чатами
- Сохранение истории разговоров
- Автоматическая генерация заголовков
- Группировка по датам
- Удаление чатов с защитой

### 🎨 Современный интерфейс
- Темная тема с аккуратными стилями
- Адаптивный дизайн для всех устройств
- Красивые блоки кода с подсветкой
- Плавные анимации и переходы

## 🚀 Последние обновления (v2.1)

### 🌟 Новые возможности (v2.1):
- 🚀 **MCP сервер** для реального поиска в интернете
- 🎯 **Windexs Pro модель** с двухэтапной логикой анализа
- 🔍 **Умный поиск** для финансовых, погодных и новостных запросов
- 📊 **Расширенная поддержка** различных типов запросов
- 🗑️ **Удаление сообщений** - пользователи могут удалять свои сообщения и сообщения ИИ
- 🙈 **Скрытие стоимости токенов** - убрана статистика использования токенов из интерфейса
- 🏗️ **Артефакты: генерация сайтов** - AI может создавать полноценные React приложения
- 📦 **Система деплоя** - готовые скрипты для развертывания на сервере

### 🐛 Исправления и улучшения (v2.1):
- ✅ **Исправлена ошибка 404** для PDF worker
- ✅ **Добавлены блоки кода** в Telegram-стиле
- ✅ **Реальные данные** для визуализаций через интернет-поиск
- ✅ **Улучшенная система поиска** с Tavily API
- ✅ **Оптимизированные скрипты сборки**
- ✅ **Автоматизация** копирования зависимостей
- ✅ **Исправлены конфликты** в логике моделей
- ✅ **Добавлено логирование** для отладки
- ✅ **Исправлены ошибки bundling** для production сборки
- ✅ **Добавлена защита** от удаления активных чатов
- ✅ **Улучшена производительность** обработки файлов

## 🛠 Технологии

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express.js
- **MCP сервер:** Node.js + Tavily API для поиска в интернете
- **База данных:** SQLite + better-sqlite3
- **UI:** Tailwind CSS + Shadcn/ui + Radix UI
- **AI:** OpenAI API (GPT-4o-mini, GPT-5.1 через fallback)
- **Поиск:** Tavily API для качественного веб-поиска
- **Обработка файлов:** PDF.js, Tesseract.js, Mammoth.js
- **Визуализация:** Recharts

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие проекта!

1. Форкните репозиторий: [https://github.com/RockInMyHead/windexschat22](https://github.com/RockInMyHead/windexschat22)
2. Создайте ветку для вашей фичи (`git checkout -b feature/AmazingFeature`)
3. Зафиксируйте изменения (`git commit -m 'Add some AmazingFeature'`)
4. Запушьте в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

### 📋 Roadmap для контрибьюторов

- 🔄 **Итерации артефактов** - доработка созданных сайтов
- 🎨 **Новые шаблоны** - Vue.js, Svelte, Angular
- 🌙 **Темная тема** - полная поддержка темной темы
- 🔍 **Поиск по чатам** - поиск в истории сообщений
- 📤 **Экспорт чатов** - в PDF, HTML, Markdown
- 🤖 **Расширенная AI** - поддержка Claude, Gemini

## 📞 Поддержка

Если у вас возникли вопросы или проблемы:
- Создайте [Issue](https://github.com/RockInMyHead/WindexsChat2.0/issues) на GitHub
- Проверьте [документацию по API](API_SETUP.md)

---

---

## 📊 Статус проекта

- ✅ **Production Ready** - проект готов к промышленному использованию
- ✅ **Активная разработка** - регулярные обновления и новые фичи
- ✅ **Открытый исходный код** - MIT лицензия
- ✅ **Документированный** - подробная документация для разработчиков

### 🌟 Ключевые достижения v2.1

| Фича | Статус | Описание |
|------|--------|----------|
| 🤖 AI Чат | ✅ Готово | DeepSeek интеграция, две модели |
| 🌐 MCP Поиск | ✅ Готово | Реальный поиск в интернете |
| 📊 Визуализация | ✅ Готово | Интерактивные графики |
| 📁 Обработка файлов | ✅ Готово | PDF, DOCX, изображения |
| 🏗️ Артефакты | ✅ Готово | Генерация React приложений |
| 🗑️ Удаление сообщений | ✅ Готово | Управление историей чата |
| 🚀 Деплой | ✅ Готово | Production-ready скрипты |

---

**Разработано с ❤️ для создания лучшего AI-ассистента**

**Репозиторий:** [https://github.com/RockInMyHead/windexschat22](https://github.com/RockInMyHead/windexschat22)
