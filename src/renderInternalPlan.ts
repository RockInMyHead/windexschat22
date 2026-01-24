// src/lib/renderInternalPlan.ts
export type PlanStep = {
  step?: string;
  description?: string;
  // допускаем любые поля, чтобы не падать на расширениях модели
  [k: string]: unknown;
};

export type RenderPlanResult = {
  displayText: string;
  planJson?: PlanStep[];
};

/**
 * Ищет В ПЕРВОМ попавшемся ```json ... ``` блоке массив шагов вида:
 * [{ step: string, description: string, ... }, ...]
 * Если найдено и распарсилось — заменяет код-блок на читаемый текст.
 * Если нет — возвращает исходный text без изменений.
 *
 * ВАЖНО: raw JSON остаётся в исходном message.content (мы его не трогаем),
 * эта функция используется ТОЛЬКО для UI-рендера.
 */
export function renderPlanJsonForDisplay(text: string): RenderPlanResult {
  if (!text) return { displayText: text };

  const rx = /```json\s*\n([\s\S]*?)\n```/i;
  const m = text.match(rx);
  if (!m) return { displayText: text };

  const jsonRaw = m[1]?.trim();
  if (!jsonRaw) return { displayText: text };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonRaw);
  } catch {
    return { displayText: text };
  }

  if (!Array.isArray(parsed)) return { displayText: text };

  // Валидация "похоже на план"
  const steps = parsed as PlanStep[];
  const looksLikePlan = steps.length > 0 && steps.every((s) => {
    const stepOk = typeof s?.step === "string" && s.step.trim().length > 0;
    const descOk = typeof s?.description === "string" && s.description.trim().length > 0;
    // допускаем, что description может отсутствовать, но step должен быть
    return stepOk && (descOk || s.description === undefined);
  });

  if (!looksLikePlan) return { displayText: text };

  // Формируем текст для пользователя
  const lines: string[] = [];
  for (const s of steps) {
    const title = String(s.step || "").trim();
    const desc = (typeof s.description === "string" ? s.description : "").trim();

    // Вариант "как вы хотите": одна строка заголовка + строка описания
    lines.push(`• ${title}`);
    if (desc) lines.push(`  ${desc}`);
  }

  const pretty = `📋 План:\n\n${lines.join("\n")}`;

  // Заменяем только найденный json code block (остальной текст сохраняем)
  const displayText = text.replace(rx, pretty);

  return { displayText, planJson: steps };
}

/**
 * Для внутренних операций: извлечь JSON-план из raw текста (message.content).
 * UI может не показывать JSON, но он всё равно остаётся в message.content.
 */
export function extractPlanJson(text: string): PlanStep[] | null {
  const rx = /```json\s*\n([\s\S]*?)\n```/i;
  const m = text.match(rx);
  if (!m) return null;

  try {
    const parsed = JSON.parse((m[1] || "").trim());
    return Array.isArray(parsed) ? (parsed as PlanStep[]) : null;
  } catch {
    return null;
  }
}
