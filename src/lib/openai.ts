import { API_BASE_URL } from './api';
import { isMarketQuery } from './market';
import JSON5 from 'json5';

// Интерфейс для информации о стоимости токенов
export interface TokenCost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
}

// Стоимость токенов за 1M токенов в долларах (DeepSeek models)
const TOKEN_PRICES = {
  'deepseek-chat': { input: 0.07, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

// Функция расчета стоимости токенов (1 рубль за сообщение)
export const calculateTokenCost = (usage: any, model: string): TokenCost => {
  const actualModel = getActualModel(model);

  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || (inputTokens + outputTokens);

  // Фиксированная стоимость: 1 рубль за сообщение
  // Конвертируем в USD (курс 85 рублей за доллар)
  const totalCost = 1 / 85; // 1 рубль = 1/85 USD
  const inputCost = totalCost * 0.3; // Примерное распределение (30% на input)
  const outputCost = totalCost * 0.7; // 70% на output

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    model: actualModel
  };
};

// Функция для проверки доступности API
// При использовании серверного прокси всегда возвращаем true,
// поскольку сервер сам проверит наличие API ключа
const isApiAvailable = () => {
  return true;
};

// Функция для получения актуальных market данных для контекста AI
const getMarketSnapshot = async (): Promise<string> => {
  try {
    console.log('📊 Fetching market snapshot for AI context...');
    const response = await fetch(`${API_BASE_URL}/market/quote?vs=usd,eur,rub`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('⚠️ Market snapshot fetch failed:', response.status);
      return '[MARKET_DATA_UNAVAILABLE]';
    }

    const data = await response.json();
    console.log('📊 Market snapshot received:', data);

    // Форматируем данные для AI
    const quote = data.quote;
    const asOf = new Date(data.asOf).toISOString();

    return `MARKET_SNAPSHOT (Source: ${data.provider}, AsOf: ${asOf}):
BTC/USD: ${quote.usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
BTC/EUR: ${quote.eur?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
BTC/RUB: ${quote.rub?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A'}
24h Change: ${quote.usd_24h_change?.toFixed(2) || 'N/A'}%
Market Cap: ${quote.usd_market_cap ? '$' + (quote.usd_market_cap / 1e9).toFixed(2) + 'B' : 'N/A'}
24h Volume: ${quote.usd_24h_vol ? '$' + (quote.usd_24h_vol / 1e9).toFixed(2) + 'B' : 'N/A'}
Cached: ${data.cached}`;
  } catch (error) {
    console.error('❌ Market snapshot error:', error);
    return '[MARKET_DATA_ERROR]';
  }
};

// Функция для поиска в интернете через backend API (обход CORS)
const searchWeb = async (query: string): Promise<string> => {
  // Автоматически добавляем год к запросам, если это актуальные данные
  let enhancedQuery = query;
  const lowerQuery = query.toLowerCase();

  // Добавляем 2025 год ТОЛЬКО для действительно актуальных данных
  // Исключаем классическую литературу, исторические произведения и вечные темы
  const isLiteraryOrHistorical = lowerQuery.includes('война и мир') || lowerQuery.includes('толстой') ||
                                lowerQuery.includes('литература') || lowerQuery.includes('классика') ||
                                lowerQuery.includes('роман') || lowerQuery.includes('поэзия') ||
                                lowerQuery.includes('проза') || lowerQuery.includes('драма') ||
                                lowerQuery.includes('трагедия') || lowerQuery.includes('эпос') ||
                                lowerQuery.includes('легенда') || lowerQuery.includes('миф') ||
                                lowerQuery.includes('сказка') || lowerQuery.includes('былина') ||
                                lowerQuery.includes('история литературы') || lowerQuery.includes('анализ текста');

  const needsYear = !isLiteraryOrHistorical && (
    lowerQuery.includes('рынок') || lowerQuery.includes('статистика') ||
    lowerQuery.includes('тренд') || lowerQuery.includes('анализ') ||
    lowerQuery.includes('данные') || lowerQuery.includes('отчет') ||
    lowerQuery.includes('исследование') || lowerQuery.includes('прогноз') ||
    lowerQuery.includes('бизнес') || lowerQuery.includes('финанс') ||
    lowerQuery.includes('экономик') || lowerQuery.includes('рост') ||
    lowerQuery.includes('развитие') || lowerQuery.includes('состояние') ||
    lowerQuery.includes('актуальн') || lowerQuery.includes('современн') ||
    lowerQuery.includes('текущ') || lowerQuery.includes('сегодня') ||
    lowerQuery.includes('сейчас') || lowerQuery.includes('последн')
  );

  if (needsYear && !/\b(202\d|201\d|200\d)\b/.test(query)) {
    enhancedQuery = `${query} 2025 год`;
    console.log('Enhanced search query with 2025 year:', enhancedQuery);
  }

  try {
    // Сначала пробуем Tavily MCP сервер для более качественного поиска
    try {
      console.log('🔍 Trying Tavily MCP search for:', enhancedQuery);
      console.log('🔍 Fetch URL:', '/api/mcp/search');
      const mcpResponse = await fetch('/api/mcp/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        body: JSON.stringify({
          q: enhancedQuery,
          max_results: 5
        })
      });
      console.log('🔍 MCP response status:', mcpResponse.status);

      if (mcpResponse.ok) {
        const mcpData = await mcpResponse.json();
        console.log('🔍 MCP search successful, results:', mcpData.results ? mcpData.results.length : 0);

        if (mcpData.results && mcpData.results.length > 0) {
          // Форматируем результаты MCP для совместимости и ограничиваем размер
          const maxResultLength = 800; // Максимум 800 символов на результат
          const formattedResults = mcpData.results.slice(0, 5).map((result: any) => { // Максимум 5 результатов
            const truncatedContent = result.content && result.content.length > maxResultLength
              ? result.content.substring(0, maxResultLength) + '...'
              : result.content;
            return `${result.title}\n${truncatedContent}`;
          }).join('\n\n');
          console.log('🔍 Using MCP results, length:', formattedResults.length, 'results count:', mcpData.results.slice(0, 5).length);
          return formattedResults;
        } else {
          console.log('🔍 MCP search returned no results');
        }
      } else {
        const errorText = await mcpResponse.text();
        console.log('🔍 MCP search failed with status:', mcpResponse.status, 'error:', errorText);
      }
    } catch (mcpError) {
      console.log('🔍 MCP search not available, error:', mcpError.message, mcpError);
    }

    // MCP не сработал, используем основной backend endpoint для поиска
    console.log('Using fallback web-search for:', enhancedQuery);
    const searchResponse = await fetch(`${API_BASE_URL}/web-search?q=${encodeURIComponent(enhancedQuery)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('Backend search API error:', searchResponse.status, searchResponse.statusText);
      // Fallback к старому методу если backend недоступен
      return await searchWebFallback(query);
    }

    const searchData = await searchResponse.json();
    console.log('Backend search results for:', query, searchData);

    return searchData.results || '[NO_RESULTS_FOUND]';

  } catch (error) {
    console.error('Backend search error:', error);
    // Fallback к старому методу при ошибке
    return await searchWebFallback(query);
  }
};

// Fallback функция для поиска (старый метод для случаев когда backend недоступен)
const searchWebFallback = async (query: string): Promise<string> => {
  try {
    const encodedQuery = encodeURIComponent(query);
    const lowerQuery = query.toLowerCase();

    let searchResults = '';

    // 1. Специальная обработка для запросов о курсах криптовалют
    // Нормализуем запрос для распознавания разных вариантов написания
    const normalizedQuery = lowerQuery.replace(/биткойн/gi, 'биткоин');
    if (normalizedQuery.includes('курс') && (normalizedQuery.includes('биткоин') || normalizedQuery.includes('крипто') || normalizedQuery.includes('bitcoin') || normalizedQuery.includes('ethereum'))) {
      try {
        const cryptoIds = [];
        if (normalizedQuery.includes('биткоин') || normalizedQuery.includes('bitcoin') || lowerQuery.includes('btc')) cryptoIds.push('bitcoin');
        if (normalizedQuery.includes('ethereum') || normalizedQuery.includes('эфир') || lowerQuery.includes('eth')) cryptoIds.push('ethereum');
        
        // Если запрос содержит "курс" и не указана конкретная криптовалюта, добавляем биткоин по умолчанию
        if (cryptoIds.length === 0 && normalizedQuery.includes('курс') && (normalizedQuery.includes('крипто') || normalizedQuery.includes('криптовалют'))) {
          cryptoIds.push('bitcoin');
        }

        if (cryptoIds.length > 0) {
          const cryptoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd,rub,eur`);
          if (cryptoResponse.ok) {
            const cryptoData = await cryptoResponse.json();
            searchResults += `Курсы криптовалют:\n`;
            if (cryptoData.bitcoin) {
              searchResults += `Bitcoin:\n`;
              searchResults += `- USD: $${cryptoData.bitcoin.usd}\n`;
              searchResults += `- RUB: ₽${cryptoData.bitcoin.rub}\n`;
              searchResults += `- EUR: €${cryptoData.bitcoin.eur}\n\n`;
            }
            if (cryptoData.ethereum) {
              searchResults += `Ethereum:\n`;
              searchResults += `- USD: $${cryptoData.ethereum.usd}\n`;
              searchResults += `- RUB: ₽${cryptoData.ethereum.rub}\n`;
              searchResults += `- EUR: €${cryptoData.ethereum.eur}\n\n`;
            }
          }
        }
      } catch (cryptoError) {
        console.error('Crypto API error:', cryptoError);
      }
    }

    // 2. Поиск новостей и актуальной информации
    if (lowerQuery.includes('новост') || lowerQuery.includes('событи') || lowerQuery.includes('происшеств')) {
      try {
        const newsResponse = await fetch(`https://newsapi.org/v2/everything?q=${encodedQuery}&language=ru&sortBy=publishedAt&pageSize=3&apiKey=demo`);
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          if (newsData.articles && newsData.articles.length > 0) {
            searchResults += `Последние новости:\n`;
            newsData.articles.forEach((article: any, index: number) => {
              searchResults += `${index + 1}. ${article.title}\n`;
              searchResults += `   ${article.description || 'Описание недоступно'}\n`;
              searchResults += `   Источник: ${article.source.name}\n\n`;
            });
          }
        }
      } catch (newsError) {
        console.error('News API error:', newsError);
      }
    }

    // Пробуем разные вариации запроса
    const queryVariations = [
      query, // оригинальный запрос
      query.replace('микро', 'micro'), // заменяем "микро" на "micro"
      query.replace(/что такое\s+/i, ''), // убираем "что такое"
      query.replace(/что\s+такое\s+/i, ''), // убираем "что такое"
    ].filter((q, index, arr) => arr.indexOf(q) === index); // убираем дубликаты

    for (const searchQuery of queryVariations) {
      if (searchResults) break; // Если уже нашли результаты, не ищем дальше

      const variationEncoded = encodeURIComponent(searchQuery);

      // Пробуем DuckDuckGo Instant Answer
      const ddgoResponse = await fetch(`https://api.duckduckgo.com/?q=${variationEncoded}&format=json&no_html=1&skip_disambig=1`);

      if (ddgoResponse.ok) {
        const data = await ddgoResponse.json();
        console.log(`DuckDuckGo Instant Answer results for "${searchQuery}":`, data);

        // Answer (прямой ответ)
        if (data.Answer) {
          searchResults += `Ответ: ${data.Answer}\n\n`;
        }

        // AbstractText (краткое описание)
        if (data.AbstractText) {
          searchResults += `Описание: ${data.AbstractText}\n\n`;
        }

        // Definition (определение)
        if (data.Definition) {
          searchResults += `Определение: ${data.Definition}\n\n`;
        }

        // AbstractURL (ссылка на источник)
        if (data.AbstractURL) {
          searchResults += `Источник: ${data.AbstractURL}\n\n`;
        }

        // Heading (заголовок)
        if (data.Heading) {
          searchResults += `Тема: ${data.Heading}\n\n`;
        }
      }

      // Если все еще нет результатов, пробуем обычный DuckDuckGo поиск
      if (!searchResults) {
        const searchResponse = await fetch(`https://api.duckduckgo.com/?q=${variationEncoded}&format=json`);
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          console.log(`DuckDuckGo general search results for "${searchQuery}":`, searchData);

          if (searchData.Answer) {
            searchResults += `Ответ: ${searchData.Answer}\n\n`;
          }

          if (searchData.AbstractText) {
            searchResults += `Информация: ${searchData.AbstractText}\n\n`;
          }

          if (searchData.Definition) {
            searchResults += `Определение: ${searchData.Definition}\n\n`;
          }

          if (searchData.Heading) {
            searchResults += `Тема: ${searchData.Heading}\n\n`;
          }

          // RelatedTopics - связанные темы
          if (searchData.RelatedTopics && Array.isArray(searchData.RelatedTopics)) {
            const topics = searchData.RelatedTopics.slice(0, 3);
            if (topics.length > 0) {
              searchResults += 'Связанная информация:\n';
              topics.forEach((topic: any, index: number) => {
                if (topic.Text && topic.Text.length > 10) { // Фильтруем слишком короткие результаты
                  searchResults += `${index + 1}. ${topic.Text}\n`;
                }
              });
              searchResults += '\n';
            }
          }
        }
      }
    }

    // 4. Поиск в Wikipedia (русский и английский)
    if (!searchResults) {
      try {
        const wikiQuery = query.replace(/\s+/g, '_');

        // Пробуем русский вариант сначала
        let wikiResponse = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`);

        // Если русский не найден, пробуем английский
        if (!wikiResponse.ok) {
          wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiQuery}`);
        }

        if (wikiResponse.ok) {
          const wikiData = await wikiResponse.json();
          console.log('Wikipedia search results for:', query, wikiData);

          if (wikiData.extract) {
            searchResults += `Из Wikipedia: ${wikiData.extract}\n\n`;
            if (wikiData.description) {
              searchResults += `Описание: ${wikiData.description}\n\n`;
            }
          }
        }
      } catch (wikiError) {
        console.error('Wikipedia search error:', wikiError);
      }
    }

    // 5. Поиск определений через словари
    if (!searchResults && (lowerQuery.includes('что такое') || lowerQuery.includes('определение'))) {
      try {
        // Пробуем Glosbe API для определений
        const term = query.replace(/что такое\s+/i, '').replace(/определение\s+/i, '').trim();
        const glosbeResponse = await fetch(`https://glosbe.com/gapi/translate?from=ru&dest=en&format=json&phrase=${encodeURIComponent(term)}`);

        if (glosbeResponse.ok) {
          const glosbeData = await glosbeResponse.json();
          console.log('Glosbe dictionary results for:', term, glosbeData);

          if (glosbeData.tuc && glosbeData.tuc.length > 0) {
            searchResults += `Определения и переводы:\n`;
            glosbeData.tuc.slice(0, 3).forEach((entry: any, index: number) => {
              if (entry.meanings && entry.meanings.length > 0) {
                entry.meanings.slice(0, 2).forEach((meaning: any) => {
                  if (meaning.text) {
                    searchResults += `${index + 1}. ${meaning.text}\n`;
                  }
                });
              }
            });
            searchResults += '\n';
          }
        }
      } catch (dictError) {
        console.error('Dictionary search error:', dictError);
      }
    }

    // 6. Дополнительные источники (Stack Exchange для технических вопросов)
    if (!searchResults) {
      try {
        // Для технических вопросов пробуем Stack Exchange API
        if (lowerQuery.includes('как') || lowerQuery.includes('почему') || lowerQuery.includes('ошибк') || lowerQuery.includes('программировани')) {
          const stackResponse = await fetch(`https://api.stackexchange.com/2.3/search?order=desc&sort=relevance&tagged=javascript&intitle=${encodedQuery}&site=stackoverflow`);

          if (stackResponse.ok) {
            const stackData = await stackResponse.json();
            console.log('Stack Overflow search results for:', query, stackData);

            if (stackData.items && stackData.items.length > 0) {
              searchResults += `Из Stack Overflow:\n`;
              stackData.items.slice(0, 2).forEach((item: any, index: number) => {
                if (item.title) {
                  searchResults += `${index + 1}. ${item.title}\n`;
                  if (item.tags && item.tags.length > 0) {
                    searchResults += `   Теги: ${item.tags.slice(0, 3).join(', ')}\n`;
                  }
                  searchResults += `   Ссылка: https://stackoverflow.com/questions/${item.question_id}\n\n`;
                }
              });
            }
          }
        }
      } catch (stackError) {
        console.error('Stack Exchange search error:', stackError);
      }
    }


    // Если результатов нет, возвращаем специальный маркер
    const finalResult = searchResults || '[NO_RESULTS_FOUND]';

    console.log('Final search result:', finalResult);
    return finalResult;
  } catch (error) {
    console.error('Web search error:', error);
    return `Не удалось выполнить поиск в интернете из-за технической ошибки: ${error}. Использую доступные знания AI.`;
  }
};

// Функция выполнения параллельного поиска по всем запросам из плана
const executeParallelSearches = async (
  plan: PlanStep[],
  onSearchProgress?: (queries: string[]) => void
): Promise<Map<string, string>> => {
  const searchResults = new Map<string, string>();
  const allQueries: Array<{ query: string; purpose: string }> = [];

  // Собираем все поисковые запросы из плана
  plan.forEach((step, stepIndex) => {
    if (step.searchQueries && step.searchQueries.length > 0) {
      // Сортируем по приоритету (high → medium → low)
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      const sortedQueries = [...step.searchQueries].sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
      );

      sortedQueries.forEach((sq) => {
        allQueries.push({
          query: sq.query,
          purpose: `[Шаг ${stepIndex + 1}: ${step.step}] ${sq.purpose}`
        });
      });

      // Обновляем прогресс - показываем текущие активные запросы
      if (onSearchProgress && allQueries.length > 0) {
        const activeQueries = allQueries.map(item => item.query);
        onSearchProgress(activeQueries);
      }
    }
  });

  // Выполняем поиски параллельно (но ограничиваем одновременные запросы)
  const maxConcurrent = 3;
  for (let i = 0; i < allQueries.length; i += maxConcurrent) {
    const batch = allQueries.slice(i, i + maxConcurrent);
    const promises = batch.map(async (item) => {
      try {
        const result = await searchWeb(item.query);
        searchResults.set(`${item.query}||${item.purpose}`, result);
        console.log(`✓ Поиск выполнен: ${item.query}`);
      } catch (error) {
        console.error(`✗ Ошибка поиска: ${item.query}`, error);
        searchResults.set(`${item.query}||${item.purpose}`, `[Ошибка поиска: ${error}]`);
      }
    });

    await Promise.all(promises);
  }

  return searchResults;
};

// Функция определения необходимости веб-поиска (расширенная логика)
const requiresWebSearch = (query: string): boolean => {
  const lowerQuery = query.toLowerCase();
  console.log('🔍 requiresWebSearch called with query:', query, 'lowerQuery:', lowerQuery);

  // Простые запросы никогда не требуют поиска
  const isVerySimpleQuery = ['привет', 'hi', 'hello', 'здравствуй', 'здравствуйте', 'спасибо', 'благодарю', 'пока', 'до свидания', 'прощай', 'да', 'нет', 'ага', 'угу', 'хорошо', 'плохо', 'нормально', 'ок', 'окей', 'ладно', 'понятно', 'ясно', 'понял', 'хорошо'].some(simple =>
    lowerQuery.trim() === simple ||
    lowerQuery.trim().startsWith(simple + ' ') ||
    lowerQuery.trim().endsWith(' ' + simple) ||
    lowerQuery.trim().includes(' ' + simple + ' ')
  );

  const isTooShort = lowerQuery.trim().length < 3;
  const isOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(lowerQuery.trim());

  if (isVerySimpleQuery || isTooShort || isOnlyEmojis) {
    return false;
  }

  // ВИЗУАЛИЗАЦИИ: всегда требуют поиска актуальных данных
  if (lowerQuery.includes('визуализ') || lowerQuery.includes('покажи график') ||
      lowerQuery.includes('данные для график') || lowerQuery.includes('создать визуализацию')) {
    return true;
  }

  // =========== КЛЮЧЕВЫЕ СЛОВА, ТРЕБУЮЩИЕ ВЕСА ПОИСКА ===========
  
  // 1. АКТУАЛЬНОСТЬ И ВРЕМЯ (требуют свежей информации)
  if (/(сейчас|сегодня|вчера|завтра|текущ|последн|новый|современн|актуальн|свеж|недавн|сегодняшн|новост|событи|происшествие)/i.test(lowerQuery)) {
    console.log('🔍 requiresWebSearch: TRUE for time/actual query');
    return true;
  }

  // 2. ФИНАНСОВЫЕ ДАННЫЕ И ЦЕНЫ
  const financialMatch = /(курс|цена|стоимост|цены|выплат|кредит|ставка|процент|доход|налог|сбор|взнос)/i.test(lowerQuery);
  const cryptoMatch1 = /(биткоин|биткойн|доллар|евро|рубль|криптовалют|крипто|ценная бумага|акция|облигация)/i.test(lowerQuery);
  const cryptoMatch2 = /(биткоин|биткойн)/i.test(lowerQuery);
  const tickerMatch = /\b(btc|eth|bnb|ada|sol|dot|avax|matic|link|uni|usdc|usdt)\b/i.test(lowerQuery);

  console.log('🔍 Financial checks:', { financialMatch, cryptoMatch1, cryptoMatch2, tickerMatch });

  if (financialMatch || cryptoMatch1 || cryptoMatch2 || tickerMatch) {
    console.log('🔍 requiresWebSearch: TRUE for financial/crypto query');
    return true;
  }

  // 3. СТАТИСТИКА, РЕЙТИНГИ, ТОП СПИСКИ
  if (/(рейтинг|топ|лучш|худш|статистик|данные|отчет|анализ|исследован|опрос|результат)/i.test(lowerQuery)) {
    console.log('🔍 requiresWebSearch: TRUE for stats/ratings query');
    return true;
  }

  // 4. НОВОСТИ, СОБЫТИЯ, ПРОИСШЕСТВИЯ
  if (/(новост|событи|происшестви|трагед|катастроф|аварий|авари|сообщ|объявлен|зарегистр)/i.test(lowerQuery)) {
    console.log('🔍 requiresWebSearch: TRUE for news/events query');
    return true;
  }

  // 5. ГЕОГРАФИЧЕСКИЕ, ДЕМОГРАФИЧЕСКИЕ И СОЦИАЛЬНЫЕ ДАННЫЕ
  if (/(население|жител|город|страна|регион|область|район|адрес|место|географи|климат|погод|метеоролог|условия)/i.test(lowerQuery)) {
    console.log('🔍 requiresWebSearch: TRUE for geo/weather query');
    return true;
  }

  // 6. БИЗНЕС, МАРКЕТИНГ, РЫНОК (требуют актуальных данных)
  if (/\b(бизнес|рынок|продаж|продажа|сбыт|конкурент|конкуренция|промышлен|индустри|секторе|компани|корпоратив)\b/i.test(lowerQuery)) {
    return true;
  }

  // 7. СПРОС, ПРЕДЛОЖЕНИЕ, ТРЕНДЫ
  if (/\b(спрос|предложени|тренд|мод|популярн|популярность|спрашиваемость|востребован)\b/i.test(lowerQuery)) {
    return true;
  }

  // 8. ТЕХНОЛОГИИ И ИННОВАЦИИ (часто требуют свежих данных)
  if (/\b(технолог|инновац|гаджет|приложени|платформ|сервис|облако|искусственн|машинн|программн|софт)\b/i.test(lowerQuery)) {
    return true;
  }

  // 9. ЗДОРОВЬЕ И МЕДИЦИНА (требуют актуальной информации)
  if (/\b(болезнь|лечени|препарат|лекарств|вирус|эпидеми|здоров|медицин|доктор|больниц|поликлиник)\b/i.test(lowerQuery)) {
    return true;
  }

  // 10. ОБРАЗОВАНИЕ И КАРЬЕРА (часто изменяется)
  if (/\b(университ|школ|вуз|программ|курс|специальност|карьер|професси|должност|зарплат|работ|вакансия)\b/i.test(lowerQuery)) {
    return true;
  }

  // 11. ТУРИЗМ И ПУТЕШЕСТВИЯ
  if (/\b(туризм|путеш|экскурс|гостинец|отель|пляж|достопримечательност|виза|паспорт|билет|авиалиния|маршрут)\b/i.test(lowerQuery)) {
    return true;
  }

  // 12. ЗАКОН И ПРАВО (часто меняется законодательство)
  if (/\b(закон|право|судь|адвокат|юрист|скоро|штраф|наказани|преступлени|суд|истец|ответчик)\b/i.test(lowerQuery)) {
    return true;
  }

  // 13. СПОРТ И РАЗВЛЕЧЕНИЯ (результаты, рейтинги, расписания)
  if (/\b(спорт|чемпионат|турнир|матч|игра|финал|команд|игрок|тренер|тренировк|результат|расписани)\b/i.test(lowerQuery)) {
    return true;
  }

  // 14. ИНФОРМАЦИОННЫЕ ЗАПРОСЫ (что, кто, где, когда, как)
  if (/^(что|кто|где|когда|как|почему|зачем)\b/i.test(lowerQuery.trim())) {
    return true;
  }

  // 15. ОПРЕДЕЛЕНИЯ И ИНФОРМАЦИЯ О СУЩНОСТЯХ
  if (/\b(определени|означает|есть|является|это|что это|кто это|информация|подробност|описани)\b/i.test(lowerQuery)) {
    return true;
  }

  // Если запрос требует плана (содержит слова "план", "анализ") и это первый запрос - нужен поиск
  if (/\b(план|анализ|исследован|изучи|выясни|узнай|подели информацию)\b/i.test(lowerQuery)) {
    return true;
  }

  // Стандартно включаем поиск для большинства запросов если это не явная творческая задача
  // Отключаем поиск только для явной творческой работы
  const isCreativeOnly = /^(напиши|создай|придумай|сочини|нарисуй|спроектируй|разработай дизайн|напиши историю|напиши код без|создай картинку)\b/i.test(lowerQuery.trim());
  
  if (!isCreativeOnly && lowerQuery.length > 5) {
    // Для большинства других запросов включаем поиск
    return true;
  }

  console.log('🔍 requiresWebSearch result: false for query:', query);
  return false;
};

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SearchQuery {
  query: string;
  priority: 'high' | 'medium' | 'low';
  purpose: string; // Для какого шага нужен поиск
}

export interface PlanStep {
  step: string;
  description: string;
  searchQueries?: SearchQuery[]; // Что нужно найти для этого шага
  completed: boolean;
}

// СПЕЦИАЛЬНАЯ ФУНКЦИЯ ДЛЯ МОДЕЛИ PRO
const handleAdvancedModelLogic = async (
  messages: Message[],
  userMessage: Message,
  selectedModel: string,
  abortSignal?: AbortSignal,
  onChunk?: (chunk: string) => void,
  onPlanGenerated?: (plan: PlanStep[]) => void,
  onStepStart?: (stepIndex: number, step: PlanStep) => void,
  onSearchProgress?: (queries: string[]) => void,
  internetEnabled?: boolean,
  userId?: number,
  sessionId?: number
): Promise<string> => {
  const actualModel = getActualModel(selectedModel);
  // ✅ FIX: modelParams объявляем ДО любых ветвлений
  const modelParams = getModelParams(selectedModel);
  console.log(`🎯 Advanced Logic Start | Selected: ${selectedModel} → DeepSeek: ${actualModel} | Internet: ${internetEnabled} | Query: "${userMessage.content.substring(0, 100)}..." (${userMessage.content.length} chars)`);

  // ПРОВЕРКА НА ПРОСТЫЕ ЗАПРОСЫ - они не должны проходить через планирование
  const lowerQuery = userMessage.content.toLowerCase().trim();
  const originalQuery = userMessage.content.trim();
  
  // Список простых приветствий и фраз
  const isVerySimpleQuery = ['привет', 'hi', 'hello', 'здравствуй', 'здравствуйте', 'спасибо', 'благодарю', 'пока', 'до свидания', 'прощай', 'да', 'нет', 'ага', 'угу', 'хорошо', 'плохо', 'нормально', 'ок', 'окей', 'ладно', 'понятно', 'ясно', 'понял'].some(simple =>
    lowerQuery === simple ||
    lowerQuery.startsWith(simple + ' ') ||
    lowerQuery.endsWith(' ' + simple) ||
    lowerQuery.includes(' ' + simple + ' ')
  );
  
  // Проверка на математические выражения (очень короткие, только цифры и операторы)
  const isMathExpression = /^[\d\s\+\-\*\/\(\)\.\,]+$/.test(originalQuery) && originalQuery.length < 50;
  
  // Очень короткие запросы (меньше 3 символов)
  const isTooShort = lowerQuery.length < 3;
  
  // Только эмодзи
  const isOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(lowerQuery);
  
  // Простые вопросы из одного-двух слов (не требуют планирования)
  const isSimpleOneWordQuestion = lowerQuery.split(/\s+/).length <= 2 && lowerQuery.length < 20;

  if (isVerySimpleQuery || isTooShort || isOnlyEmojis || isMathExpression || isSimpleOneWordQuestion) {
    const reasons = [];
    if (isVerySimpleQuery) reasons.push('very-simple');
    if (isMathExpression) reasons.push('math-expression');
    if (isTooShort) reasons.push('too-short');
    if (isOnlyEmojis) reasons.push('only-emojis');
    if (isSimpleOneWordQuestion) reasons.push('one-word');
    console.log(`🎯 Simple Query Detected | Query: "${originalQuery}" | Reasons: ${reasons.join(', ')} | Returning direct response`);
    
    // Для математических выражений используем обычный режим без простого ответа
    if (isMathExpression) {
      console.log(`📐 Math Expression | Query: "${originalQuery}" | Using standard model without planning`);
      // Используем стандартную модель без планирования
      const actualModel = getActualModel(selectedModel);
      
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          model: actualModel,
          stream: true,
          ...modelParams,
          userId: userId,
          sessionId: sessionId,
        }),
      };

      const isAbortSignal = (v: unknown): v is AbortSignal =>
        !!v &&
        typeof v === "object" &&
        typeof (v as any).aborted === "boolean" &&
        typeof (v as any).addEventListener === "function";

      if (isAbortSignal(abortSignal)) {
        requestOptions.signal = abortSignal;
      } else if (abortSignal != null) {
        console.warn("⚠️ Invalid abortSignal in math expression (ignored):", abortSignal);
      }

      const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      return fullResponse;
    }
    
    const simpleResponse = await getSimpleResponse(userMessage.content);
    
    // Имитируем потоковую передачу
    if (onChunk) {
      for (const char of simpleResponse) {
        onChunk(char);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    return simpleResponse;
  }

  // ШАГ 1: Генерируем план выполнения задачи
  console.log(`📋 Step 1: Plan Generation | Query: "${userMessage.content}" (${userMessage.content.length} chars) | Model: ${selectedModel}`);
  let plan: PlanStep[] = [];
  try {
    plan = await generateResponsePlan(userMessage.content, selectedModel, abortSignal);
    const totalQueries = plan.reduce((sum, step) => sum + (step.searchQueries?.length || 0), 0);
    console.log(`✅ Plan Generated | Steps: ${plan.length} | Total search queries: ${totalQueries}`);

    // Отправляем план в UI
    if (onPlanGenerated) {
      onPlanGenerated(plan);
    }
  } catch (error: any) {
    // Обрабатываем разные типы ошибок
    const isAborted = error.name === 'AbortError' || error.message?.includes('aborted');
    const isGeoBlocked = error.message?.includes('unsupported_country_region_territory') ||
                        error.message?.includes('Country, region, or territory not supported') ||
                        error.message?.includes('403 Forbidden');

    if (isAborted) {
      console.warn(`⚠️ Plan Generation Aborted | Query: "${userMessage.content.substring(0, 80)}..." | Reason: Request aborted (timeout or cancelled) | Continuing without plan`);
      if (onChunk) {
        onChunk("⏱️ Генерация плана заняла слишком много времени. Продолжаю с прямым ответом...\n\n");
      }
    } else if (isGeoBlocked) {
      console.warn(`🌍 Plan Generation Geo-Blocked | Query: "${userMessage.content.substring(0, 80)}..." | Error type: geo-restriction | Falling back to basic mode`);
      if (onChunk) {
        onChunk("🌍 Обнаружено гео-ограничение. Регион не поддерживается для продвинутых функций. Переключаюсь в обычный режим...\n\n");
      }
    } else {
      console.error(`❌ Plan Generation Failed | Query: "${userMessage.content.substring(0, 80)}..." | Error: ${error.message || error} | Type: ${error.name || 'unknown'} | Stack: ${error.stack?.substring(0, 200) || 'none'}...`);
      if (onChunk) {
        onChunk("⚠️ Планирование не удалось, продолжаю с прямым анализом...\n\n");
      }
    }

    // Продолжаем без плана
    plan = [];
  }

  // ШАГ 2: Выполняем поиск в интернете если план требует этого
  let searchResults = '';
  const planHasQueries = plan.some(step => step.searchQueries && step.searchQueries.length > 0);
  if (planHasQueries && internetEnabled !== false) {
    // Собираем все поисковые запросы
    const allSearchQueries = plan.flatMap(step =>
      step.searchQueries ? step.searchQueries.map(sq => ({ query: sq.query, purpose: sq.purpose })) : []
    );

    console.log(`🔍 Step 2: Internet Search | Queries: ${allSearchQueries.length} | Plan steps: ${plan.length} | Internet enabled: ${internetEnabled}`);
    const queriesList = allSearchQueries.map((sq, i) => `${i + 1}. "${sq.query}" (${sq.purpose})`).join(' | ');
    console.log(`📊 Search Queries: ${queriesList}`);

    try {
      if (onSearchProgress) {
        onSearchProgress(allSearchQueries.map(sq => sq.query));
      }

      // Выполняем параллельный поиск
      const allSearchResults = await executeParallelSearches(plan, onSearchProgress);
      const successfulResults = Array.from(allSearchResults.values()).filter(r => r && r !== '[NO_RESULTS_FOUND]').length;
      console.log(`🔍 Search Execution | Total queries: ${allSearchResults.size} | Successful: ${successfulResults} | Failed: ${allSearchResults.size - successfulResults}`);

      // Форматируем результаты поиска по шагам
      let searchContext = '';
      if (allSearchResults.size > 0) {
        searchContext = 'ДАННЫЕ ИЗ ИНТЕРНЕТА:\n\n';

        plan.forEach((step, stepIndex) => {
          if (step.searchQueries && step.searchQueries.length > 0) {
            searchContext += `📌 Шаг ${stepIndex + 1}: ${step.step}\n`;

            step.searchQueries.forEach((sq) => {
              const key = `${sq.query}||[Шаг ${stepIndex + 1}: ${step.step}] ${sq.purpose}`;
              const result = allSearchResults.get(key);

              if (result && result !== '[NO_RESULTS_FOUND]') {
                searchContext += `\n🔹 ${sq.purpose} (${sq.query}):\n${result}\n`;
              }
            });

            searchContext += '\n';
          }
        });

        // Ограничиваем размер результатов поиска
        const maxSearchLength = selectedModel === 'pro' ? 15000 : 8000;
        const originalLength = searchContext.length;
        searchResults = searchContext.length > maxSearchLength
          ? searchContext.substring(0, maxSearchLength) + '\n\n[Результаты поиска сокращены для эффективности]'
          : searchContext;
        
        if (originalLength > maxSearchLength) {
          console.log(`📏 Search Results Truncated | Original: ${originalLength} chars → ${maxSearchLength} chars (limit for ${selectedModel})`);
        }
      }

      console.log(`✅ Search Completed | Results length: ${searchResults.length} chars | Context length: ${searchContext.length} chars`);

      // Уведомляем UI о начале каждого шага
      plan.forEach((step, stepIndex) => {
        if (onStepStart) {
          setTimeout(() => onStepStart(stepIndex, step), stepIndex * 500);
        }
      });

    } catch (searchError) {
      console.error('❌ Error during internet search:', searchError);
      searchResults = '[Ошибка поиска в интернете]';
    }
  } else {
    console.log('🚫 No internet search needed for this query');
  }

  // ШАГ 3: Генерируем финальный ответ
  // actualModel уже объявлен выше

  // Формируем системное сообщение
  let systemPrompt: string;

  // Добавляем market данные для запросов про котировки
  let finalSearchResults = searchResults;
  if (isMarketQuery(userMessage.content)) {
    console.log('📊 Market query detected in advanced mode, adding market snapshot');
    const marketSnapshot = await getMarketSnapshot();
    finalSearchResults = finalSearchResults
      ? `${finalSearchResults}\n\nАКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`
      : `АКТУАЛЬНЫЕ ДАННЫЕ ПО BITCOIN:\n${marketSnapshot}`;
  }

    console.log(`🎯 System Prompt | Plan steps: ${plan.length} | Search results: ${finalSearchResults.length} chars | Model: ${actualModel}`);

  if (plan.length > 0) {
    // Если есть план - используем продвинутый промпт с планом
    systemPrompt = `Ты - WindexsAI, продвинутый ИИ-ассистент. У тебя есть план выполнения задачи и результаты поиска в интернете.

ПЛАН ВЫПОЛНЕНИЯ:
${plan.map((step, idx) => `${idx + 1}. ${step.description}${step.searchQueries ? ` (Поиск: ${step.searchQueries.map(sq => `"${sq.query}"`).join(', ')})` : ''}`).join('\n')}

ВАЖНЫЕ ИНСТРУКЦИИ:
1. ДАЙ МАКСИМАЛЬНО ПОДРОБНЫЙ И ОБЪЕМНЫЙ ОТВЕТ
2. ПОЛНОСТЬЮ ОБЗОРЬ ЗАПРОШЕННУЮ ТЕМУ - охвати все аспекты
3. КАЖДЫЙ ПУНКТ РАСПИСЫВАЙ ПОДРОБНО С ПРИМЕРАМИ И ОБЪЯСНЕНИЯМИ
4. ЕСЛИ ПОЛЬЗОВАТЕЛЬ ОБРАТИЛСЯ С ПРОБЛЕМОЙ - ПРЕДЛОЖИ НЕСКОЛЬКО ВАРИАНТОВ РЕШЕНИЙ С ПОДРОБНЫМ ОПИСАНИЕМ КАЖДОГО
5. ИСПОЛЬЗУЙ ВСЮ ДОСТУПНУЮ ИНФОРМАЦИЮ ИЗ ПОИСКА
6. СТРУКТУРИРУЙ ОТВЕТ С ЗАГОЛОВКАМИ, СПИСКАМИ И ПОДПУНКТАМИ
7. ДАЙ ПРАКТИЧЕСКИЕ СОВЕТЫ И РЕКОМЕНДАЦИИ
8. ВКЛЮЧИ СТАТИСТИКУ, ФАКТЫ И ПРИМЕРЫ ГДЕ ВОЗМОЖНО

На основе этого плана и предоставленной информации из интернета дай МАКСИМАЛЬНО ПОДРОБНЫЙ, ОБЪЕМНЫЙ И ПОЛЕЗНЫЙ ответ на вопрос пользователя.`;
  } else {
    // Если плана нет - используем обычный продвинутый промпт
    systemPrompt = `Ты - WindexsAI, продвинутый ИИ-ассистент. Тебе предоставлена актуальная информация из интернета.

ВАЖНЫЕ ИНСТРУКЦИИ ДЛЯ ОТВЕТОВ:
1. ДАЙ МАКСИМАЛЬНО ПОДРОБНЫЙ И ОБЪЕМНЫЙ ОТВЕТ
2. ПОЛНОСТЬЮ ОБЗОРЬ ЗАПРОШЕННУЮ ТЕМУ - охвати все важные аспекты
3. КАЖДЫЙ ПУНКТ РАСПИСЫВАЙ ПОДРОБНО С ПРИМЕРАМИ И ОБЪЯСНЕНИЯМИ
4. ЕСЛИ ПОЛЬЗОВАТЕЛЬ ОБРАТИЛСЯ С ПРОБЛЕМОЙ - ПРЕДЛОЖИ НЕСКОЛЬКО ВАРИАНТОВ РЕШЕНИЙ С ПОДРОБНЫМ ОПИСАНИЕМ КАЖДОГО
5. ИСПОЛЬЗУЙ ВСЮ ДОСТУПНУЮ ИНФОРМАЦИЮ ИЗ ПОИСКА
6. СТРУКТУРИРУЙ ОТВЕТ С ЗАГОЛОВКАМИ, СПИСКАМИ И ПОДПУНКТАМИ
7. ДАЙ ПРАКТИЧЕСКИЕ СОВЕТЫ И РЕКОМЕНДАЦИИ
8. ВКЛЮЧИ СТАТИСТИКУ, ФАКТЫ И ПРИМЕРЫ ГДЕ ВОЗМОЖНО

Дай полный и максимально подробный ответ на вопрос пользователя.`;
  }

  // Формируем сообщения для финального запроса
  const finalMessages = [
    {
      role: 'system',
      content: systemPrompt
    },
    // Включаем предыдущую историю чата
    ...messages.slice(0, -1),
    // Финальный запрос с результатами поиска
    {
      role: 'user',
      content: finalSearchResults
        ? `${userMessage.content}\n\nИНФОРМАЦИЯ ИЗ ИНТЕРНЕТА:\n${finalSearchResults}`
        : userMessage.content
    }
  ];

  console.log('📤 Final request messages count:', finalMessages.length);
  console.log('🎯 System prompt length:', systemPrompt.length);
  console.log('🔍 Final search results length:', finalSearchResults.length);

  // Отправляем финальный запрос к API
  const requestOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: finalMessages,
      model: actualModel,
      stream: true,
      ...modelParams,
      userId: userId,
      sessionId: sessionId,
    }),
  };

  // Диагностика для отладки
  console.log("🧪 abortSignal typeof:", typeof abortSignal, abortSignal);

  // Валидация AbortSignal
  const isAbortSignal = (v: unknown): v is AbortSignal =>
    !!v &&
    typeof v === "object" &&
    typeof (v as any).aborted === "boolean" &&
    typeof (v as any).addEventListener === "function";

  if (isAbortSignal(abortSignal)) {
    requestOptions.signal = abortSignal;
  } else if (abortSignal != null) {
    console.warn(
      "⚠️ Invalid abortSignal ignored:",
      abortSignal,
      "typeof:",
      typeof abortSignal,
      "ctor:",
      (abortSignal as any)?.constructor?.name,
      "instanceof AbortSignal:",
      typeof AbortSignal !== "undefined" && abortSignal ? (abortSignal as any) instanceof AbortSignal : "n/a"
    );
  }

  const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
  if (onChunk) {
              onChunk(content);
            }
          }
        } catch (e: any) {
          console.error(`❌ SSE Parse Error | Data length: ${data.length} | Error: ${e.message || e}`);
        }
      }
    }
  }

  console.log(`✅ Final Answer Completed | Length: ${fullResponse.length} chars | Model: ${actualModel} | Plan used: ${plan.length > 0 ? 'yes' : 'no'}`);
  return fullResponse;
};

// Функция для обработки простых запросов без поиска
const getSimpleResponse = async (query: string): Promise<string> => {
  const lowerQuery = query.toLowerCase().trim();

  // Простые приветствия
  if (lowerQuery === 'привет' || lowerQuery === 'hi' || lowerQuery === 'hello') {
    return 'Привет! 👋 Я WindexsAI - ваш помощник в решении различных задач. Чем могу помочь сегодня?';
  }

  if (lowerQuery === 'здравствуй' || lowerQuery === 'здравствуйте') {
    return 'Здравствуйте! 👋 Я WindexsAI, готов помочь вам с любыми вопросами и задачами.';
  }

  // Простые ответы
  if (['спасибо', 'благодарю'].includes(lowerQuery)) {
    return 'Пожалуйста! 😊 Если вам понадобится помощь, я всегда здесь.';
  }

  if (['пока', 'до свидания', 'прощай'].includes(lowerQuery)) {
    return 'До свидания! 👋 Возвращайтесь, когда понадобится помощь.';
  }

  if (['да', 'нет', 'ага', 'угу'].includes(lowerQuery)) {
    return 'Понятно! Если у вас есть другие вопросы или задачи, я готов помочь.';
  }

  if (['хорошо', 'плохо', 'нормально', 'ок', 'окей', 'ладно'].includes(lowerQuery)) {
    return 'Отлично! Если вам нужна помощь с чем-то конкретным, просто спросите.';
  }

  if (['понятно', 'ясно', 'понял'].includes(lowerQuery)) {
    return 'Рад, что все понятно! Если возникнут вопросы, обращайтесь. 😉';
  }

  // Для очень коротких сообщений
  if (lowerQuery.length < 3) {
    return 'Привет! 👋 Я WindexsAI. Чем могу вам помочь?';
  }

  // Для эмодзи
  if (/^[\p{Emoji}\s]+$/u.test(lowerQuery)) {
    return '😊 Привет! Я WindexsAI, готов помочь вам с любыми задачами.';
  }

  // Для всех остальных простых запросов
  return 'Привет! 👋 Я WindexsAI - ИИ-помощник для решения различных задач. Что именно вас интересует?';
};

// Функция для определения реальной модели DeepSeek на основе выбранного режима
const getActualModel = (selectedModel: string): string => {
  switch (selectedModel) {
    case 'pro':
      return 'deepseek-reasoner'; // DeepSeek Reasoner для Pro режима
    case 'lite':
    default:
      return 'deepseek-chat'; // DeepSeek Chat для Lite режима
  }
};

// Получить параметры для модели
const getModelParams = (selectedModel: string) => {
  if (selectedModel === 'pro') {
    return {
      max_tokens: 12000, // увеличенное ограничение для DeepSeek Reasoner
      temperature: 0.7  // стандартная креативность
    };
  }
  return {
    max_tokens: 12000, // увеличенное ограничение для DeepSeek Chat
    temperature: 0.7  // стандартная креативность
  };
};

// === Website Artifacts ===

// Интерфейс для артефакта
export interface WebsiteArtifact {
  title: string;
  files: Record<string, string>;
  deps?: Record<string, string>;
}

// Функции для безопасного парсинга JSON из ответа модели
function stripCodeFences(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

/** Находит первый полноценный JSON-объект по балансировке {} с учётом строк и экранирования */
export function extractBalancedJsonObject(raw: string): string | null {
  if (!raw) return null;

  const s = stripCodeFences(raw);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }

  // JSON обрезан/не завершён
  return null;
}

export function safeParseArtifactResponse(raw: string) {
  console.log("🔍 safeParseArtifactResponse called with raw length:", raw.length);

  // 1) Сначала пробуем как есть (иногда content уже чистый JSON)
  try {
    return JSON.parse(stripCodeFences(raw));
  } catch {
    // ignore
  }

  // 2) Затем извлекаем сбалансированный объект
  const jsonText = extractBalancedJsonObject(raw);
  console.log("📝 extractBalancedJsonObject result length:", jsonText?.length ?? null);

  if (!jsonText) {
    throw new Error("Model output does not contain a complete JSON object (likely truncated).");
  }

  try {
    return JSON.parse(jsonText);
  } catch (e: any) {
    throw new Error(`JSON parse failed: ${e?.message ?? e}`);
  }
}

// Функция для определения intent на создание сайта
export const detectWebsiteIntent = (userMessage: string): boolean => {
  const lowerMessage = userMessage.toLowerCase();
  
  const websiteKeywords = [
    // Русские варианты - глаголы в разных формах
    'создай сайт',
    'сделай сайт',
    'сверстай сайт',
    'напиши сайт',
    'разработай сайт',
    'реализуй сайт',
    'собери сайт',
    'сгенерируй сайт',
    'создай веб сайт',
    'сделай веб сайт',
    'сверстай веб сайт',
    'напиши веб сайт',
    'разработай веб сайт',
    'реализуй веб сайт',
    'создай вебсайт',
    'сделай вебсайт',
    'сверстай вебсайт',

    // Лендинги и одностраничники
    'создай лендинг',
    'сделай лендинг',
    'сверстай лендинг',
    'напиши лендинг',
    'разработай лендинг',
    'реализуй лендинг',
    'создай landing page',
    'сделай landing page',
    'сверстай landing page',
    'build landing page',
    'create landing page',

    // Страницы и интерфейсы
    'создай страницу',
    'сделай страницу',
    'сверстай страницу',
    'напиши страницу',
    'создай веб страницу',
    'сделай веб страницу',
    'создай интерфейс',
    'сделай интерфейс',
    'разработай интерфейс',
    'создай ui',
    'сделай ui',

    // Игры и приложения
    'создай игру',
    'сделай игру',
    'напиши игру',
    'разработай игру',
    'реализуй игру',
    'создай приложение',
    'сделай приложение',
    'напиши приложение',
    'разработай приложение',
    'реализуй приложение',
    'создай веб приложение',
    'сделай веб приложение',
    'создай web app',
    'сделай web app',
    'build web app',
    'create web app',

    // Английские варианты
    'website',
    'web site',
    'build a website',
    'create a website',
    'make a website',
    'develop a website',
    'design a website',
    'code a website',
    'build website',
    'create website',
    'make website',
    'develop website',
    'design website',
    'code website',

    // HTML/CSS/JS проекты
    'создай html страницу',
    'сделай html страницу',
    'напиши html',
    'создай css',
    'сделай css',
    'напиши javascript',
    'создай js',
    'сделай js',

    // Специфические типы сайтов
    'создай блог',
    'сделай блог',
    'создай портфолио',
    'сделай портфолио',
    'создай магазин',
    'сделай магазин',
    'создай каталог',
    'сделай каталог',
    'создай витрину',
    'сделай витрину',

    // Команды для ИИ
    'сгенерируй сайт',
    'сгенерируй веб сайт',
    'сгенерируй лендинг',
    'сгенерируй страницу',
    'сгенерируй приложение',
    'сгенерируй игру',
    'generate website',
    'generate web app',
    'generate landing page',

    // Разговорные формы
    'сайт нужен',
    'сайт сделай',
    'сайт создай',
    'сайт сверстай',
    'сайт напиши',
    'нужен сайт',
    'хочу сайт',
    'сделай мне сайт',
    'создай мне сайт',
    'сверстай сайт',
    'напиши сайт',

    // Профессиональные термины
    'frontend',
    'front-end',
    'веб разработка',
    'web development',
    'ui разработка',
    'ux дизайн',
    'прототип сайта',
    'макет сайта'
  ];
  
  return websiteKeywords.some(keyword => lowerMessage.includes(keyword));
};

// Функция для генерации веб-артефакта через DeepSeek
// Системные промпты для генерации артефактов
const systemPromptFull = `
Ты — эксперт-разработчик. Генерируешь небольшой React + TypeScript + Vite проект.

КРИТИЧНО: верни ТОЛЬКО валидный JSON. Никакого markdown. Начни ответ с { и закончи }.

Ограничения размера (обязательно):
- Максимум 4 файла: index.html, main.tsx, App.tsx, index.css
- Никаких дополнительных компонентов/конфигов/пакетных файлов.
- Каждый файл <= 220 строк и <= 7000 символов.
- Никаких многоточий "..." и обрезанных фрагментов. Код должен быть полным.

Tailwind:
- В index.css НЕ генерируй большие CSS-таблицы.
- Разрешено только:
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  + максимум 30 строк своих классов.

Структура ответа строго такая:
{
  "assistantText": "2-3 предложения",
  "artifact": {
    "title": "Название",
    "files": {
      "index.html": "...",
      "main.tsx": "...",
      "App.tsx": "...",
      "index.css": "..."
    },
    "deps": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "tailwindcss": "^3.4.0"
    }
  }
}
`.trim();

const systemPromptCompact = `
Ты — эксперт-разработчик. Генерируешь компактный статический сайт (без React/TS/Vite).

КРИТИЧНО: верни ТОЛЬКО валидный JSON. Никакого markdown. Начни ответ с { и закончи }.

Ограничения:
- Ровно 3 файла: index.html, styles.css, app.js
- Каждый файл <= 180 строк и <= 5000 символов
- Никаких "..." и обрезанных фрагментов

Структура ответа строго такая:
{
  "assistantText": "2-3 предложения",
  "artifact": {
    "title": "Название",
    "files": {
      "index.html": "...",
      "styles.css": "...",
      "app.js": "..."
    },
    "deps": {}
  }
}
`.trim();

// Вспомогательные функции
const isTruncatedJson = (e: unknown) =>
  String((e as any)?.message ?? e).includes("complete JSON object");

async function callArtifactModel(
  userPrompt: string,
  model: string,
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const resp = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        ],
      model: model === "lite" ? "deepseek-chat" : "deepseek-reasoner",
        stream: false,
        response_format: { type: "json_object" },
      max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

  if (!resp.ok) {
    throw new Error(`Artifact API failed: ${resp.status} ${resp.statusText}`);
    }

  const data = await resp.json();

  // Подстройте под ваш формат ответа
  const raw = data?.choices?.[0]?.message?.content ?? data?.content ?? "";
  return raw;
}

export const generateWebsiteArtifact = async (
  userPrompt: string,
  model: string = "deepseek-chat"
): Promise<{ artifact: WebsiteArtifact; assistantText: string }> => {
  try {
    console.log('🎨 STARTING website artifact generation for prompt:', userPrompt);
    console.log('🔧 Using model:', model);

    // 1) Сначала пытаемся с полным React промптом
    console.log('🚀 Attempt 1: Calling with full React prompt');
    const raw1 = await callArtifactModel(userPrompt, model, systemPromptFull, 5500);

    try {
      const parsed = safeParseArtifactResponse(raw1);
      console.log("✅ Full React artifact generated successfully");
      return processArtifact(parsed);
    } catch (e) {
      // 2) Если JSON обрезан — ретрай с компактным промптом
      if (!isTruncatedJson(e)) throw e;

      console.log('⚠️ JSON truncated, retrying with compact prompt');
      const raw2 = await callArtifactModel(userPrompt, model, systemPromptCompact, 3000);
      const parsed2 = safeParseArtifactResponse(raw2);
      console.log("✅ Compact artifact generated successfully");
      return processArtifact(parsed2);
    }
  } catch (error) {
    console.error('❌ Error generating website artifact:', error);
    throw error;
  }
};

// Вспомогательная функция для обработки артефакта
function processArtifact(parsed: any): { artifact: WebsiteArtifact; assistantText: string } {
    if (!parsed.artifact || !parsed.artifact.files) {
      throw new Error('Invalid artifact structure');
    }

    // Определяем тип артефакта по наличию файлов
    const hasReactFiles = parsed.artifact.files['App.tsx'] || parsed.artifact.files['main.tsx'];
    const hasVanillaFiles = parsed.artifact.files['app.js'] || parsed.artifact.files['styles.css'];

    let requiredFiles: string[];
    let requiredFilesWithPaths: string[];

    if (hasReactFiles && !hasVanillaFiles) {
      // React артефакт
      requiredFiles = ['index.html', 'App.tsx', 'main.tsx', 'index.css'];
      requiredFilesWithPaths = ['/index.html', '/src/App.tsx', '/src/main.tsx', '/src/index.css'];
      console.log('🔧 Detected React artifact');
    } else if (hasVanillaFiles && !hasReactFiles) {
      // Vanilla JS артефакт
      requiredFiles = ['index.html', 'app.js', 'styles.css'];
      requiredFilesWithPaths = ['/index.html', '/app.js', '/styles.css'];
      console.log('🔧 Detected vanilla JS artifact');
    } else {
      // Неопределенный тип - предполагаем React
      requiredFiles = ['index.html', 'App.tsx', 'main.tsx', 'index.css'];
      requiredFilesWithPaths = ['/index.html', '/src/App.tsx', '/src/main.tsx', '/src/index.css'];
      console.log('🔧 Unknown artifact type, assuming React');
    }

    // Создаем массив отсутствующих файлов
    const missingFiles: string[] = [];
    requiredFiles.forEach(file => {
      const hasFile = parsed.artifact.files[file] ||
                      parsed.artifact.files[`/src/${file}`] ||
                      parsed.artifact.files[`/${file}`];
      if (!hasFile) {
        missingFiles.push(file);
      }
    });

    if (missingFiles.length > 0) {
      console.log('⚠️ Missing required files, will add defaults:', missingFiles);
    }

    // Исправляем структуру файлов для Vite (перемещаем файлы в правильные папки)
    const correctedFiles: Record<string, string> = {};

    // Проверяем, что parsed имеет правильную структуру
    if (!parsed?.artifact?.files || typeof parsed.artifact.files !== 'object') {
      throw new Error('Invalid artifact structure: missing or invalid files');
    }

    // Корректируем структуру файлов в зависимости от типа артефакта
    Object.entries(parsed.artifact.files).forEach(([filePath, content]) => {
      if (typeof filePath !== 'string' || typeof content !== 'string') {
        console.warn(`Skipping invalid file entry: ${filePath}`);
        return;
      }

      if (hasReactFiles) {
        // Для React артефактов - перемещаем в /src/
      if (filePath === 'main.tsx' || filePath === 'main.jsx') {
        correctedFiles['/src/main.tsx'] = content.replace(/from '\.\/App'/g, "from './App'");
      } else if (filePath === 'App.tsx' || filePath === 'App.jsx') {
        correctedFiles['/src/App.tsx'] = content;
      } else if (filePath === 'index.css' || filePath === 'styles.css') {
        correctedFiles['/src/index.css'] = content;
      } else if (filePath === 'index.html') {
        // Исправляем ссылку на main.tsx в index.html
        const correctedContent = content.replace(
          /src="[^"]*main\.[jt]sx?"/g,
          'src="/src/main.tsx"'
        );
        correctedFiles['/index.html'] = correctedContent;
      } else {
        correctedFiles[filePath.startsWith('/') ? filePath : `/${filePath}`] = content;
        }
      } else {
        // Для vanilla JS артефактов - оставляем в корне
        if (filePath === 'index.html') {
          // Исправляем ссылки на скрипты
          let correctedContent = content;
          correctedContent = correctedContent.replace(/src="[^"]*app\.js"/g, 'src="/app.js"');
          correctedContent = correctedContent.replace(/href="[^"]*styles\.css"/g, 'href="/styles.css"');
          correctedFiles['/index.html'] = correctedContent;
        } else if (filePath === 'app.js') {
          correctedFiles['/app.js'] = content;
        } else if (filePath === 'styles.css') {
          correctedFiles['/styles.css'] = content;
        } else {
          correctedFiles[filePath.startsWith('/') ? filePath : `/${filePath}`] = content;
        }
      }
    });

    // Обновляем файлы в артефакте
    parsed.artifact.files = correctedFiles;

    // Добавляем недостающие файлы с правильными путями
    if (hasReactFiles) {
      // Дефолтные файлы для React артефактов
      if (!correctedFiles['/index.html']) {
        correctedFiles['/index.html'] = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${parsed.artifact.title || 'Сайт'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    }

      if (!correctedFiles['/src/main.tsx']) {
        correctedFiles['/src/main.tsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
    }

      if (!correctedFiles['/src/App.tsx']) {
        correctedFiles['/src/App.tsx'] = `export default function App() {
  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-blue-600 mb-4">
          Сайт создан!
        </h1>
        <p className="text-gray-600">
          Добро пожаловать на новый сайт
        </p>
      </div>
    </div>
  )
}`;
    }

      if (!correctedFiles['/src/index.css']) {
        correctedFiles['/src/index.css'] = `@tailwind base;
@tailwind components;
@tailwind utilities;`;
      }
    } else {
      // Дефолтные файлы для vanilla JS артефактов
      if (!correctedFiles['/index.html']) {
        correctedFiles['/index.html'] = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${parsed.artifact.title || 'Сайт'}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div id="app"></div>
    <script src="/app.js"></script>
  </body>
</html>`;
      }

      if (!correctedFiles['/app.js']) {
        correctedFiles['/app.js'] = `// Простое vanilla JS приложение
document.addEventListener('DOMContentLoaded', function() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = \`
      <div style="min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;">
        <div style="text-align: center; color: white;">
          <h1 style="font-size: 3rem; font-weight: bold; margin-bottom: 1rem;">
            Сайт создан!
          </h1>
          <p style="font-size: 1.25rem;">
            Добро пожаловать на новый сайт
          </p>
        </div>
      </div>
    \`;
  }
});`;
      }

      if (!correctedFiles['/styles.css']) {
        correctedFiles['/styles.css'] = `/* Простые стили */
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#app {
  min-height: 100vh;
}`;
      }
    }

    console.log('✅ Website artifact generated successfully');
    
    return {
      artifact: parsed.artifact,
      assistantText: parsed.assistantText || 'Я создал для вас веб-сайт!'
    };
  }

export const sendChatMessage = async (
  messages: Message[],
  selectedModel: string = "lite",
  onChunk?: (chunk: string) => void,
  onPlanGenerated?: (plan: PlanStep[]) => void,
  onStepStart?: (stepIndex: number, step: PlanStep) => void,
  onSearchProgress?: (queries: string[]) => void,
  internetEnabled?: boolean,
  onTokenCost?: (tokenCost: TokenCost) => void,
  abortSignal?: AbortSignal,
  userId?: number,
  sessionId?: number
): Promise<string> => {
  const userMessage = messages[messages.length - 1];
  const messageSummary = messages.map((msg, i) => `${i}:${msg.role}(${msg.content.length}ch)`).join(', ');
  const actualModel = getActualModel(selectedModel);
  console.log(`🚀 sendChatMessage | Selected: ${selectedModel} → DeepSeek: ${actualModel} | Messages: ${messages.length} | Internet: ${internetEnabled} | Last message: "${userMessage?.content?.substring(0, 80) || 'none'}..." | Summary: [${messageSummary}]`);

  // Диагностика abortSignal
  console.log("🧪 abortSignal:", abortSignal, "typeof:", typeof abortSignal);

  console.log(`🔍 Model Check | Selected: ${selectedModel} | DeepSeek: ${actualModel} | Advanced logic: ${selectedModel === 'pro' || (selectedModel === 'lite' && internetEnabled)}`);

  // СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ ПРОДВИНУТЫХ МОДЕЛЕЙ (Pro или Lite с интернетом)
  if (selectedModel === 'pro' || (selectedModel === 'lite' && internetEnabled)) {
    console.log(`🎯 Advanced Logic | Selected: ${selectedModel} → DeepSeek: ${getActualModel(selectedModel)} | Internet: ${internetEnabled} | User query: "${userMessage?.content?.substring(0, 100) || 'none'}..."`);
    return handleAdvancedModelLogic(messages, userMessage, selectedModel, abortSignal, onChunk, onPlanGenerated, onStepStart, onSearchProgress, internetEnabled, userId, sessionId);
  }
  // Получаем параметры для выбранной модели
  const modelParams = getModelParams(selectedModel);

  // Проверяем, является ли запрос очень простым
  if (userMessage && userMessage.role === 'user') {
    const lowerQuery = userMessage.content.toLowerCase().trim();

    const isVerySimpleQuery = ['привет', 'hi', 'hello', 'здравствуй', 'здравствуйте', 'спасибо', 'благодарю', 'пока', 'до свидания', 'прощай', 'да', 'нет', 'ага', 'угу', 'хорошо', 'плохо', 'нормально', 'ок', 'окей', 'ладно', 'понятно', 'ясно', 'понял', 'хорошо'].some(simple =>
      lowerQuery === simple ||
      lowerQuery.startsWith(simple + ' ') ||
      lowerQuery.endsWith(' ' + simple) ||
      lowerQuery.includes(' ' + simple + ' ')
    );

    const isTooShort = lowerQuery.length < 3;
    const isOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(lowerQuery);

    if (isVerySimpleQuery || isTooShort || isOnlyEmojis) {
      console.log('Simple query detected, returning direct response without search or planning');
      // Возвращаем простой ответ без поиска и планирования
      const simpleResponse = await getSimpleResponse(userMessage.content);

      // Имитируем потоковую передачу для простого ответа
      if (onChunk) {
        // Разбиваем ответ на символы для имитации потоковой передачи
        for (const char of simpleResponse) {
          onChunk(char);
          // Небольшая задержка для имитации потоковой передачи
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      return simpleResponse;
    }
  }

  try {
    // Проверяем доступность API
    console.log('Checking API availability...');
    if (!isApiAvailable()) {
      console.log('API not available');
      return "Извините, сервис AI временно недоступен. Пожалуйста, проверьте настройки API ключа.";
    }
    console.log('API is available');

    const userMessage = messages[messages.length - 1];
    const isFirstResponse = messages.filter(m => m.role === 'assistant').length === 0;

    let fullResponse = '';

    if (isFirstResponse && userMessage.role === 'user') {
      // Проверяем тип запроса
      const lowerQuery = userMessage.content.toLowerCase();
      const isContentCreation = ['напиши', 'создай', 'разработай', 'придумай', 'предложи', 'составь', 'опиши', 'расскажи', 'продолжи'].some(keyword =>
        lowerQuery.includes(keyword)
      );
      console.log('Query analysis - isContentCreation:', isContentCreation, 'query length:', lowerQuery.length);

      let plan: PlanStep[] = [];
      let searchResults = '';

      // Проверяем тип запроса для генерации плана
      const isVerySimpleQuery = ['привет', 'hi', 'hello', 'здравствуй', 'здравствуйте', 'спасибо', 'благодарю', 'пока', 'до свидания', 'прощай', 'да', 'нет', 'ага', 'угу', 'хорошо', 'плохо', 'нормально', 'ок', 'окей', 'ладно', 'понятно', 'ясно', 'понял', 'хорошо'].some(simple =>
        lowerQuery.trim() === simple ||
        lowerQuery.trim().startsWith(simple + ' ') ||
        lowerQuery.trim().endsWith(' ' + simple) ||
        lowerQuery.trim().includes(' ' + simple + ' ')
      );

      // Очень короткие запросы никогда не требуют поиска или планирования
      const isTooShort = lowerQuery.trim().length < 3;
      const isOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(lowerQuery.trim());

      const isSimpleQuery = isVerySimpleQuery || isTooShort || isOnlyEmojis;

      // Генерируем план для комплексных задач и запросов
      const shouldGeneratePlan = !isSimpleQuery && (
        // Все запросы на создание контента требуют планирования
        isContentCreation ||
        // Явные запросы на планирование
        lowerQuery.includes('план') ||
        lowerQuery.includes('разработ') ||
        lowerQuery.includes('созда') ||
        lowerQuery.includes('проект') ||
        lowerQuery.includes('задач') ||
        lowerQuery.includes('шаг') ||
        lowerQuery.includes('анализ') ||
        lowerQuery.includes('исследов') ||
        lowerQuery.includes('подготов') ||
        lowerQuery.includes('организ') ||
        // Многоэтапные инструкции
        (lowerQuery.split(/[.!?]/).length > 1) ||
        // Длинные запросы с множественными действиями
        (lowerQuery.length > 100 && lowerQuery.split(' ').length > 15) ||
        // Запросы с числами и списками
        /\d+\./.test(lowerQuery) || // содержит нумерованные списки
        lowerQuery.includes('во-первых') ||
        lowerQuery.includes('во-вторых') ||
        lowerQuery.includes('затем') ||
        lowerQuery.includes('далее') ||
        lowerQuery.includes('наконец') ||
        // Бизнес и технические запросы
        lowerQuery.includes('бизнес') ||
        lowerQuery.includes('маркетинг') ||
        lowerQuery.includes('финанс') ||
        lowerQuery.includes('программирован') ||
        lowerQuery.includes('дизайн') ||
        lowerQuery.includes('управлен') ||
        // Образовательные запросы
        lowerQuery.includes('объясн') ||
        lowerQuery.includes('научи') ||
        lowerQuery.includes('покажи как')
      );

      console.log('Plan generation decision - shouldGeneratePlan:', shouldGeneratePlan, 'isSimpleQuery:', isSimpleQuery, 'isContentCreation:', isContentCreation);

      if (shouldGeneratePlan) {
        try {
          console.log(`📋 Generating response plan | Query: "${userMessage.content.substring(0, 100)}..." | Selected: ${selectedModel} → Will use DeepSeek Chat`);
          plan = await generateResponsePlan(userMessage.content, selectedModel, abortSignal);
          console.log(`✅ Plan generated successfully | Steps: ${plan.length}`);
        } catch (planError: any) {
          // Проверяем тип ошибки
          if (planError.name === 'AbortError' || planError.message?.includes('aborted')) {
            console.warn(`⚠️ Plan Generation Aborted | Continuing without plan | Error: ${planError.message || 'Request aborted'}`);
          } else {
            console.error(`❌ Plan Generation Failed | Continuing without plan | Error: ${planError.message || planError} | Type: ${planError.name || 'unknown'}`);
          }
          // Продолжаем без плана, если генерация не удалась
          plan = [];
        }
      }

      // Проверяем, требуется ли поиск в интернете
      // Для запросов на визуализацию поиск ВСЕГДА нужен (даже если это content creation)
      const isVisualizationRequest = (
        // Явные запросы на визуализацию
        lowerQuery.includes('визуализ') ||
        lowerQuery.includes('покажи график') ||
        lowerQuery.includes('создай график') ||
        lowerQuery.includes('нарисуй график') ||
        lowerQuery.includes('построй график') ||
        lowerQuery.includes('сделай диаграмм') ||
        // Специфические запросы с данными И графикой
        (lowerQuery.includes('данные') && lowerQuery.includes('график')) ||
        (lowerQuery.includes('статистик') && lowerQuery.includes('график')) ||
        (lowerQuery.includes('числа') && lowerQuery.includes('диаграмм'))
      );

      // Для запросов с планом ВСЕГДА нужен веб-поиск для получения актуальных данных
      const shouldSearchForPlan = shouldGeneratePlan && plan.length > 0;
      
      // Определяем, требует ли запрос актуальной информации из интернета
      // Даже если это запрос на создание контента (напиши, создай), но он касается актуальных данных
      const requiresActualData = ['новост', 'погод', 'курс', 'цена', 'стоимост', 'событи', 
        'происшестви', 'сегодня', 'сейчас', 'актуальн', 'последн', 'текущ', 'свеж',
        'температур', 'weather', 'temperature', 'рейтинг', 'топ', 'статистик', 'данн'].some(
        keyword => lowerQuery.includes(keyword)
      );
      
      // Проверяем необходимость веб-поиска
      const needsWebSearch = requiresWebSearch(userMessage.content) || shouldSearchForPlan || requiresActualData;
      
      console.log('🔍 Web search decision:', {
        isContentCreation,
        requiresActualData,
        needsWebSearch,
        shouldSearchForPlan,
        isVisualizationRequest,
        internetEnabled
      });

      // Выполняем веб-поиск если:
      // 1. Это НЕ создание контента ИЛИ
      // 2. Это визуализация ИЛИ
      // 3. Нужен поиск для плана ИЛИ
      // 4. Требуется актуальная информация (даже для создания контента)
      if ((!isContentCreation || isVisualizationRequest || shouldSearchForPlan || requiresActualData) && internetEnabled !== false && needsWebSearch) {
        try {
          console.log('🌐 Web search required for:', userMessage.content);
          console.log('Query analysis:', {
            hasSearchKeyword: ['актуальн', 'сейчас', 'последн', 'новост', 'сегодня', 'время', 'курс', 'цена', 'стоимост', 'рейтинг', 'топ', 'лучш', 'статистик', 'данн', 'отчет', 'тренд', 'мод', 'популярн', 'событи', 'происшестви', 'изменени', 'обновлени', 'нов', 'текущ', 'свеж', 'последн', 'настоящ'].some(keyword => userMessage.content.toLowerCase().includes(keyword)),
            isComplex: userMessage.content.length > 50 || userMessage.content.split(/\s+/).length > 7 || ['что', 'как', 'почему', 'зачем', 'где', 'когда', 'кто', 'какой', 'какая', 'какие', 'какое'].some(word => userMessage.content.toLowerCase().includes(word)),
            isSimple: isSimpleQuery,
            isContentCreation: isContentCreation,
            requiresActualData: requiresActualData,
            isVisualizationRequest: isVisualizationRequest
          });
          searchResults = await searchWeb(userMessage.content);
          console.log(`✅ Web Search Completed | Results length: ${searchResults.length} chars | Query: "${userMessage.content.substring(0, 80)}..."`);
        } catch (searchError) {
          console.error(`❌ Web Search Error | Query: "${userMessage.content.substring(0, 80)}..." | Error: ${searchError}`);
          searchResults = '[SEARCH_ERROR]'; // Продолжаем без результатов поиска
        }
      } else {
        console.log('🚫 Web search skipped:', {
          reason: !needsWebSearch ? 'not needed' : internetEnabled === false ? 'disabled' : 'blocked by content creation'
        });
      }

      if (onPlanGenerated) {
        onPlanGenerated(plan);
      }

      // Генерируем один структурированный ответ со всеми шагами
      if (plan.length > 0) {
        // НОВОЕ: Выполняем ПАРАЛЛЕЛЬНЫЙ поиск по всем запросам из плана
        let allSearchResults: Map<string, string> = new Map();

        if (plan.some(step => step.searchQueries && step.searchQueries.length > 0) && internetEnabled !== false) {
          console.log('🔍 Начинаем параллельный поиск в интернете...');
          // Собираем все запросы для отображения прогресса
          const allSearchQueries = plan.flatMap(step =>
            step.searchQueries ? step.searchQueries.map(sq => sq.query) : []
          );
          if (onSearchProgress) {
            onSearchProgress(allSearchQueries);
          }
          allSearchResults = await executeParallelSearches(plan, onSearchProgress);
          console.log(`✅ Параллельный поиск завершен: ${allSearchResults.size} результатов`);
          // Очищаем прогресс после завершения
          if (onSearchProgress) {
            onSearchProgress([]);
          }
        }

        // Форматируем результаты поиска по шагам
        let formattedSearchContext = '';
        if (allSearchResults.size > 0) {
          formattedSearchContext = 'ДАННЫЕ ИЗ ИНТЕРНЕТА:\n\n';

          plan.forEach((step, stepIndex) => {
            if (step.searchQueries && step.searchQueries.length > 0) {
              formattedSearchContext += `📌 Шаг ${stepIndex + 1}: ${step.step}\n`;

              step.searchQueries.forEach((sq) => {
                const key = `${sq.query}||[Шаг ${stepIndex + 1}: ${step.step}] ${sq.purpose}`;
                const result = allSearchResults.get(key);

                if (result && result !== '[NO_RESULTS_FOUND]') {
                  formattedSearchContext += `\n🔹 ${sq.purpose} (${sq.query}):\n${result}\n`;
                }
              });

              formattedSearchContext += '\n';
            }
          });

          // Ограничиваем длину контекста поиска (максимум 6000 символов для комплексных запросов)
          const maxComplexSearchLength = 6000;
          if (formattedSearchContext.length > maxComplexSearchLength) {
            formattedSearchContext = formattedSearchContext.substring(0, maxComplexSearchLength) + '\n\n[Результаты поиска усечены для экономии места]';
            console.log(`📏 Complex search results truncated from ${formattedSearchContext.length} to ${maxComplexSearchLength} characters`);
          }
        }

          const systemMessage = messages.find(msg => msg.role === 'system') || {
            role: 'system' as const,
            content: 'Ты полезный AI-ассистент. Каждый чат является полностью независимым и изолированным. Не используй информацию или контекст из других разговоров. Отвечай только на основе предоставленных сообщений в текущем чате.\n\nВАЖНЫЕ ИНСТРУКЦИИ:\n1. ДАВАЙ МАКСИМАЛЬНО ПОДРОБНЫЕ И ОБЪЕМНЫЕ ОТВЕТЫ\n2. ПОЛНОСТЬЮ РАСКРЫВАЙ ЗАПРОШЕННУЮ ТЕМУ\n3. КАЖДЫЙ АСПЕКТ ОБЪЯСНЯЙ ПОДРОБНО С ПРИМЕРАМИ\n4. СТРУКТУРИРУЙ ОТВЕТ С ЗАГОЛОВКАМИ И СПИСКАМИ\n5. ДАВАЙ ПРАКТИЧЕСКИЕ СОВЕТЫ И РЕКОМЕНДАЦИИ\n6. УЧИТЫВАЙ ВСЮ ИСТОРИЮ РАЗГОВОРА'
          };

        // Форматируем план для промпта
        const planDescription = plan.map((step, idx) => 
          `${idx + 1}. **${step.step}**: ${step.description}`
        ).join('\n\n');

        // Используем всю историю сообщений для контекста
        let conversationMessages = messages.filter(msg => msg.role !== 'system'); // Убираем системное сообщение

        const planPrompt = [
            systemMessage,
            // Вся история чата
            ...conversationMessages.slice(0, -1), // Все сообщения кроме последнего
            // Последнее сообщение с планом и данными
            {
              role: 'user' as const,
            content: `${formattedSearchContext}
ПЛАН РЕШЕНИЯ:

${planDescription}

ИНСТРУКЦИИ:
- КРИТИЧНО: ИСПОЛЬЗУЙ ТОЛЬКО ДАННЫЕ ЗА 2024-2025 ГОДЫ! ЗАПРЕЩЕНО УПОМИНАТЬ 2023 ГОД И РАНЬШЕ!
- ИСПОЛЬЗУЙ ДАННЫЕ ИЗ ИНТЕРНЕТА для каждого пункта плана
- ВЫПОЛНИ ВСЮ РАБОТУ САМ - создай один структурированный профессиональный ответ
- Раздели ответ по пунктам плана (используй форматирование Markdown)
- Для каждого пункта:
  * Используй РЕАЛЬНЫЕ ДАННЫЕ из поиска 2024-2025 годов
  * Приводи конкретные цифры, статистику, факты за 2024-2025
  * Делай обоснованные выводы на основе свежих данных
  * Связывай информацию между пунктами
- Стиль: пиши как профессиональный эксперт/консультант
- РЕЗУЛЬТАТ должен быть готов к использованию - не давай советы, приводи выводы
- Структурируй текст списками, подзаголовками, форматированием
- Каждый пункт должен быть ДЕТАЛЬНЫМ и КОНКРЕТНЫМ
- УЧИТЫВАЙ КОНТЕКСТ ПРЕДЫДУЩИХ СООБЩЕНИЙ В ЧАТЕ
- ТЫ ДОЛЖЕН ПОЛНОСТЬЮ ПОНЯТЬ ЗАПРОС И ПРЕДСТАВИТЬ ЕГО В СТРУКТУРИРОВАННОМ ВИДЕ
- ДУМАЙ КАК ТОП 1 АНАЛИТИК В МИРЕ И ЗА ХОРОШУЮ РАБОТУ ТЫ ПОЛУЧИШЬ ЩЕДРЫЕ ЧАЕВЫЕ
- НЕ ЛЕЙ ВОДЫ, ГОВОРИ ПРЯМО И ПОДРОБНО РАСПИСЫВАЙ КАЖДЫЙ ПУНКТ ОТВЕТА. 
- ПРИВОДИ ПРИМЕРЫ И ФАКТЫ.
- ПОСЛЕ ОБЩЕНИЯ С ТОБОЙ ПОЛЬЗОВАТЕЛЬ ДОЛЖЕН ИСПЫТАТЬ ЧУВСТВО ВАУ!

Исходный запрос: "${userMessage.content}"

СОЗДАЙ ПРОФЕССИОНАЛЬНЫЙ СТРУКТУРИРОВАННЫЙ ОТВЕТ НА ОСНОВЕ СОБРАННЫХ ДАННЫХ:`
          }
        ];

        // DeepSeek поддерживает streaming
        const useStreaming = true;

        const requestOptions: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: planPrompt.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            model: actualModel,
            stream: useStreaming,
            ...modelParams,
          }),
        };

        const isAbortSignal = (v: unknown): v is AbortSignal =>
          !!v &&
          typeof v === "object" &&
          typeof (v as any).aborted === "boolean" &&
          typeof (v as any).addEventListener === "function";

        if (isAbortSignal(abortSignal)) {
          requestOptions.signal = abortSignal;
        } else if (abortSignal != null) {
          console.warn("⚠️ Invalid abortSignal in planning (ignored):", abortSignal);
        }

        const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
        }

        if (useStreaming) {
          // Обрабатываем потоковый ответ для моделей, поддерживающих streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices[0]?.delta?.content;
                  if (content) {
                    fullResponse += content;
                    if (onChunk) {
                      onChunk(content);
                    }
                  }
                } catch (e) {
                  // Игнорируем невалидный JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
          }
        } else {
          // Обрабатываем обычный JSON ответ (без streaming)
          const data = await response.json();
          const content = data.choices[0]?.message?.content || '';
          fullResponse = content;

          // Имитируем потоковую передачу для совместимости с UI
          if (onChunk) {
            // Разбиваем ответ на символы для имитации потоковой передачи
            for (const char of content) {
              onChunk(char);
              // Небольшая задержка для имитации потоковой передачи
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }

        // Отмечаем все шаги как завершенные (они уже обработаны в одном ответе)
        plan.forEach((step) => {
          step.completed = true;
        });
      } else {
        console.log('📝 Using simple response path (no plan) for:', userMessage.content);
        // Обычный ответ без плана - проверяем, нужен ли поиск для простых запросов
        let searchResults = '';

        // Явная проверка для запросов, требующих актуальной информации
        const lowerQuery = userMessage.content.toLowerCase();
        const normalizedQuery = lowerQuery.replace(/биткойн/gi, 'биткоин');
        
        // Финансовые запросы
        const isFinancialQuery = /(курс|цена|стоимост|цены)/i.test(normalizedQuery) && 
          (/(биткоин|крипто|криптовалют|bitcoin|ethereum|btc|eth)/i.test(normalizedQuery) || 
           /(доллар|евро|рубль|валюта|exchange|rate)/i.test(normalizedQuery));
        
        // Запросы, требующие актуальных данных (новости, погода, события)
        const requiresActualData = ['новост', 'погод', 'курс', 'цена', 'стоимост', 'событи', 
          'происшестви', 'сегодня', 'сейчас', 'актуальн', 'последн', 'текущ', 'свеж',
          'температур', 'weather', 'temperature', 'рейтинг', 'топ', 'статистик', 'данн'].some(
          keyword => lowerQuery.includes(keyword)
        );

        console.log('🔍 Checking internet search:', {
          internetEnabled,
          isFinancialQuery,
          requiresActualData,
          query: userMessage.content
        });
        
        if (internetEnabled !== false) {
          const needsWebSearch = requiresWebSearch(userMessage.content) || isFinancialQuery || requiresActualData || isMarketQuery(userMessage.content);
          console.log('🔍 Simple query needs web search:', needsWebSearch, 'for:', userMessage.content);

        if (needsWebSearch) {
          try {
            console.log('🌐 Starting web search for simple query:', userMessage.content);
            // Используем обычный веб-поиск для всех запросов, требующих поиска
            // Это обеспечивает правильную работу с криптовалютами и другими данными
            searchResults = await searchWeb(userMessage.content);
            console.log(`✅ Web Search Completed | Results length: ${searchResults.length} chars | Query: "${userMessage.content.substring(0, 80)}..."`);
          } catch (searchError) {
            console.error(`❌ Web Search Error | Query: "${userMessage.content.substring(0, 80)}..." | Error: ${searchError}`);
            searchResults = '[SEARCH_ERROR]';
          }
        } else {
          console.log('🚫 Simple query does not need web search');
        }
        } else {
          console.log('🚫 Internet search disabled');
        }

        // Ограничиваем длину результатов поиска (максимум 4000 символов для избежания 413 ошибки)
        const maxSearchLength = 4000;
        let truncatedSearchResults = searchResults;
        if (searchResults && searchResults.length > maxSearchLength) {
          truncatedSearchResults = searchResults.substring(0, maxSearchLength) + '\n\n[Результаты поиска усечены для экономии места]';
          console.log(`📏 Search results truncated from ${searchResults.length} to ${truncatedSearchResults.length} characters`);
        }

        let searchContext = truncatedSearchResults && truncatedSearchResults !== '[NO_RESULTS_FOUND]' && !truncatedSearchResults.includes('технической ошибки') && !truncatedSearchResults.includes('[SEARCH_ERROR]')
          ? `Результаты поиска в интернете:\n${truncatedSearchResults}\n\n`
          : '';

        // Добавляем market данные для запросов про котировки (всегда, независимо от поиска)
        if (isMarketQuery(userMessage.content)) {
          console.log('📊 Market query detected, adding market snapshot to context');
          try {
            const marketSnapshot = await getMarketSnapshot();
            searchContext += `Актуальные данные по Bitcoin:\n${marketSnapshot}\n\n`;
          } catch (error) {
            console.error('❌ Failed to get market snapshot:', error);
            searchContext += `Ошибка получения данных по Bitcoin: ${error.message}\n\n`;
          }
        }

        console.log('Simple query - searchContext:', searchContext ? 'HAS_CONTEXT' : 'NO_CONTEXT');
        console.log('Simple query - searchResults:', searchResults);
        console.log('Simple query - searchContext length:', searchContext.length);

        // Всегда используем всю историю сообщений для поддержания контекста
        const systemMessage = messages.find(msg => msg.role === 'system');
        let conversationMessages = messages.filter(msg => msg.role !== 'system'); // Убираем системное сообщение из истории

        console.log('🔄 Simple query context:');
        console.log('  - System message found:', !!systemMessage);
        console.log('  - Conversation messages count:', conversationMessages.length);
        console.log('  - Conversation messages:', conversationMessages.map((msg, i) => `${i}: ${msg.role} - ${msg.content.substring(0, 50)}...`));

        const enhancedMessages = searchContext ? [
          // Системное сообщение
          systemMessage || { role: 'system' as const, content: 'Ты полезный AI-ассистент. Используй предоставленную информацию из поиска для ответа на вопросы пользователя. Учитывай контекст предыдущих сообщений в чате.\n\nИНСТРУКЦИИ ДЛЯ ПОДРОБНЫХ ОТВЕТОВ:\n• ДАВАЙ МАКСИМАЛЬНО ПОДРОБНЫЕ ОТВЕТЫ\n• ПОЛНОСТЬЮ АНАЛИЗИРУЙ ВСЮ ИНФОРМАЦИЮ ИЗ ПОИСКА\n• КАЖДЫЙ ФАКТ И АСПЕКТ ОБЪЯСНЯЙ ПОДРОБНО\n• СТРУКТУРИРУЙ ОТВЕТ ЛОГИЧНО С ЗАГОЛОВКАМИ\n• ПРИВОДИ СТАТИСТИКУ И ПРИМЕРЫ ИЗ ПОИСКА\n• ДАВАЙ ПРАКТИЧЕСКИЕ ВЫВОДЫ И РЕКОМЕНДАЦИИ' },
          // Вся история чата
          ...conversationMessages.slice(0, -1), // Все сообщения кроме последнего
          // Последнее сообщение с контекстом поиска
          {
            role: 'user' as const,
            content: `Информация из интернета: ${searchContext}\n\nВопрос: ${userMessage.content}`
          }
        ] : [
          // Системное сообщение
          systemMessage || {
            role: 'system' as const,
            content: 'Ты полезный AI-ассистент. Каждый чат является полностью независимым и изолированным. Не используй информацию или контекст из других разговоров. Отвечай только на основе предоставленных сообщений в текущем чате.\n\nИНСТРУКЦИИ ДЛЯ КАЧЕСТВЕННЫХ ОТВЕТОВ:\n• СТРЕМИСЬ К МАКСИМАЛЬНОЙ ПОДРОБНОСТИ И ОБЪЕМНОСТИ\n• ПОЛНОСТЬЮ РАСКРЫВАЙ ТЕМУ ЗАПРОСА\n• КАЖДЫЙ АСПЕКТ ОБЪЯСНЯЙ С ПРИМЕРАМИ\n• СТРУКТУРИРУЙ ОТВЕТ ЛОГИЧНО\n• ДАВАЙ ПРАКТИЧЕСКИЕ СОВЕТЫ\n• ИСПОЛЬЗУЙ ВСЮ ИСТОРИЮ ЧАТА ДЛЯ КОНТЕКСТА'
          },
          // Вся история чата
          ...conversationMessages
        ];

        console.log('Making fetch request to:', `${API_BASE_URL}/chat`);
        console.log('Request payload:', {
          messagesCount: enhancedMessages.length,
          model: actualModel,
          stream: true
        });
        console.log('Messages being sent to API:', enhancedMessages.map(msg => ({
          role: msg.role,
          content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
        })));

        // DeepSeek поддерживает streaming
        const useStreaming = true;

        // Получаем параметры для выбранной модели (нужно здесь, так как actualModel определена выше)
        // ВАЖНО: modelParams должен существовать всегда — иначе при fallback/timeout планера будет ReferenceError
        const modelParams = getModelParams(selectedModel) ?? { max_tokens: 4000, temperature: 0.7 };

        const requestOptions: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: enhancedMessages.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            model: actualModel,
            stream: useStreaming,
            userId: userId || 1,
            sessionId: sessionId,
            ...modelParams,
          }),
        };

        const isAbortSignal = (v: unknown): v is AbortSignal =>
          !!v &&
          typeof v === "object" &&
          typeof (v as any).aborted === "boolean" &&
          typeof (v as any).addEventListener === "function";

        if (isAbortSignal(abortSignal)) {
          requestOptions.signal = abortSignal;
        } else if (abortSignal != null) {
          console.warn("⚠️ Invalid abortSignal in search (ignored):", abortSignal);
        }

        const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

        console.log('Fetch response status:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
        }

        if (useStreaming) {
          // Обрабатываем потоковый ответ
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullResponse += content;
                    if (onChunk) {
                      onChunk(content);
                    }
                  }

                  // Проверяем наличие информации о токенах
                  if (parsed.usage && onTokenCost) {
                    const tokenCost = calculateTokenCost(parsed.usage, actualModel);
                    onTokenCost(tokenCost);
                  }

                  // Также проверяем tokenCost от нашего сервера (для обычных ответов)
                  if (parsed.tokenCost && onTokenCost) {
                    onTokenCost(parsed.tokenCost);
                  }
                } catch (e) {
                  // Игнорируем невалидный JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        } else {
          // Обрабатываем обычный JSON ответ (без streaming)
          const data = await response.json();
          const content = data.choices[0]?.message?.content || '';
          fullResponse = content;

          // Имитируем потоковую передачу для совместимости с UI
          if (onChunk) {
            for (const char of content) {
              onChunk(char);
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }

      }
    } else {
      // Обычный ответ без плана (для последующих сообщений)
      // Обработка для моделей без поддержки streaming
      const useStreaming = true; // DeepSeek supports streaming

      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
          body: JSON.stringify({
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            model: actualModel,
            stream: useStreaming,
            ...modelParams,
            userId: userId,
            sessionId: sessionId,
          }),
        };

        const isAbortSignal = (v: unknown): v is AbortSignal =>
          !!v &&
          typeof v === "object" &&
          typeof (v as any).aborted === "boolean" &&
          typeof (v as any).addEventListener === "function";

        if (isAbortSignal(abortSignal)) {
          requestOptions.signal = abortSignal;
        } else if (abortSignal != null) {
          console.warn("⚠️ Invalid abortSignal in final response (ignored):", abortSignal);
        }

      const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      if (useStreaming) {
        // Обрабатываем потоковый ответ
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  if (onChunk) {
                    onChunk(content);
                  }
                }
              } catch (e) {
                // Игнорируем невалидный JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        }
      } else {
        // Обрабатываем обычный JSON ответ для GPT-5.1
        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';
        fullResponse = content;

        // Имитируем потоковую передачу для совместимости с UI
        if (onChunk) {
          for (const char of content) {
            onChunk(char);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    }

    return fullResponse;
  } catch (error) {
    console.error('DeepSeek API error:', error);
    throw error;
  }
};

// Генерация плана ответа
const generateResponsePlan = async (userQuestion: string, selectedModel: string, abortSignal?: AbortSignal): Promise<PlanStep[]> => {
  console.log(`📋 Plan Generation | Question: "${userQuestion}" (${userQuestion.length} chars) | Selected: ${selectedModel} → Will use DeepSeek Chat`);

  // ✅ Ранний return для простых вопросов - избегаем 60s таймаут и лишний сетевой вызов
  const q = userQuestion.trim().toLowerCase();
  const simple =
    userQuestion.trim().length <= 80 &&
    !q.includes('план') &&
    !q.includes('анализ') &&
    !q.includes('сравн') &&
    !q.includes('стратег');

  if (simple) {
    console.log('🟢 Plan Generation Skipped | Simple query detected, returning empty plan');
    return [];
  }

  // Проверяем доступность API
  if (!isApiAvailable()) {
    console.log('❌ Plan Generation Failed | API not available, returning empty plan');
    return []; // Возвращаем пустой план при недоступности API
  }

  // Для генерации плана всегда используем deepseek-chat с консервативными параметрами
  const actualModel = 'deepseek-chat';
  const modelParams = { max_tokens: 1200, temperature: 0.2 };
  console.log(`🔧 Plan Generation Config | Model: ${actualModel} | Max tokens: ${modelParams.max_tokens} | Temperature: ${modelParams.temperature} | Note: Conservative settings for planning accuracy`);

  const planPrompt = `
СОЗДАЙ ПОДРОБНЫЙ ПЛАН С УКАЗАНИЕМ ПОИСКОВЫХ ЗАПРОСОВ ДЛЯ ИНТЕРНЕТА

ВАЖНО: СЕЙЧАС 2025 ГОД! Используй актуальные данные где это имеет смысл.
Для литературных произведений, классики и исторических тем НЕ добавляй год - эти знания вечны.
Добавляй год ТОЛЬКО для актуальных данных: рынок, статистика, тренды, бизнес, финансы, технологии.

ЗАПРОС ПОЛЬЗОВАТЕЛЯ: "${userQuestion}"

ИНСТРУКЦИИ ПО СОЗДАНИЮ ПЛАНА:
1. РАЗБЕРИСЬ ЧТО НУЖНО ПОЛЬЗОВАТЕЛЮ
2. РАЗДЕЛИ НА 3-5 ОСНОВНЫХ ШАГОВ
3. ДЛЯ КАЖДОГО ШАГА ДОБАВЬ 2-3 ПОИСКОВЫХ ЗАПРОСА

ПРАВИЛА:
- Шаги в логической последовательности
- Поисковые запросы заканчиваются на "2025" или "2025 год"
- Используй конкретные запросы для получения актуальной информации

ФОРМАТ ОТВЕТА - ТОЛЬКО JSON:
[
  {
    "step": "Анализ рынка",
    "description": "Исследовать текущее состояние рынка с актуальными данными",
    "searchQueries": [
      {
        "query": "рынок кофеен в России 2025 год статистика",
        "priority": "high",
        "purpose": "Размер и динамика рынка 2025"
      },
      {
        "query": "конкуренты кофеен Москва 2025 анализ",
        "priority": "high",
        "purpose": "Анализ конкурентов 2025"
      },
      {
        "query": "тренды кофейного рынка 2025 год",
        "priority": "medium",
        "purpose": "Текущие тренды 2025"
      }
    ],
    "completed": false
  },
  {
    "step": "Финансовое планирование",
    "description": "Составить финансовый прогноз на основе актуальных данных",
    "searchQueries": [
      {
        "query": "средняя прибыль кофейни 2025 год",
        "priority": "high",
        "purpose": "Финансовые показатели"
      }
    ],
    "completed": false
  }
]
`;

  console.log(`🚀 Plan Generation Request | Model: ${actualModel} | Prompt length: ${planPrompt.length} chars | Stream: false`);

  // Создаем AbortController для комбинации внешнего сигнала и таймаута
  const controller = new AbortController();
  const timeoutMs = 60000; // 60 секунд таймаут

  // Если внешний сигнал уже aborted, завершаем сразу
  if (abortSignal?.aborted) {
    throw new Error('Operation was aborted');
  }

  // Добавляем обработчик для внешнего abort сигнала
  const abortHandler = () => controller.abort();
  abortSignal?.addEventListener('abort', abortHandler);

  const timeoutId = setTimeout(() => {
    console.warn(`⏱️ Plan Generation Timeout | Model: ${actualModel} | Timeout: ${timeoutMs}ms exceeded`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Ты - помощник, который создает планы ответов. Всегда отвечай только в формате JSON.' },
          { role: 'user', content: planPrompt }
        ],
        model: actualModel,
        stream: false,
        max_tokens: modelParams.max_tokens,
        temperature: modelParams.temperature,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Plan Generation API Error | Status: ${response.status} ${response.statusText} | Model: ${actualModel} | Error: ${errorText.substring(0, 500)}`);
      throw new Error(`Plan generation API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json();
    const responseSize = JSON.stringify(responseData).length;
    console.log(`📦 Plan Generation Response | Status: ${response.status} | Response size: ${responseSize} bytes | Has choices: ${!!responseData.choices}`);

    // Обработка ответа от DeepSeek API
    let planText = responseData.choices[0]?.message?.content || '[]';

    try {
    // Очищаем текст от возможных обратных кавычек и лишних символов
    let cleanText = planText.trim();

    console.log('🔧 Raw plan text:', cleanText.substring(0, 200) + '...');

    // Удаляем обратные кавычки если они есть
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/m, '');
      console.log('📝 Removed ```json wrapper');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/m, '');
      console.log('📝 Removed generic ``` wrapper');
    }

    // Удаляем возможные текстовые префиксы и находим JSON
    if (cleanText.includes('[') && cleanText.includes(']')) {
      const startIndex = cleanText.indexOf('[');
      const endIndex = cleanText.lastIndexOf(']') + 1;
      cleanText = cleanText.substring(startIndex, endIndex);
      console.log('✂️ Extracted JSON array from text');
    }

    console.log('🔧 Cleaned text:', cleanText.substring(0, 200) + '...');

    // Пробуем JSON5 парсинг сначала
    let plan;
    try {
      plan = JSON5.parse(cleanText);
      console.log(`✅ Plan Parsed | Method: JSON5 | Steps: ${Array.isArray(plan) ? plan.length : 'not array'}`);
    } catch (json5Error) {
      console.log(`🔄 Plan Parsing | JSON5 failed: ${json5Error.message}, trying standard JSON`);
      try {
        plan = JSON.parse(cleanText);
        console.log(`✅ Plan Parsed | Method: Standard JSON | Steps: ${Array.isArray(plan) ? plan.length : 'not array'}`);
      } catch (jsonError) {
        console.error(`❌ Plan Parsing Failed | JSON5: ${json5Error.message} | Standard JSON: ${jsonError.message} | Text length: ${cleanText.length}`);
        console.error(`📄 Plan Text Preview: ${cleanText.substring(0, 500)}...`);
        throw jsonError;
      }
    }

    if (!Array.isArray(plan)) {
      console.log(`⚠️ Plan Validation | Parsed result is not an array (type: ${typeof plan}), converting to empty array`);
      plan = [];
    }

    // Ограничиваем план для предотвращения слишком больших запросов к API
    const maxSteps = 4; // Максимум 4 шага
    const maxQueriesPerStep = 2; // Максимум 2 запроса на шаг

    const originalStepCount = plan.length;
    if (plan.length > maxSteps) {
      console.log(`📏 Plan Truncation | Steps: ${originalStepCount} → ${maxSteps} (limit: ${maxSteps})`);
      plan = plan.slice(0, maxSteps);
    }

    // Ограничиваем количество запросов на каждом шаге
    plan.forEach((step: any, index: number) => {
      if (step.searchQueries && step.searchQueries.length > maxQueriesPerStep) {
        const originalQueryCount = step.searchQueries.length;
        console.log(`📏 Step ${index + 1} Truncation | "${step.step || step.description || 'unnamed'}" queries: ${originalQueryCount} → ${maxQueriesPerStep} (limit: ${maxQueriesPerStep})`);
        step.searchQueries = step.searchQueries.slice(0, maxQueriesPerStep);
      }
    });

    const totalQueries = plan.reduce((sum: number, step: any) => sum + (step.searchQueries?.length || 0), 0);
    console.log(`✅ Plan Generated | Steps: ${plan.length} | Total search queries: ${totalQueries}`);

      return plan;
    } catch (parseError: any) {
      // Ошибки парсинга JSON
      console.error(`❌ Plan Parsing Error | Error: ${parseError.message || parseError} | Original plan text length: ${planText?.length || 0}`);
      console.error(`📄 Original plan text preview: ${planText?.substring(0, 500) || 'none'}...`);

      // Для простых запросов возвращаем пустой план, чтобы использовать обычный ответ
      const isSimpleQuery = userQuestion.length < 100 &&
        !userQuestion.toLowerCase().includes('план') &&
        !userQuestion.toLowerCase().includes('анализ') &&
        !userQuestion.toLowerCase().includes('разработ') &&
        !userQuestion.toLowerCase().includes('созда');

      if (isSimpleQuery) {
        return []; // Пустой план = обычный ответ без этапов
      }

      // Возвращаем дефолтный план для сложных запросов (упрощенный для экономии)
      return [
        {
          step: "Анализ и подготовка",
          description: "Проанализировать вопрос и подготовить ответ на основе доступных данных",
          completed: false,
          searchQueries: [
            {
              query: userQuestion.substring(0, 100) + " 2025", // Ограничиваем длину запроса
              priority: "high",
              purpose: "Основные данные для ответа"
            }
          ]
        }
      ];
    }
  } catch (fetchError: any) {
    // Очищаем таймаут и обработчик abort при любой ошибке fetch
    clearTimeout(timeoutId);
    abortSignal?.removeEventListener('abort', abortHandler);

    // Проверяем, является ли это ошибкой прерывания
    if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted') || fetchError.message?.includes('AbortError')) {
      console.warn(`⚠️ Plan Generation Aborted | Model: ${actualModel} | Query: "${userQuestion.substring(0, 80)}..." | Reason: Request aborted (timeout >${timeoutMs}ms or cancelled) | This may happen if the request takes too long`);
      // Возвращаем пустой план вместо выброса ошибки, чтобы продолжить работу без планирования
      return [];
    }

    // Для других ошибок показываем детали и пробрасываем дальше
    console.error(`❌ Plan Generation Fetch Error | Model: ${actualModel} | Query: "${userQuestion.substring(0, 80)}..." | Error: ${fetchError.message || fetchError} | Type: ${fetchError.name || 'unknown'}`);
    throw fetchError;
  } finally {
    // Всегда очищаем обработчик abort
    abortSignal?.removeEventListener('abort', abortHandler);
  }
};

// Выполнение одного этапа плана
const executePlanStep = async (
  messages: Message[],
  selectedModel: string,
  onChunk?: (chunk: string) => void,
  abortSignal?: AbortSignal
): Promise<string> => {
  // Конвертируем выбранную модель в реальную модель DeepSeek
  const actualModel = getActualModel(selectedModel);
  const modelParams = getModelParams(selectedModel);

  const stepMessage = messages[messages.length - 1];
  const stepContent = stepMessage.content.toLowerCase();

  // Проверяем, является ли это этапом создания визуализации
  const isVisualizationStep = stepContent.includes('визуализац') ||
                             stepContent.includes('график') ||
                             stepContent.includes('диаграмм') ||
                             stepContent.includes('создать визуализацию');

  // Определяем тип бизнес-этапа для более точных инструкций
  const isMarketAnalysis = stepContent.includes('анализ рынка') || stepContent.includes('конкурент');
  const isFinancialPlan = stepContent.includes('финансовый') || stepContent.includes('бюджет') || stepContent.includes('расчет');
  const isMarketingPlan = stepContent.includes('маркетинг') || stepContent.includes('продвижение');
  const isOperationalPlan = stepContent.includes('операционный') || stepContent.includes('управление');
  const isRiskAnalysis = stepContent.includes('риск') || stepContent.includes('риски');

  let enhancedPrompt = stepMessage.content;

  // Добавляем специфические инструкции для бизнес-планирования
  if (isMarketAnalysis) {
    enhancedPrompt += `

Для анализа рынка кофейни:
- Изучите демографию района (возраст, доход, образование)
- Оцените конкурентов (количество, цены, качество, уникальные предложения)
- Проанализируйте тренды рынка кофе в вашем регионе
- Определите сезонные колебания спроса
- Оцените потенциальный объем рынка`;
  } else if (isFinancialPlan) {
    enhancedPrompt += `

Для финансового плана кофейни:
- Рассчитайте первоначальные инвестиции (аренда, оборудование, ремонт)
- Оцените ежемесячные операционные расходы
- Спрогнозируйте доходы на основе количества клиентов и среднего чека
- Рассчитайте точку безубыточности
- Подготовьте прогноз прибыли на 1-3 года`;
  } else if (isMarketingPlan) {
    enhancedPrompt += `

Для маркетингового плана кофейни:
- Определите уникальное торговое предложение (УТП)
- Разработайте стратегию ценообразования
- Планируйте каналы продвижения (соцсети, локальная реклама)
- Создайте план лояльности клиентов
- Разработайте стратегию привлечения первых клиентов`;
  } else if (isOperationalPlan) {
    enhancedPrompt += `

Для операционного плана кофейни:
- Определите график работы и режим персонала
- Разработайте меню и технологические процессы
- Планируйте закупки сырья и поставщиков
- Создайте стандарты обслуживания
- Разработайте систему контроля качества`;
  } else if (isRiskAnalysis) {
    enhancedPrompt += `

Для анализа рисков кофейни:
- Оцените рыночные риски (конкуренция, изменение вкусов)
- Финансовые риски (нехватка средств, колебания цен)
- Операционные риски (поставки, персонал, оборудование)
- Репутационные риски
- Разработайте меры по минимизации каждого риска`;
  }

  if (isVisualizationStep) {
    // Извлекаем результаты поиска из контекста сообщения
    let searchContext = '';
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.content && lastMessage.content.includes('Результаты поиска в интернете:')) {
      const searchMatch = lastMessage.content.match(/Результаты поиска в интернете:\s*\n(.*?)(\n\n|$)/s);
      if (searchMatch) {
        searchContext = searchMatch[1];
      }
    }

    // Генерируем конфигурацию визуализации с использованием реальных данных
    const visualizationPrompt = `${enhancedPrompt}

${searchContext ? `РЕАЛЬНЫЕ ДАННЫЕ ИЗ ПОИСКА:
${searchContext}

` : ''}Создай визуализацию данных в формате JSON на основе найденной информации. Используй реальные цифры из результатов поиска.

ИНСТРУКЦИИ:
1. Проанализируй результаты поиска и извлеки все числовые данные
2. Используй конкретные цифры, найденные в поиске (рублей, процентов, количества)
3. Если данных недостаточно, используй обоснованные оценки на основе найденных трендов
4. НЕ используй плейсхолдеры типа XXXX или синтетические данные
5. Создай логичную визуализацию, соответствующую запросу пользователя

Примеры форматов данных:
- Для временных рядов: [{"name": "Янв", "value": 4000}, {"name": "Фев", "value": 3000}, ...]
- Для категорий: [{"name": "Электроника", "value": 35}, {"name": "Одежда", "value": 25}, ...]
- Для финансовых показателей: [{"name": "Выручка", "value": 1500000}, {"name": "Прибыль", "value": 300000}, ...]

Верни только JSON конфигурацию визуализации:
{
  "type": "bar",
  "data": [{"name": "Пример", "value": 100}],
  "title": "Заголовок графика",
  "xAxisKey": "name",
  "yAxisKey": "value"
}`;

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          // Системное сообщение
          messages.find(msg => msg.role === 'system') || {
            role: 'system',
            content: 'Ты эксперт по визуализации данных. Создавай JSON для графиков на основе предоставленной информации.'
          },
          // Вся история чата
          ...messages.filter(msg => msg.role !== 'system').slice(0, -1), // Все сообщения кроме системного и последнего
          { role: 'user', content: visualizationPrompt }
        ],
          model: actualModel,
        stream: false,
          ...modelParams,
      }),
    };

    const isAbortSignal = (v: unknown): v is AbortSignal =>
      !!v &&
      typeof v === "object" &&
      typeof (v as any).aborted === "boolean" &&
      typeof (v as any).addEventListener === "function";

    if (isAbortSignal(abortSignal)) {
      requestOptions.signal = abortSignal;
    } else if (abortSignal != null) {
      console.warn("⚠️ Invalid abortSignal in visualization (ignored):", abortSignal);
    }

    const visualizationResponse = await fetch(`${API_BASE_URL}/chat`, requestOptions);

    if (!visualizationResponse.ok) {
      throw new Error(`Visualization API error: ${visualizationResponse.status} ${visualizationResponse.statusText}`);
    }

    const visualizationData = await visualizationResponse.json();
    let visualizationJson = visualizationData.choices[0]?.message?.content || '{}';

    // Очищаем JSON от лишних символов
    visualizationJson = visualizationJson.trim();
    if (visualizationJson.startsWith('```json')) {
      visualizationJson = visualizationJson.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (visualizationJson.startsWith('```')) {
      visualizationJson = visualizationJson.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    // Проверяем, что JSON валидный
    try {
      JSON.parse(visualizationJson);
    } catch (error) {
      console.error('Invalid visualization JSON:', visualizationJson);
      // Возвращаем дефолтный JSON если невалидный
      visualizationJson = '{"type": "bar", "data": [{"name": "Пример", "value": 100}], "title": "Визуализация данных"}';
    }

    // Возвращаем ответ с визуализацией
    const explanation = "Вот визуализация данных:\n\n```json\n" + visualizationJson + "\n```\n\n";

    // Отправляем объяснение по частям
    for (const char of explanation) {
      if (onChunk) {
        onChunk(char);
      }
      // Небольшая задержка для имитации потоковой передачи
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return explanation;
  } else {
    // Обычное выполнение этапа с улучшенными инструкциями
    const stepMessages = messages.map((msg, index) => {
      if (index === messages.length - 1) {
        // Заменяем контент последнего сообщения на enhancedPrompt
        return {
          role: msg.role,
          content: enhancedPrompt,
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    // GPT-5.1 не поддерживает streaming
    const useStreaming = actualModel !== 'gpt-5.1';

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
          messages: stepMessages,
          model: actualModel,
          stream: useStreaming,
        }),
      };

      const isAbortSignal = (v: unknown): v is AbortSignal =>
        !!v &&
        typeof v === "object" &&
        typeof (v as any).aborted === "boolean" &&
        typeof (v as any).addEventListener === "function";

      if (isAbortSignal(abortSignal)) {
        requestOptions.signal = abortSignal;
      } else if (abortSignal != null) {
        console.warn("⚠️ Invalid abortSignal in step execution (ignored):", abortSignal);
      }

    const response = await fetch(`${API_BASE_URL}/chat`, requestOptions);

    if (!response.ok) {
      throw new Error(`Step execution API error: ${response.status} ${response.statusText}`);
    }

    let stepResponse = '';

    if (useStreaming) {
      // Обрабатываем потоковый ответ
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                stepResponse += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
              // Игнорируем невалидный JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      }
    } else {
      // Обрабатываем обычный JSON ответ для GPT-5.1
      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      stepResponse = content;

      // Имитируем потоковую передачу для совместимости с UI
      if (onChunk) {
        for (const char of content) {
          onChunk(char);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    return stepResponse;
  }
};
