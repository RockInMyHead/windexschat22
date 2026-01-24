export interface MarketQuote {
  symbol: string;
  provider: string;
  asOf: number;
  quote: {
    usd: number;
    eur?: number;
    rub?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
    last_updated_at?: number;
  };
  cached: boolean;
}

export interface MarketChart {
  symbol: string;
  provider: string;
  asOf: number;
  vs: string;
  series: [number, number][]; // [timestamp, price][]
  cached: boolean;
}

export async function getBtcQuote(vs: string[] = ["usd", "eur", "rub"]): Promise<MarketQuote> {
  const vsParam = vs.join(",");
  try {
    const response = await fetch(`/api/market/quote?vs=${vsParam}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Market quote API error:', error);
    throw error;
  }
}

export async function getBtcChart(days: number = 1, vs: string = "usd"): Promise<MarketChart> {
  try {
    const response = await fetch(`/api/market/chart?vs=${vs}&days=${days}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Market chart API error:', error);
    throw error;
  }
}

// Утилиты для форматирования
export function formatPrice(price: number, currency: string = "USD"): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: currency.toLowerCase() === 'usd' ? 2 : 0,
  });
  return formatter.format(price);
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

// Детектор запросов про котировки
export function isMarketQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Проверяем на упоминание биткойна в различных формах
  const hasBitcoin = lowerQuery.includes('биткойн') ||
                     lowerQuery.includes('биткоин') ||
                     lowerQuery.includes('bitcoin') ||
                     lowerQuery.includes('btc');

  // Проверяем на слова, указывающие на запрос цены/курса
  const hasPriceQuery = lowerQuery.includes('курс') ||
                       lowerQuery.includes('цена') ||
                       lowerQuery.includes('стоимость') ||
                       lowerQuery.includes('стоит') ||
                       lowerQuery.includes('сколько') ||
                       lowerQuery.includes('rate') ||
                       lowerQuery.includes('price') ||
                       lowerQuery.includes('cost');

  return hasBitcoin && hasPriceQuery;
}