import React, { useMemo, useState, useRef } from "react";
import { InlineMath, BlockMath } from 'react-katex';
import { Copy, Volume2, Loader2 } from "lucide-react";
import DataVisualization, { parseVisualizationConfig, VisualizationConfig } from "./DataVisualization";
import { ttsClient } from "@/lib/api";
import { renderPlanJsonForDisplay } from "@/lib/renderInternalPlan";

// Функция выполнения JavaScript кода в изолированном контексте
const executeJavaScript = async (code: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // Создаем изолированный контекст для выполнения кода
      const sandbox = {
        console: {
          log: (...args: unknown[]) => {
            return args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
          },
          error: (...args: unknown[]) => {
            return `Error: ${args.map(arg => String(arg)).join(' ')}`;
          },
          warn: (...args: unknown[]) => {
            return `Warning: ${args.map(arg => String(arg)).join(' ')}`;
          }
        },
        // Безопасные встроенные функции
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent
      };

      // Перехватываем console.log
      let output = '';
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;

      console.log = (...args) => {
        output += sandbox.console.log(...args) + '\n';
      };
      console.error = (...args) => {
        output += sandbox.console.error(...args) + '\n';
      };
      console.warn = (...args) => {
        output += sandbox.console.warn(...args) + '\n';
      };

      // Выполняем код в контексте sandbox
      const result = new Function(...Object.keys(sandbox), `
        "use strict";
        try {
          ${code}
        } catch (error) {
          return "Error: " + error.message;
        }
      `)(...Object.values(sandbox));

      // Восстанавливаем оригинальные функции console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;

      // Если код вернул значение, добавляем его к выводу
      if (result !== undefined) {
        output += (output ? '\n' : '') + 'Result: ' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
      }

      resolve(output || 'Код выполнен успешно (без вывода)');
    } catch (error) {
      reject(error);
    }
  });
};

// Функция выполнения Python кода через Pyodide
let pyodideInstance: unknown = null;
let pyodideLoading = false;

const loadPyodideScript = () => {
  return new Promise<void>((resolve, reject) => {
    if ((window as { loadPyodide?: unknown }).loadPyodide) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить Pyodide скрипт'));
    document.head.appendChild(script);
  });
};

const initializePyodide = async () => {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) {
    // Ждем пока другой запрос загрузит Pyodide
    while (pyodideLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return pyodideInstance;
  }

  pyodideLoading = true;

  try {
    // Загружаем Pyodide скрипт
    await loadPyodideScript();

    // Загружаем Pyodide
    pyodideInstance = await ((window as { loadPyodide?: unknown }).loadPyodide as (config: { indexURL: string }) => Promise<unknown>)({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
    });

    // Настраиваем stdout для захвата вывода
    await pyodideInstance.runPython(`
import sys
import io

class PyodideOutput:
    def __init__(self):
        self.output = []

    def write(self, text):
        self.output.append(text)

    def flush(self):
        pass

    def get_output(self):
        return ''.join(self.output)

# Заменяем stdout
sys.stdout = PyodideOutput()
sys.stderr = PyodideOutput()
`);

    pyodideLoading = false;
    return pyodideInstance;
  } catch (error) {
    pyodideLoading = false;
    throw new Error(`Не удалось загрузить Pyodide: ${error}`);
  }
};

const executePython = async (code: string): Promise<string> => {
  try {
    const pyodide = await initializePyodide();

    // Очищаем предыдущий вывод
    await pyodide.runPythonAsync('sys.stdout.output.clear(); sys.stderr.output.clear()');

    try {
      // Выполняем код и получаем результат
      const result = await pyodide.runPythonAsync(code);

      // Получаем вывод из stdout и stderr
      const stdout = await pyodide.runPythonAsync('sys.stdout.get_output()');
      const stderr = await pyodide.runPythonAsync('sys.stderr.get_output()');

      // Формируем итоговый вывод
      let finalOutput = '';

      if (stdout && stdout.trim()) {
        finalOutput += stdout;
      }

      if (stderr && stderr.trim()) {
        if (finalOutput) finalOutput += '\n';
        finalOutput += 'STDERR:\n' + stderr;
      }

      // Если есть возвращаемое значение и нет вывода, показываем результат
      if (result !== undefined && result !== null && !finalOutput.trim()) {
        finalOutput = 'Result: ' + String(result);
      }

      // Если есть возвращаемое значение и есть вывод, добавляем результат
      if (result !== undefined && result !== null && finalOutput.trim()) {
        finalOutput += '\n\nResult: ' + String(result);
      }

      return finalOutput || 'Код выполнен успешно (без вывода)';
    } catch (firstError: unknown) {
      // Проверяем, является ли ошибка отсутствием модуля
      const errorMessage = firstError.message || String(firstError);
      console.log('Python execution error:', errorMessage);

      if (errorMessage.includes("ModuleNotFoundError") ||
          errorMessage.includes("not installed") ||
          (errorMessage.includes("module") && errorMessage.includes("not installed"))) {

        // Ищем название модуля разными способами
        let moduleMatch = errorMessage.match(/No module named '(\w+)'/);
        if (!moduleMatch) {
          moduleMatch = errorMessage.match(/module '(\w+)' is not installed/);
        }
        if (!moduleMatch) {
          moduleMatch = errorMessage.match(/The module '(\w+)' is included/);
        }

        if (moduleMatch) {
          const missingModule = moduleMatch[1];
          console.log('Installing missing module:', missingModule);

          try {
            // Пытаемся установить отсутствующий модуль с помощью pyodide.loadPackage
            console.log('Installing package:', missingModule);
            await pyodide.loadPackage(missingModule);
            console.log('Package installed successfully, retrying execution');

            // Повторяем выполнение кода после установки модуля
            return await executePython(code);
          } catch (installError) {
            console.error('Failed to install package:', installError);
            // Если pyodide.loadPackage не сработал, попробуем micropip
            try {
              console.log('Trying micropip as fallback...');
              await pyodide.runPythonAsync(`
import micropip
await micropip.install("${missingModule}")
`);
              console.log('Package installed via micropip successfully');
              return await executePython(code);
            } catch (micropipError) {
              console.error('Failed to install via micropip too:', micropipError);
              throw new Error(`Не удалось установить модуль ${missingModule}: ${installError}`);
            }
          }
        }
      }
      // Если это не ошибка отсутствия модуля, выбрасываем оригинальную ошибку
      throw firstError;
    }
  } catch (error) {
    throw new Error(`Ошибка выполнения Python: ${error}`);
  }
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessageProps {
  message: Message;
  selectedModel?: string;
}

// Модальное окно для результатов выполнения кода
const CodeExecutionModal = ({
  isOpen,
  onClose,
  result,
  isRunning,
  language
}: {
  isOpen: boolean;
  onClose: () => void;
  result: string;
  isRunning: boolean;
  language: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">
            Результат выполнения ({language})
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-96">
          {isRunning ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
              <span>Выполнение кода...</span>
            </div>
          ) : (
            <pre className="bg-muted p-3 rounded text-sm font-mono whitespace-pre-wrap overflow-x-auto">
              {result || "Нет результата"}
            </pre>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

// Компонент для отображения блоков кода
const CodeBlock = ({ code, language }: { code: string; language?: string }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [executionResult, setExecutionResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Определяем, можно ли выполнить код в браузере
  const canExecute = language && ['javascript', 'js', 'python', 'py'].includes(language.toLowerCase());

  // Функция выполнения кода
  const executeCode = async () => {
    if (!language || !canExecute) return;

    setIsExecuting(true);
    setExecutionResult('');
    setIsModalOpen(true);

    try {
      if (language.toLowerCase() === 'javascript' || language.toLowerCase() === 'js') {
        // Выполнение JavaScript в изолированном контексте
        const result = await executeJavaScript(code);
        setExecutionResult(result);
      } else if (language.toLowerCase() === 'python' || language.toLowerCase() === 'py') {
        // Выполнение Python через Pyodide
        const result = await executePython(code);
        setExecutionResult(result);
      }
    } catch (error) {
      setExecutionResult(`Ошибка выполнения: ${error}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
    <div className="relative my-4 rounded-lg bg-gray-900 text-gray-100 w-full max-w-full overflow-hidden">
        {/* Заголовок с языком и кнопками */}
      {language && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 sm:px-4">
          <span className="text-xs sm:text-sm font-medium text-gray-300 truncate">{language}</span>
            <div className="flex items-center gap-2">
              {canExecute && (
                <button
                  className="text-gray-400 hover:text-green-400 transition-colors flex-shrink-0 p-1 rounded hover:bg-gray-700/50"
                  onClick={executeCode}
                  title="Выполнить код"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              )}
          <button
            className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 ml-2"
            onClick={() => navigator.clipboard.writeText(code)}
            title="Копировать код"
          >
            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
            </div>
        </div>
      )}

      {/* Блок кода с адаптивными настройками */}
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        <pre className="p-3 text-xs sm:text-sm leading-relaxed min-w-0 sm:p-4">
          <code className="font-mono text-gray-100 block whitespace-pre-wrap break-words overflow-wrap-anywhere">
            {code}
          </code>
        </pre>
      </div>
    </div>

      <CodeExecutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        result={executionResult}
        isRunning={isExecuting}
        language={language || 'unknown'}
      />
    </>
  );
};

// Функция для автоматического определения и форматирования кода в Pro режиме
const formatCodeForPro = (text: string): string => {
  // Только для Pro режима и сообщений ассистента
  const isProMode = text.includes('WindexsAI Pro') || text.includes('DeepSeek Reasoner') || text.includes('deepseek-reasoner');

  if (!isProMode) return text;

  // Регулярные выражения для определения различных типов кода
  const patterns = [
    // HTML
    { regex: /<(div|span|html|body|head|title|meta|link|script|style|header|nav|main|section|article|aside|footer|h[1-6]|p|ul|ol|li|a|img|form|input|button|textarea|select|option|table|thead|tbody|tr|th|td)[>\s]/gi, language: 'html' },
    // CSS
    { regex: /(\.[\w-]+\s*\{[^}]*\}|#[\w-]+\s*\{[^}]*\}|@media|@import|@font-face|body\s*\{[^}]*\})/gi, language: 'css' },
    // JavaScript
    { regex: /(function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|console\.log|document\.|window\.|addEventListener|\$\(|jQuery\(|\.querySelector|\.getElementById)/gi, language: 'javascript' },
    // Python
    { regex: /(def\s+\w+|class\s+\w+|import\s+\w+|from\s+\w+|if\s+__name__|print\(|len\(|range\(|for\s+\w+\s+in)/gi, language: 'python' },
    // SQL
    { regex: /(SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|CREATE\s+|ALTER\s+|DROP\s+|FROM\s+|WHERE\s+|JOIN\s+|GROUP\s+BY|ORDER\s+BY)/gi, language: 'sql' },
    // JSON
    { regex: /(\{[\s\S]*?\}|\[[\s\S]*?\])/g, language: 'json' }
  ];

  const formattedText = text;

  // Ищем потенциальные блоки кода (отступы, специальные символы)
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlock = [];
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Определяем начало блока кода (отступы, специальные символы)
    const isCodeLine = line.startsWith('    ') || line.startsWith('\t') ||
                     line.includes('function') || line.includes('def ') ||
                     line.includes('class ') || line.includes('import ') ||
                     line.includes('const ') || line.includes('let ') ||
                     line.includes('var ') || line.includes('<') && line.includes('>') ||
                     line.includes('{') && line.includes('}') ||
                     line.includes('SELECT ') || line.includes('INSERT ') ||
                     /^\s*[\w-]+\s*\{[^}]*\}\s*$/.test(line); // CSS-like

    if (isCodeLine && !inCodeBlock) {
      // Начало блока кода
      inCodeBlock = true;
      codeBlock = [line];
    } else if (inCodeBlock && (line.trim() === '' || isCodeLine)) {
      // Продолжение блока кода
      codeBlock.push(line);
    } else if (inCodeBlock) {
      // Конец блока кода
      inCodeBlock = false;

      // Определяем язык кода
      const codeText = codeBlock.join('\n');
      let detectedLanguage = 'text';

      for (const pattern of patterns) {
        if (pattern.regex.test(codeText)) {
          detectedLanguage = pattern.language;
          break;
        }
      }

      // Добавляем отформатированный блок кода
      result.push(`\`\`\`${detectedLanguage}\n${codeText}\n\`\`\``);
      result.push(line); // Добавляем текущую строку (которая не код)
    } else {
      result.push(line);
    }
  }

  // Если последний блок был кодом
  if (inCodeBlock) {
    const codeText = codeBlock.join('\n');
    let detectedLanguage = 'text';

    for (const pattern of patterns) {
      if (pattern.regex.test(codeText)) {
        detectedLanguage = pattern.language;
        break;
      }
    }

    result.push(`\`\`\`${detectedLanguage}\n${codeText}\n\`\`\``);
  }

  return result.join('\n');
};

// Функция для парсинга текста с блоками кода
const parseTextWithCodeBlocks = (text: string, selectedModel?: string) => {
  if (!text) return [{ type: 'text', content: '' }];

  // Для Pro режима автоматически форматируем код
  const processedText = selectedModel === 'pro' ? formatCodeForPro(text) : text;

  const parts = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(processedText)) !== null) {
    // Добавляем текст до блока кода
    if (match.index > lastIndex) {
      const textBefore = processedText.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Добавляем блок кода
    const language = match[1] || 'text';
    const code = match[2].trim();
    parts.push({ type: 'code', language, content: code });

    lastIndex = match.index + match[0].length;
  }

  // Добавляем оставшийся текст после последнего блока кода
  if (lastIndex < processedText.length) {
    const remainingText = processedText.substring(lastIndex);
    if (remainingText.trim()) {
      parts.push({ type: 'text', content: remainingText });
    }
  }

  return parts;
};

// Функция для парсинга Markdown с красивыми символами
const parseMarkdown = (
  text: string,
  onWordClick?: (word: string, event: React.MouseEvent, context: string) => void,
  context?: string
): React.ReactNode[] => {
  // Разбиваем текст на строки для обработки заголовков и списков
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listLevel = 0;
  let currentTable: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      const paddingClass = listLevel === 0 ? 'pl-0' : listLevel === 1 ? 'pl-4' : 'pl-8';
      result.push(
        <ul key={`list-${result.length}`} className={`list-none ${paddingClass} my-2 space-y-1.5`}>
          {currentList.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-primary mt-1.5 flex-shrink-0">▸</span>
              <span className="flex-1">{renderInlineMarkdown(item.trim(), 0, onWordClick, context)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = () => {
    if (currentTable.length >= 2) { // Минимум заголовок + разделитель
      const tableLines = currentTable.filter(line => line.trim());
      if (tableLines.length >= 2) {
        const headerLine = tableLines[0];
        const separatorLine = tableLines[1];
        const dataLines = tableLines.slice(2);

        // Проверяем, что вторая строка является разделителем (содержит ---)
        if (separatorLine.includes('---') || separatorLine.includes(':')) {
          try {
            const headers = parseTableRow(headerLine);
            const alignments = parseTableAlignment(separatorLine);
            const rows = dataLines.map(parseTableRow);

            result.push(
              <div key={`table-${result.length}`} className="my-4 overflow-x-auto">
                <table className="min-w-full border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted/50">
                      {headers.map((header, idx) => (
                        <th key={idx} className="border border-border px-4 py-2 text-left font-semibold">
                          {renderInlineMarkdown(header.trim(), 0, onWordClick, context)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-muted/30">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="border border-border px-4 py-2">
                            {renderInlineMarkdown(cell.trim(), 0, onWordClick, context)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          } catch (error) {
            // Если парсинг таблицы не удался, рендерим как обычный текст
            currentTable.forEach((tableLine, idx) => {
              result.push(
                <p key={`table-text-${result.length}-${idx}`} className="my-1">
                  {renderInlineMarkdown(tableLine, 0, onWordClick, context)}
                </p>
              );
            });
          }
        } else {
          // Не таблица, рендерим как обычный текст
          currentTable.forEach((tableLine, idx) => {
            result.push(
              <p key={`table-text-${result.length}-${idx}`} className="my-1">
                {renderInlineMarkdown(tableLine)}
              </p>
            );
          });
        }
      }
      currentTable = [];
    } else if (currentTable.length > 0) {
      // Не таблица, рендерим как обычный текст
      currentTable.forEach((tableLine, idx) => {
        result.push(
          <p key={`table-text-${result.length}-${idx}`} className="my-1">
            {renderInlineMarkdown(tableLine)}
          </p>
        );
      });
      currentTable = [];
    }
  };

  const parseTableRow = (line: string): string[] => {
    // Убираем ведущие и конечные |, разбиваем по | и убираем лишние пробелы
    return line.split('|').slice(1, -1).map(cell => cell.trim());
  };

  const parseTableAlignment = (line: string): string[] => {
    // Простая логика выравнивания - можно расширить позже
    return line.split('|').slice(1, -1).map(() => 'left');
  };

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();

    // Пропускаем пустые строки, но флашим список и таблицы
    if (!trimmedLine) {
      flushList();
      flushTable();
      if (lineIndex < lines.length - 1) {
        result.push(<br key={`br-${lineIndex}`} />);
      }
      return;
    }

    // Заголовки H4 (####)
    if (trimmedLine.startsWith('####')) {
      flushList();
      flushTable();
      const title = trimmedLine.replace(/^####\s+/, '').trim();
      result.push(
        <h4 key={`h4-${lineIndex}`} className="text-lg font-bold mt-4 mb-2 text-foreground flex items-center gap-2">
          <span className="text-primary">▸</span>
          <span>{renderInlineMarkdown(title, 0, onWordClick, context)}</span>
        </h4>
      );
      return;
    }

    // Заголовки H3 (###)
    if (trimmedLine.startsWith('###')) {
      flushList();
      flushTable();
      const title = trimmedLine.replace(/^###\s+/, '').trim();
      result.push(
        <h3 key={`h3-${lineIndex}`} className="text-xl font-bold mt-5 mb-3 text-foreground flex items-center gap-2">
          <span className="text-primary">◆</span>
          <span>{renderInlineMarkdown(title, 0, onWordClick, context)}</span>
        </h3>
      );
      return;
    }

    // Заголовки H2 (##)
    if (trimmedLine.startsWith('##')) {
      flushList();
      flushTable();
      const title = trimmedLine.replace(/^##\s+/, '').trim();
      result.push(
        <h2 key={`h2-${lineIndex}`} className="text-2xl font-bold mt-6 mb-4 text-foreground flex items-center gap-2 border-b border-border pb-2">
          <span className="text-primary">✦</span>
          <span>{renderInlineMarkdown(title, 0, onWordClick, context)}</span>
        </h2>
      );
      return;
    }

    // Заголовки H1 (#)
    if (trimmedLine.startsWith('#') && !trimmedLine.startsWith('##')) {
      flushList();
      flushTable();
      const title = trimmedLine.replace(/^#\s+/, '').trim();
      result.push(
        <h1 key={`h1-${lineIndex}`} className="text-3xl font-bold mt-6 mb-4 text-foreground flex items-center gap-3 border-b-2 border-primary pb-3">
          <span className="text-primary text-2xl">★</span>
          <span>{renderInlineMarkdown(title, 0, onWordClick, context)}</span>
        </h1>
      );
      return;
    }

    // Списки (- или *) - должны начинаться с дефиса/звездочки и пробела
    const listMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      const item = listMatch[1].trim();
      if (item) {
        currentList.push(item);
        listLevel = 0;
        return;
      }
    }

    // Нумерованные списки
    if (/^\d+\.\s+/.test(trimmedLine)) {
      flushList();
      flushTable();
      const item = trimmedLine.replace(/^\d+\.\s+/, '').trim();
      const number = trimmedLine.match(/^\d+/)?.[0] || '';
      result.push(
        <div key={`num-${lineIndex}`} className="flex items-start gap-2 my-1.5">
          <span className="text-primary font-bold flex-shrink-0 w-6">{number}.</span>
          <span className="flex-1">{renderInlineMarkdown(item, 0, onWordClick, context)}</span>
        </div>
      );
      return;
    }

    // Таблицы - строки, начинающиеся с |
    if (trimmedLine.includes('|')) {
      flushList();
      currentTable.push(line); // Добавляем оригинальную строку, не trimmedLine
      return;
    }

    // Если мы здесь и у нас есть таблица, но текущая строка не часть таблицы - флашим таблицу
    if (currentTable.length > 0) {
      flushTable();
    }

    // Обычный текст - применяем inline markdown ко всей строке
    flushList();
    result.push(
      <p key={`p-${lineIndex}`} className="my-2 leading-relaxed">
        {renderInlineMarkdown(trimmedLine, 0, onWordClick, context)}
      </p>
    );
  });

  flushList();
  flushTable();
  return result;
};

// Функция для рендеринга кликабельного текста
const renderClickableText = (
  text: string,
  key: string | number,
  onWordClick?: (word: string, event: React.MouseEvent, context: string) => void,
  context?: string
): React.ReactNode => {
  if (!onWordClick || !context) {
    return <span key={key}>{text}</span>;
  }

  // Разбиваем текст на логические единицы (слова, словосочетания и знаки препинания)
  const segments = text.split(/(\s+|[.,!?;:—–\-()"«»[\]]|\n)/).filter(segment => segment.length > 0);

  const nodes: React.ReactNode[] = [];
  let segmentKey = 0;

  segments.forEach((segment) => {
    const trimmed = segment.trim();

    // Проверяем, является ли сегмент словом (буквы, цифры, дефисы)
    const isWordLike = /^[а-яА-Яa-zA-ZёЁ0-9]+(-[а-яА-Яa-zA-ZёЁ0-9]+)*$/.test(trimmed);

    // Пропускаем очень короткие слова (менее 2 символов) и стоп-слова
    const stopWords = ['и', 'в', 'на', 'с', 'по', 'за', 'из', 'от', 'к', 'до', 'для', 'при', 'о', 'об', 'а', 'но', 'да', 'или', 'либо', 'то', 'что', 'как', 'так', 'уже', 'еще', 'бы', 'же'];
    const isStopWord = stopWords.includes(trimmed.toLowerCase());
    const isTooShort = trimmed.length < 2;

    if (isWordLike && !isStopWord && !isTooShort) {
      // Кликабельное слово
      nodes.push(
        <span
          key={`${key}-segment-${segmentKey++}`}
          className="cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors px-0.5 rounded select-none"
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие события
            onWordClick(trimmed, e, context);
          }}
          title={`Нажмите для описания слова "${trimmed}"`}
        >
          {segment}
        </span>
      );
    } else {
      // Обычный текст (пробелы, знаки препинания, стоп-слова)
      nodes.push(
        <span key={`${key}-segment-${segmentKey++}`}>
          {segment}
        </span>
      );
    }
  });

  return <span key={key}>{nodes}</span>;
};

// Функция для рендеринга inline Markdown (жирный, курсив, код)
const renderInlineMarkdown = (
  text: string,
  depth: number = 0,
  onWordClick?: (word: string, event: React.MouseEvent, context: string) => void,
  context?: string
): React.ReactNode => {
  if (!text) return null;
  // Предотвращаем бесконечную рекурсию
  if (depth > 5) return text;

  const nodes: React.ReactNode[] = [];
  let nodeKey = 0;

  // Разделяем текст на части: обычный текст, жирный текст, код
  // Обрабатываем по порядку приоритета: код > жирный > обычный
  
  const parts: Array<{ type: 'text' | 'bold' | 'code'; content: string; start: number; end: number }> = [];
  
  // 1. Находим все блоки кода (приоритет 1)
  const codeRegex = /`([^`]+)`/g;
  let match;
  while ((match = codeRegex.exec(text)) !== null) {
    parts.push({
      type: 'code',
      content: match[1],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // 2. Находим все жирные блоки, исключая те, что внутри кода
  const boldRegex = /\*\*([^*]+?)\*\*|__([^_]+?)__/g;
  while ((match = boldRegex.exec(text)) !== null) {
    // Проверяем, не находится ли это внутри блока кода
    const isInsideCode = parts.some(p => 
      p.type === 'code' && match.index >= p.start && match.index < p.end
    );
    
    // Проверяем, не пересекается ли с другим жирным блоком
    const overlapsBold = parts.some(p => 
      p.type === 'bold' && 
      (match.index < p.end && match.index + match[0].length > p.start)
    );
    
    if (!isInsideCode && !overlapsBold) {
      parts.push({
        type: 'bold',
        content: match[1] || match[2],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  // Удаляем пересекающиеся части (приоритет: код > жирный)
  const filteredParts: typeof parts = [];
  parts.forEach((part) => {
    if (part.type === 'code') {
      filteredParts.push(part);
    } else {
      // Проверяем, не пересекается ли с кодом
      const overlapsCode = filteredParts.some(p => 
        p.type === 'code' && 
        (part.start < p.end && part.end > p.start)
      );
      if (!overlapsCode) {
        filteredParts.push(part);
      }
    }
  });

  // Сортируем по позиции
  filteredParts.sort((a, b) => a.start - b.start);

  // Строим результат, обрабатывая части по порядку
  let lastIndex = 0;
  
  filteredParts.forEach((part) => {
    // Пропускаем, если часть начинается до текущей позиции (пересечение)
    if (part.start < lastIndex) {
      return;
    }

  // Добавляем текст до текущей части
  if (part.start > lastIndex) {
    const textBefore = text.substring(lastIndex, part.start);
    if (textBefore) {
      nodes.push(renderClickableText(textBefore, `text-${nodeKey++}`, onWordClick, context));
    }
  }

    // Добавляем саму часть
    if (part.type === 'code') {
      nodes.push(
        <code
          key={`inline-code-${nodeKey++}`}
          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary"
        >
          {part.content}
        </code>
      );
    } else if (part.type === 'bold') {
    // Жирный текст обрабатываем рекурсивно (только для вложенных элементов, не для дубликатов)
    const boldContent = part.content.includes('**') || part.content.includes('__')
      ? renderInlineMarkdown(part.content, depth + 1, onWordClick, context)
      : part.content;
      nodes.push(
        <strong key={`bold-${nodeKey++}`} className="font-bold text-foreground">
          {boldContent}
        </strong>
      );
    }

    lastIndex = Math.max(lastIndex, part.end);
  });

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    if (textAfter) {
      nodes.push(renderClickableText(textAfter, `text-${nodeKey++}`, onWordClick, context));
    }
  }

  // Если не было специальных частей, возвращаем кликабельный текст
  return nodes.length > 0 ? <>{nodes}</> : renderClickableText(text, `text-${nodeKey}`, onWordClick, context);
};

// Функция для рендеринга математических выражений в тексте
const renderMathInText = (text: string): React.ReactNode => {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  let nodeKey = 0;
  let lastIndex = 0;

  // Регулярные выражения для поиска математических выражений
  // \[ ... \] для блочных выражений
  const blockMathRegex = /\[([\s\S]*?)\]/g;
  // \( ... \) для inline выражений
  const inlineMathRegex = /\\\((.*?)\\\)/g;

  // Собираем все математические выражения
  const mathExpressions: Array<{
    type: 'block' | 'inline';
    content: string;
    start: number;
    end: number;
  }> = [];

  // Ищем блочные выражения
  let match;
  while ((match = blockMathRegex.exec(text)) !== null) {
    mathExpressions.push({
      type: 'block',
      content: match[1],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Ищем inline выражения
  while ((match = inlineMathRegex.exec(text)) !== null) {
    mathExpressions.push({
      type: 'inline',
      content: match[1],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Сортируем по позиции
  mathExpressions.sort((a, b) => a.start - b.start);

  // Удаляем пересекающиеся выражения (приоритет блочным)
  const filteredExpressions = mathExpressions.filter((expr, index) => {
    if (expr.type === 'block') return true;
    // Проверяем, не пересекается ли с блочным выражением
    return !mathExpressions.some((other, otherIndex) =>
      otherIndex !== index &&
      other.type === 'block' &&
      expr.start < other.end &&
      expr.end > other.start
    );
  });

  // Строим результат
  filteredExpressions.forEach((expr) => {
    // Добавляем текст до выражения
    if (expr.start > lastIndex) {
      const textBefore = text.substring(lastIndex, expr.start);
      if (textBefore) {
        nodes.push(<span key={`text-${nodeKey++}`}>{textBefore}</span>);
      }
    }

    // Добавляем математическое выражение
    try {
      if (expr.type === 'block') {
        nodes.push(
          <div key={`math-block-${nodeKey++}`} className="my-4 flex justify-center">
            <BlockMath math={expr.content} />
          </div>
        );
      } else {
        nodes.push(
          <InlineMath key={`math-inline-${nodeKey++}`} math={expr.content} />
        );
      }
    } catch (error) {
      // Если не удалось распарсить, показываем как обычный текст
      console.warn('Math rendering error:', error);
      nodes.push(
        <code key={`math-error-${nodeKey++}`} className="bg-muted px-1 py-0.5 rounded text-sm">
          {expr.type === 'block' ? `[${expr.content}]` : `(${expr.content})`}
        </code>
      );
    }

    lastIndex = expr.end;
  });

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    if (textAfter) {
      nodes.push(<span key={`text-${nodeKey++}`}>{textAfter}</span>);
    }
  }

  return nodes.length > 0 ? <>{nodes}</> : text;
};

// Функция для обработки математических выражений в React узлах
const renderMathInReactNodes = (nodes: React.ReactNode): React.ReactNode => {
  if (!nodes) return null;

  // Рекурсивно обрабатываем все узлы
  const processNode = (node: React.ReactNode, key?: string | number): React.ReactNode => {
    if (typeof node === 'string') {
      // Если это строка, обрабатываем математические выражения
      return renderMathInText(node);
    } else if (React.isValidElement(node)) {
      // Если это React элемент, рекурсивно обрабатываем его дочерние элементы
      const children = React.Children.map(node.props.children, (child, childKey) =>
        processNode(child, childKey)
      );
      return React.cloneElement(node, { key }, children);
    } else if (Array.isArray(node)) {
      // Если это массив, обрабатываем каждый элемент
      return node.map((item, index) => processNode(item, index));
    }
    return node;
  };

  return processNode(nodes);
};

// Функция для простого рендеринга markdown в tooltip'е
const renderTooltipMarkdown = (text: string): React.ReactNode => {
  if (!text || text === 'Загрузка...') return text;

  const nodes: React.ReactNode[] = [];
  let nodeKey = 0;
  let lastIndex = 0;

  // Регулярные выражения для основных markdown элементов
  const patterns = [
    // Жирный текст **text** или __text__
    { regex: /(\*\*|__)(.*?)\1/g, render: (match: string, content: string) =>
      <strong key={`bold-${nodeKey++}`} className="font-bold text-foreground">{content}</strong>
    },
    // Курсив *text* или _text_
    { regex: /(\*|_)(.*?)\1/g, render: (match: string, content: string) =>
      <em key={`italic-${nodeKey++}`} className="italic text-foreground">{content}</em>
    },
    // Код `text`
    { regex: /`([^`]+)`/g, render: (match: string, content: string) =>
      <code key={`code-${nodeKey++}`} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{content}</code>
    },
    // Кавычки «text»
    { regex: /«([^»]+)»/g, render: (match: string, content: string) =>
      <span key={`quote-${nodeKey++}`}>"{content}"</span>
    }
  ];

  // Собираем все совпадения
  const matches: Array<{
    start: number;
    end: number;
    render: (match: string, content: string) => React.ReactNode;
    match: string;
    content: string;
  }> = [];

  patterns.forEach(({ regex, render }) => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        render,
        match: match[0],
        content: match[2] || match[1]
      });
    }
  });

  // Сортируем по позиции
  matches.sort((a, b) => a.start - b.start);

  // Удаляем пересекающиеся совпадения (приоритет: жирный > курсив > код)
  const filteredMatches = matches.filter((match, index) => {
    return !matches.some((other, otherIndex) =>
      otherIndex !== index &&
      match.start < other.end &&
      match.end > other.start &&
      other !== match
    );
  });

  // Строим результат
  filteredMatches.forEach((match) => {
    // Добавляем текст до совпадения
    if (match.start > lastIndex) {
      const textBefore = text.substring(lastIndex, match.start);
      if (textBefore.trim()) {
        nodes.push(<span key={`text-${nodeKey++}`}>{textBefore}</span>);
      }
    }

    // Добавляем отрендеренный элемент
    nodes.push(match.render(match.match, match.content));
    lastIndex = match.end;
  });

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    if (textAfter.trim()) {
      nodes.push(<span key={`text-${nodeKey++}`}>{textAfter}</span>);
    }
  }

  return nodes.length > 0 ? <>{nodes}</> : text;
};

// Компонент для всплывающего окна с описанием слова
const WordTooltip = ({
  word,
  description,
  position,
  onClose
}: {
  word: string;
  description: string;
  position: { x: number; y: number };
  onClose: () => void;
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  // Убрано автозакрытие - tooltip закрывается только по кнопке ✕

  return (
    <div
      className="fixed z-50 bg-background border border-border rounded-lg shadow-lg p-3 max-w-xs"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-primary text-sm">"{word}"</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground ml-2 text-xs"
          title="Закрыть"
        >
          ✕
        </button>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {description === 'Загрузка...' ? (
          <span className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-3 w-3 border border-primary border-t-transparent" />
            {description}
          </span>
        ) : (
          renderTooltipMarkdown(description)
        )}
      </div>
    </div>
  );
};

// Компонент для рендеринга текста с блоками кода, Markdown и математическими формулами
const TextWithCodeBlocks = ({
  text,
  selectedModel,
  onWordClick,
  context
}: {
  text: string;
  selectedModel?: string;
  onWordClick?: (word: string, event: React.MouseEvent, context: string) => void;
  context?: string;
}) => {
  const parts = parseTextWithCodeBlocks(text, selectedModel);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return <CodeBlock key={index} code={part.content} language={part.language} />;
        } else {
          return (
            <div key={index} className="prose prose-sm max-w-none">
              {renderMathInReactNodes(parseMarkdown(part.content, onWordClick, context))}
            </div>
          );
        }
      })}
    </>
  );
};

const ChatMessage = ({ message, selectedModel }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [tooltip, setTooltip] = useState<{
    word: string;
    description: string;
    position: { x: number; y: number };
  } | null>(null);
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);

  // TTS state
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Функция для преобразования контента для отображения (заменяет JSON на читаемый текст)
  const renderForUser = useMemo(() => {
    return (txt: string) => {
      if (isUser) return txt; // пользовательские сообщения не трогаем
      return renderPlanJsonForDisplay(txt).displayText;
    };
  }, [isUser]);

  // Cleanup audio on unmount
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Функция для генерации описания слова в контексте
  const generateWordDescription = async (word: string, context: string) => {
    setIsLoadingDescription(true);
    try {
      const prompt = `Дай краткое и точное определение слова "${word}" в контексте этого текста: "${context}". Ответ должен быть на русском языке, не более 2-3 предложений.`;

      console.log('🔍 Генерируем описание для слова:', word);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'lite',
          stream: true, // Включаем стриминг для плавного отображения
          userId: 1,
          sessionId: Date.now() // Уникальный sessionId для каждого запроса
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Обрабатываем стриминг
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let description = '';
      let buffer = '';
      let hasReceivedData = false;

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Оставляем неполную строку в буфере

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith('data: ')) {
                try {
                  const jsonStr = trimmedLine.slice(6);
                  if (jsonStr === '[DONE]') continue;

                  const data = JSON.parse(jsonStr);
                  console.log('📦 Получен чанк:', data);
                  hasReceivedData = true;

                  if (data.choices && data.choices[0]?.delta?.content) {
                    const content = data.choices[0].delta.content;
                    description += content;
                    // Обновляем тултип в реальном времени
                    setTooltip(prev => prev ? { ...prev, description } : null);
                  } else if (data.content) {
                    // Альтернативный формат
                    description += data.content;
                    setTooltip(prev => prev ? { ...prev, description } : null);
                  }
                } catch (e) {
                  console.log('⚠️ Не удалось распарсить чанк:', trimmedLine, e);
                }
              }
            }
          }
        } catch (streamError) {
          console.error('❌ Ошибка стриминга, пробуем обычный запрос:', streamError);
          // Fallback: пробуем обычный запрос без стриминга
          try {
            const fallbackResponse = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                model: 'lite',
                stream: false
              })
            });

            if (fallbackResponse.ok) {
              const data = await fallbackResponse.json();
              description = data.content || data.response || 'Описание не найдено';
              setTooltip(prev => prev ? { ...prev, description } : null);
            }
          } catch (fallbackError) {
            console.error('❌ Fallback тоже не сработал:', fallbackError);
          }
        }
      }

      if (!hasReceivedData && description === '') {
        console.log('⚠️ Стриминг не дал данных, пробуем обычный запрос');
        // Если стриминг не дал результатов, пробуем обычный запрос
        try {
          const fallbackResponse = await fetch('https://ai.windexs.ru/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              model: 'lite',
              stream: false
            })
          });

          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            description = data.content || data.response || 'Описание не найдено';
          }
        } catch (fallbackError) {
          console.error('❌ Обычный запрос тоже не сработал:', fallbackError);
          description = 'Не удалось получить описание';
        }
      }

      console.log('✅ Описание сгенерировано:', description);
      return description || 'Описание не найдено';

    } catch (error) {
      console.error('❌ Ошибка при генерации описания слова:', error);
      return `Не удалось получить описание для слова "${word}".`;
    } finally {
      setIsLoadingDescription(false);
    }
  };

  // Функция копирования текста сообщения
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      // Можно добавить toast уведомление здесь
      console.log('✅ Текст скопирован в буфер обмена');
    } catch (error) {
      console.error('❌ Не удалось скопировать текст:', error);
      // Fallback для старых браузеров
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };


  // Функция обработки клика на слово
  const handleWordClick = async (word: string, event: React.MouseEvent, context: string) => {
    if (isLoadingDescription) {
      console.log('⏳ Уже загружается описание, пропускаем');
      return; // Предотвращаем множественные запросы
    }

    console.log('🎯 Клик на слово:', word, 'в контексте:', context.substring(0, 100) + '...');

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.top - 10, // Показываем над словом
    };

    setTooltip({
      word,
      description: 'Загрузка...',
      position,
    });

    const description = await generateWordDescription(word, message.content);
    console.log('📝 Финальное описание для слова', word, ':', description);
    setTooltip(prev => prev ? { ...prev, description } : null);
  };

  // TTS functionality
  const generateTTS = async () => {
    if (!message.content.trim()) return;

    setIsGeneratingTTS(true);
    try {
      // Определяем язык текста (простая эвристика)
      const hasCyrillic = /[а-яё]/i.test(message.content);

      const result = hasCyrillic
        ? await ttsClient.generateTTSRu(message.content)
        : await ttsClient.generateTTSEn(message.content);
      setAudioUrl(result.audioUrl);

      // Создаем аудио элемент и настраиваем обработчики
      const audio = new Audio(result.audioUrl);
      audioRef.current = audio;

      audio.addEventListener('play', () => setIsPlayingAudio(true));
      audio.addEventListener('pause', () => setIsPlayingAudio(false));
      audio.addEventListener('ended', () => setIsPlayingAudio(false));
      audio.addEventListener('error', () => {
        setIsPlayingAudio(false);
        console.error('❌ Audio playback error');
      });

      // Автоматически воспроизводим аудио
      await audio.play();
    } catch (error) {
      console.error('❌ TTS generation failed:', error);
      setIsPlayingAudio(false);
      // Не показываем ошибку пользователю, просто логируем
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const playAudio = async () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } else {
      await generateTTS();
    }
  };

  // Парсим конфигурацию визуализации из текста сообщения
  const visualizationConfig = useMemo(() => {
    if (isUser) return null; // Визуализации только в сообщениях AI
    return parseVisualizationConfig(message.content);
  }, [message.content, isUser]);

  // Разделяем текст на части до и после визуализации
  const messageParts = useMemo(() => {
    if (!visualizationConfig) return [message.content];

    // Ищем ВСЕ JSON блоки и берем ПОСЛЕДНИЙ для разделения
    const jsonMatches = Array.from(message.content.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g));

    if (jsonMatches.length > 0) {
      const lastMatch = jsonMatches[jsonMatches.length - 1];
      const matchIndex = lastMatch.index;
      const matchLength = lastMatch[0].length;

      // Разделяем текст до и после последнего JSON блока
      const beforeJson = message.content.substring(0, matchIndex).trim();
      const afterJson = message.content.substring(matchIndex + matchLength).trim();

      // Если текст до JSON содержит только описание визуализации, не показываем его
      const cleanBeforeJson = beforeJson
        .replace(/^(Вот визуализация данных?:?|Визуализация:?|График:?|Диаграмма:?)/i, '')
        .trim();

      return [cleanBeforeJson, afterJson].filter(Boolean);
    }

    return [message.content];
  }, [message.content, visualizationConfig]);

  return (
    <div className={`flex items-start gap-4 mb-6 animate-fade-in ${
      isUser ? "justify-end" : "justify-start"
    }`}>
      {!isUser && (
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
            AI
          </div>
          <button
            onClick={playAudio}
            disabled={isGeneratingTTS}
            className="p-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isPlayingAudio ? "Остановить воспроизведение" : "Прослушать сообщение"}
          >
            {isGeneratingTTS ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlayingAudio ? (
              <div className="h-4 w-4 flex items-center justify-center">
                <div className="w-1 h-3 bg-current animate-pulse mx-0.5"></div>
                <div className="w-1 h-2 bg-current animate-pulse mx-0.5"></div>
                <div className="w-1 h-3 bg-current animate-pulse mx-0.5"></div>
              </div>
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
      <div className={`flex-1 pt-1 ${isUser ? "max-w-[70%]" : "max-w-[80%]"}`}>
        <div className={`rounded-lg px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground ml-auto"
            : "bg-secondary text-secondary-foreground"
        }`}>
          {/* Если есть визуализация, показываем текст до/после */}
          {visualizationConfig ? (
            <>
              {/* Текст до визуализации */}
              {messageParts[0] && (
                <div className="mb-4">
                  <TextWithCodeBlocks
                    text={renderForUser(messageParts[0])}
                    selectedModel={selectedModel}
                    onWordClick={!isUser ? handleWordClick : undefined}
                    context={message.content}
                  />
                </div>
              )}

              {/* Визуализация */}
              <div className="my-4">
                <DataVisualization config={visualizationConfig} />
              </div>

              {/* Текст после визуализации */}
              {messageParts[1] && (
                <div className="mt-4">
                  <TextWithCodeBlocks
                    text={renderForUser(messageParts[1])}
                    selectedModel={selectedModel}
                    onWordClick={!isUser ? handleWordClick : undefined}
                    context={message.content}
                  />
                </div>
              )}
            </>
          ) : (
            /* Если нет визуализации, показываем весь текст */
            <TextWithCodeBlocks
              text={renderForUser(message.content)}
              selectedModel={selectedModel}
              onWordClick={!isUser ? handleWordClick : undefined}
              context={message.content}
            />
          )}
        </div>

        {/* Кнопки для сообщений от ассистента */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 opacity-60 hover:opacity-100 transition-opacity">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
              title="Копировать текст"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Копировать</span>
            </button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-semibold shrink-0">
          Вы
        </div>
      )}

      {/* Всплывающее окно с описанием слова */}
      {tooltip && (
        <WordTooltip
          word={tooltip.word}
          description={tooltip.description}
          position={tooltip.position}
          onClose={() => setTooltip(null)}
        />
      )}
    </div>
  );
};

export default ChatMessage;
