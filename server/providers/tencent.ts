import type { DailyBar, IntradayPoint, ProviderQuote, StockRef, StockSearchItem } from '../../shared/types.js';
import { requestJson, requestText, round, safeNumber } from '../http.js';
import type { MarketDataProvider } from './types.js';

interface TencentQuoteResponse {
  code: number;
  data?: Record<string, { qfqday?: string[][]; day?: string[][]; qt?: Record<string, string[]> }>;
}

interface TencentMinuteResponse {
  code: number;
  data?: Record<string, { data?: { data?: string[] } }>;
}

export class TencentProvider implements MarketDataProvider {
  id = 'tencent' as const;
  label = '腾讯行情';

  async search(_query: string): Promise<StockSearchItem[]> {
    // 腾讯没有稳定的名称搜索接口；名称搜索由东方财富统一完成，行情仍由双源校验。
    return [];
  }

  async fetchQuote(stock: StockRef): Promise<ProviderQuote> {
    const url = `https://qt.gtimg.cn/q=${stock.tencentCode}`;
    const { text, latencyMs } = await requestText(url, { encoding: 'gb18030' });
    const match = text.match(/="(.*)"/s);
    if (!match) throw new Error('腾讯行情响应格式异常');
    const values = match[1].split('~');
    const price = safeNumber(values[3]);
    const prevClose = safeNumber(values[4]);
    const rawTime = values[30] ?? '';
    const timestamp = rawTime.length >= 14
      ? `${rawTime.slice(0, 4)}-${rawTime.slice(4, 6)}-${rawTime.slice(6, 8)}T${rawTime.slice(8, 10)}:${rawTime.slice(10, 12)}:${rawTime.slice(12, 14)}+08:00`
      : new Date().toISOString();
    return {
      source: this.id,
      sourceLabel: this.label,
      price,
      prevClose,
      open: safeNumber(values[5]),
      high: safeNumber(values[33]),
      low: safeNumber(values[34]),
      volume: safeNumber(values[6]) * 100,
      amount: safeNumber(values[37]) * 10_000,
      change: safeNumber(values[31], price - prevClose),
      changePct: safeNumber(values[32]),
      turnoverRate: safeNumber(values[38]),
      pe: safeNumber(values[39]) || undefined,
      timestamp,
      fetchedAt: new Date().toISOString(),
      latencyMs
    };
  }

  async fetchDaily(stock: StockRef, limit: number): Promise<DailyBar[]> {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${stock.tencentCode},day,,,${limit},qfq`;
    const { data } = await requestJson<TencentQuoteResponse>(url);
    const rows = data.data?.[stock.tencentCode]?.qfqday ?? data.data?.[stock.tencentCode]?.day ?? [];
    return rows.map((row) => ({
      date: row[0],
      open: safeNumber(row[1]),
      close: safeNumber(row[2]),
      high: safeNumber(row[3]),
      low: safeNumber(row[4]),
      volume: safeNumber(row[5]) * 100,
      amount: safeNumber(row[6])
    }));
  }

  async fetchIntraday(stock: StockRef): Promise<IntradayPoint[]> {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${stock.tencentCode}`;
    const { data } = await requestJson<TencentMinuteResponse>(url);
    const rows = data.data?.[stock.tencentCode]?.data?.data ?? [];
    let previousVolume = 0;
    let previousAmount = 0;
    return rows.map((row) => {
      const [rawTime, priceText, volumeText, amountText] = row.split(' ');
      const cumulativeVolume = safeNumber(volumeText) * 100;
      const cumulativeAmount = safeNumber(amountText);
      const volume = Math.max(0, cumulativeVolume - previousVolume);
      const amount = Math.max(0, cumulativeAmount - previousAmount);
      previousVolume = cumulativeVolume;
      previousAmount = cumulativeAmount;
      const avgPrice = cumulativeVolume ? cumulativeAmount / cumulativeVolume : safeNumber(priceText);
      return {
        time: `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}`,
        price: safeNumber(priceText),
        avgPrice: round(avgPrice),
        high: safeNumber(priceText),
        low: safeNumber(priceText),
        volume,
        amount
      };
    });
  }
}
