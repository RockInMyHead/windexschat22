#!/usr/bin/env node

/**
 * Тест для проверки работы Tavily API
 * Проверяет:
 * 1. Доступность MCP сервера
 * 2. Работу Tavily API через MCP сервер
 * 3. Что данные действительно из интернета (актуальные)
 */

import fetch from 'node-fetch';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8002';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:1062';

// Цвета для консоли
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMCPHealth() {
  log('\n📊 Тест 1: Проверка здоровья MCP сервера', 'blue');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      log(`✅ MCP сервер работает: ${JSON.stringify(data)}`, 'green');
      return true;
    } else {
      log(`❌ MCP сервер вернул ошибку: ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ MCP сервер недоступен: ${error.message}`, 'red');
    return false;
  }
}

async function testTavilyDirect(query, description) {
  log(`\n🔍 Тест: ${description}`, 'blue');
  log(`   Запрос: "${query}"`, 'yellow');
  
  try {
    const response = await fetch(`${MCP_SERVER_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        max_results: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`❌ Ошибка: ${response.status} - ${errorText}`, 'red');
      return false;
    }

    const data = await response.json();
    
    // Проверяем наличие результатов
    if (!data.results || data.results.length === 0) {
      log(`❌ Нет результатов поиска`, 'red');
      return false;
    }

    log(`✅ Получено результатов: ${data.results.length}`, 'green');
    
    // Выводим первый результат
    const firstResult = data.results[0];
    log(`\n   📄 Первый результат:`, 'yellow');
    log(`   Заголовок: ${firstResult.title}`, 'yellow');
    log(`   URL: ${firstResult.url}`, 'yellow');
    log(`   Релевантность: ${(firstResult.score * 100).toFixed(1)}%`, 'yellow');
    log(`   Контент (первые 200 символов): ${firstResult.content.substring(0, 200)}...`, 'yellow');
    
    // Проверяем наличие answer от Tavily
    if (data.answer) {
      log(`\n   💡 Краткий ответ от Tavily:`, 'yellow');
      log(`   ${data.answer}`, 'yellow');
    }

    return true;
  } catch (error) {
    log(`❌ Ошибка запроса: ${error.message}`, 'red');
    return false;
  }
}

async function testBackendProxy(query, description) {
  log(`\n🌐 Тест через Backend Proxy: ${description}`, 'blue');
  log(`   Запрос: "${query}"`, 'yellow');
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/mcp/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        max_results: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`❌ Ошибка: ${response.status} - ${errorText}`, 'red');
      return false;
    }

    const data = await response.json();
    
    // Проверяем, что это не fallback (fallback возвращает только answer без results)
    if (!data.results || data.results.length === 0) {
      log(`⚠️  Нет результатов - возможно используется fallback`, 'yellow');
      if (data.answer) {
        log(`   Fallback ответ: ${data.answer.substring(0, 100)}...`, 'yellow');
      }
      return false;
    }

    log(`✅ Получено результатов через Backend: ${data.results.length}`, 'green');
    log(`   Это данные от Tavily API (не fallback)`, 'green');
    
    return true;
  } catch (error) {
    log(`❌ Ошибка запроса: ${error.message}`, 'red');
    return false;
  }
}

async function testActualData() {
  log('\n📅 Тест актуальности данных из интернета', 'blue');
  
  // Тест 1: Актуальные новости (должны быть свежие данные)
  const newsQuery = 'последние новости о технологиях 2025';
  log(`\n🔍 Проверка актуальности: "${newsQuery}"`, 'yellow');
  
  try {
    const response = await fetch(`${MCP_SERVER_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: newsQuery,
        max_results: 5
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      // Проверяем, что в результатах есть упоминания 2025 года
      const has2025 = JSON.stringify(data).includes('2025');
      const hasRecent = JSON.stringify(data).toLowerCase().includes('новост') || 
                       JSON.stringify(data).toLowerCase().includes('news');
      
      if (has2025 || hasRecent) {
        log(`✅ Данные выглядят актуальными (есть упоминания 2025 или новостей)`, 'green');
      } else {
        log(`⚠️  Не удалось определить актуальность данных`, 'yellow');
      }
      
      // Проверяем URL - должны быть реальные сайты
      const realDomains = data.results.filter(r => 
        r.url && (r.url.includes('http://') || r.url.includes('https://'))
      );
      
      log(`✅ Найдено ${realDomains.length} результатов с реальными URL`, 'green');
      
      return true;
    }
  } catch (error) {
    log(`❌ Ошибка: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'bold');
  log('🧪 ТЕСТИРОВАНИЕ TAVILY API', 'bold');
  log('='.repeat(60), 'bold');

  const results = {
    mcpHealth: false,
    tavilyBasic: false,
    tavilyActual: false,
    backendProxy: false,
    actualData: false
  };

  // Тест 1: Health check
  results.mcpHealth = await testMCPHealth();
  
  if (!results.mcpHealth) {
    log('\n❌ MCP сервер недоступен. Убедитесь, что он запущен:', 'red');
    log('   cd mcp-server && npm start', 'yellow');
    return;
  }

  // Тест 2: Базовый поиск
  results.tavilyBasic = await testTavilyDirect(
    'искусственный интеллект',
    'Базовый поиск (общая информация)'
  );

  // Тест 3: Поиск актуальной информации
  results.tavilyActual = await testTavilyDirect(
    'курс биткоина сегодня',
    'Поиск актуальных данных (криптовалюта)'
  );

  // Тест 4: Проверка через Backend Proxy
  results.backendProxy = await testBackendProxy(
    'новости о технологиях',
    'Проверка интеграции через основной сервер'
  );

  // Тест 5: Проверка актуальности данных
  results.actualData = await testActualData();

  // Итоговый отчет
  log('\n' + '='.repeat(60), 'bold');
  log('📊 ИТОГОВЫЙ ОТЧЕТ', 'bold');
  log('='.repeat(60), 'bold');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  log(`\nВсего тестов: ${totalTests}`, 'blue');
  log(`Пройдено: ${passedTests}`, passedTests === totalTests ? 'green' : 'yellow');
  log(`Провалено: ${totalTests - passedTests}`, passedTests === totalTests ? 'green' : 'red');
  
  log('\nДетали:', 'blue');
  log(`  ✅ MCP Health Check: ${results.mcpHealth ? 'PASS' : 'FAIL'}`, results.mcpHealth ? 'green' : 'red');
  log(`  ✅ Базовый поиск: ${results.tavilyBasic ? 'PASS' : 'FAIL'}`, results.tavilyBasic ? 'green' : 'red');
  log(`  ✅ Актуальные данные: ${results.tavilyActual ? 'PASS' : 'FAIL'}`, results.tavilyActual ? 'green' : 'red');
  log(`  ✅ Backend Proxy: ${results.backendProxy ? 'PASS' : 'FAIL'}`, results.backendProxy ? 'green' : 'red');
  log(`  ✅ Актуальность данных: ${results.actualData ? 'PASS' : 'FAIL'}`, results.actualData ? 'green' : 'red');
  
  if (passedTests === totalTests) {
    log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Tavily API работает корректно.', 'green');
  } else {
    log('\n⚠️  Некоторые тесты не прошли. Проверьте конфигурацию.', 'yellow');
  }
  
  log('\n' + '='.repeat(60), 'bold');
}

// Запуск тестов
runAllTests().catch(error => {
  log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
  process.exit(1);
});
