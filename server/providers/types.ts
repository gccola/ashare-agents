import type { DailyBar, IntradayPoint, ProviderQuote, StockRef, StockSearchItem } from '../../shared/types.js';

export interface MarketDataProvider {
  id: 'eastmoney' | 'tencent';
  label: string;
  search(query: string): Promise<StockSearchItem[]>;
  fetchQuote(stock: StockRef): Promise<ProviderQuote>;
  fetchDaily(stock: StockRef, limit: number): Promise<DailyBar[]>;
  fetchIntraday(stock: StockRef): Promise<IntradayPoint[]>;
}
