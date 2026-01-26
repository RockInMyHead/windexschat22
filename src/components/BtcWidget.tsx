import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, Clock } from "lucide-react";
import {
  createChart,
  IChartApi,
  ILineSeries,
  CandlestickData,
  LineData,
  ColorType
} from "lightweight-charts";
import { getBtcQuote, getBtcChart, formatPrice, formatChange, formatTime, type MarketQuote, type MarketChart } from "@/lib/market";

interface BtcWidgetProps {
  compact?: boolean;
  showChart?: boolean;
  defaultDays?: number;
}

export const BtcWidget = ({
  compact = false,
  showChart = true,
  defaultDays = 1
}: BtcWidgetProps) => {
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [chart, setChart] = useState<MarketChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartDays, setChartDays] = useState(defaultDays);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ILineSeries | null>(null);

  // Загрузка котировки
  const loadQuote = async () => {
    try {
      const data = await getBtcQuote();
      setQuote(data);
      setError(null);
      setIsRateLimited(data.rateLimited || data.stale || false);
    } catch (err) {
      setError("Не удалось загрузить котировку");
      console.error("Quote loading error:", err);
      setIsRateLimited(false);
    }
  };

  // Загрузка графика
  const loadChart = async (days: number) => {
    if (!showChart) return;
    try {
      const data = await getBtcChart(days);
      setChart(data);
      // Обновляем статус rate limiting если нужно
      if (data.rateLimited || data.stale) {
        setIsRateLimited(true);
      }
    } catch (err) {
      console.error("Chart loading error:", err);
    }
  };

  // Инициализация данных
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadQuote(), loadChart(chartDays)]);
      setLoading(false);
    };

    loadData();

    // Автообновление каждые 30 секунд
    const interval = setInterval(loadQuote, 30000);
    return () => clearInterval(interval);
  }, [chartDays, showChart]);

  // Инициализация графика
  useEffect(() => {
    if (!showChart || !chartContainerRef.current || !chart?.series.length) return;

    // Создание графика
    const chartInstance = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      width: chartContainerRef.current.clientWidth,
      height: compact ? 200 : 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
    });

    // Создание линейной серии
    const lineSeries = chartInstance.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Преобразование данных для графика
    const chartData: LineData[] = chart.series.map(([timestamp, price]) => ({
      time: Math.floor(timestamp / 1000) as any, // lightweight-charts ожидает unix timestamp
      value: price,
    }));

    lineSeries.setData(chartData);

    // Автомасштабирование
    chartInstance.timeScale().fitContent();

    chartRef.current = chartInstance;
    lineSeriesRef.current = lineSeries;

    // Обработка изменения размера
    const handleResize = () => {
      if (chartContainerRef.current && chartInstance) {
        chartInstance.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.remove();
    };
  }, [chart, compact, showChart]);

  // Обновление данных графика
  useEffect(() => {
    if (!lineSeriesRef.current || !chart?.series.length) return;

    const chartData: LineData[] = chart.series.map(([timestamp, price]) => ({
      time: Math.floor(timestamp / 1000) as any,
      value: price,
    }));

    lineSeriesRef.current.setData(chartData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [chart]);

  if (loading && !quote) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
          {showChart && <Skeleton className="h-48 w-full" />}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 border-destructive">
        <div className="text-destructive text-sm">{error}</div>
      </Card>
    );
  }

  const priceChange = quote?.quote.usd_24h_change || 0;
  const isPositive = priceChange >= 0;

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-500" />
            <span className="font-semibold">Bitcoin (BTC)</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {quote?.provider}
          </Badge>
        </div>

        {/* Цена */}
        <div className="space-y-1">
          <div className="text-2xl font-bold">
            {quote ? formatPrice(quote.quote.usd) : '—'}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {priceChange !== 0 && (
              <div className={`flex items-center gap-1 ${isPositive ? '' : 'text-red-600'}`} style={isPositive ? { color: '#1e983a' } : {}}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {formatChange(priceChange)}
              </div>
            )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {quote ? formatTime(quote.asOf) : '—'}
          </div>
          <div className="flex gap-1">
            {quote?.cached && (
              <Badge variant="secondary" className="text-xs">кэш</Badge>
            )}
            {isRateLimited && (
              <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                лимит API
              </Badge>
            )}
          </div>
          </div>
        </div>

        {/* Кнопки диапазонов */}
        {showChart && (
          <div className="flex gap-2">
            {[1, 7, 30, 90].map((days) => (
              <Button
                key={days}
                variant={chartDays === days ? "default" : "outline"}
                size="sm"
                onClick={() => setChartDays(days)}
                disabled={loading}
              >
                {days === 1 ? '1Д' : days === 7 ? '7Д' : days === 30 ? '1М' : '3М'}
              </Button>
            ))}
          </div>
        )}

        {/* График */}
        {showChart && (
          <div className="space-y-2">
            <div
              ref={chartContainerRef}
              className="w-full bg-gray-900 rounded border"
              style={{ height: compact ? '200px' : '300px' }}
            />
            {(chart?.cached || isRateLimited) && (
              <div className="text-xs text-muted-foreground text-center space-y-1">
                {isRateLimited ? (
                  <div className="text-orange-600">
                    ⚠️ Превышен лимит запросов • Показаны последние доступные данные
                  </div>
                ) : (
                  <div>
                    Данные из кэша • Обновление каждые 5 мин
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Дополнительная информация */}
        {!compact && quote && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t text-sm">
            <div>
              <div className="text-muted-foreground">Объем 24ч</div>
              <div className="font-medium">
                {quote.quote.usd_24h_vol ? formatPrice(quote.quote.usd_24h_vol, 'usd') : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Капитализация</div>
              <div className="font-medium">
                {quote.quote.usd_market_cap ? formatPrice(quote.quote.usd_market_cap, 'usd') : '—'}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};