import type {
  DashboardData,
  DailyBar,
  IntradayPoint,
  NewsItem,
  ProviderQuote,
  Quote,
  StockRef,
  StockSearchItem
} from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { TtlCache } from '../cache.js';
import { EastmoneyProvider } from '../providers/eastmoney.js';
import { TencentProvider } from '../providers/tencent.js';
import type { MarketDataProvider } from '../providers/types.js';
import { calculateIndicators } from './indicators.js';
import { scoreNews } from './news.js';
import { addKlineValidation, buildQuoteValidation } from './validation.js';

const eastmoney = new EastmoneyProvider();
const tencent = new TencentProvider();
const providerMap: Record<string, MarketDataProvider> = { eastmoney, tencent };
const cache = new TtlCache();

function inferExchange(code: string): StockRef['exchange'] {
  if (/^(6|5)/.test(code)) return 'SH';
  if (/^(0|1|2|3)/.test(code)) return 'SZ';
  return 'BJ';
}

function fallbackStock(code: string): StockRef {
  const exchange = inferExchange(code);
  const marketId = exchange === 'SH' ? '1' : '0';
  const prefix = exchange === 'SH' ? 'sh' : exchange === 'SZ' ? 'sz' : 'bj';
  return { code, name: code, exchange, secid: `${marketId}.${code}`, tencentCode: `${prefix}${code}` };
}

export async function searchStocks(query: string): Promise<StockSearchItem[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const key = `search:${normalized.toLowerCase()}`;
  const cached = cache.get<StockSearchItem[]>(key);
  if (cached.hit) return cached.value;
  try {
    const items = await eastmoney.search(normalized);
    cache.set(key, items, 600);
    return items;
  } catch {
    if (/^\d{6}$/.test(normalized)) {
      const stock = fallbackStock(normalized);
      return [{ ...stock, securityType: 'A股', display: `${stock.code} · ${stock.exchange}` }];
    }
    throw new Error('股票搜索服务暂时不可用');
  }
}

export async function resolveStock(query: string): Promise<StockRef> {
  const normalized = query.trim();
  if (!normalized) throw new Error('请输入股票代码或名称');
  if (/^\d{6}$/.test(normalized)) {
    const items = await searchStocks(normalized);
    const exact = items.find((item) => item.code === normalized);
    if (exact) return exact;
    return fallbackStock(normalized);
  }
  const items = await searchStocks(normalized);
  if (!items.length) throw new Error(`未找到股票“${normalized}”`);
  return items[0];
}

function enabledProviders(config: AppConfig): MarketDataProvider[] {
  return config.marketData.sources.map((id) => providerMap[id]).filter(Boolean);
}

async function fetchProviderQuotes(stock: StockRef, config: AppConfig): Promise<{
  quotes: ProviderQuote[];
  sourceStatus: Array<{ id: string; label: string; status: 'ok' | 'error' | 'disabled'; latencyMs: number | null; error?: string }>;
  cached: boolean;
}> {
  const key = `quotes:${stock.secid}:${config.marketData.sources.join(',')}`;
  const cached = cache.get<{ quotes: ProviderQuote[]; sourceStatus: ReturnType<typeof buildQuoteValidation>['validation']['sourceStatus'] }>(key);
  if (cached.hit) return { ...cached.value, cached: true };

  const providers = enabledProviders(config);
  const results = await Promise.allSettled(providers.map((provider) => provider.fetchQuote(stock)));
  const quotes: ProviderQuote[] = [];
  const sourceStatus = results.map((result, index) => {
    const provider = providers[index];
    if (result.status === 'fulfilled') {
      quotes.push(result.value);
      return { id: provider.id, label: provider.label, status: 'ok' as const, latencyMs: result.value.latencyMs };
    }
    return {
      id: provider.id,
      label: provider.label,
      status: 'error' as const,
      latencyMs: null,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason)
    };
  });
  if (!quotes.length) throw new Error(`所有行情源均失败：${sourceStatus.map((item) => `${item.label}(${item.error})`).join('；')}`);
  const value = { quotes, sourceStatus };
  cache.set(key, value, config.marketData.quoteCacheSeconds);
  return { ...value, cached: false };
}

async function fetchProviderDaily(stock: StockRef, config: AppConfig): Promise<{ daily: DailyBar[]; all: Record<string, DailyBar[]>; cached: boolean }> {
  const key = `daily:${stock.secid}:${config.marketData.sources.join(',')}`;
  const cached = cache.get<{ daily: DailyBar[]; all: Record<string, DailyBar[]> }>(key);
  if (cached.hit) return { ...cached.value, cached: true };
  const providers = enabledProviders(config);
  const results = await Promise.allSettled(providers.map((provider) => provider.fetchDaily(stock, 260)));
  const all: Record<string, DailyBar[]> = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length) all[providers[index].id] = result.value;
  });
  const daily = all.eastmoney ?? all.tencent ?? Object.values(all)[0];
  if (!daily?.length) throw new Error('未获取到日K数据');
  const value = { daily, all };
  cache.set(key, value, config.marketData.dailyCacheSeconds);
  return { ...value, cached: false };
}

async function fetchIntraday(stock: StockRef, config: AppConfig): Promise<IntradayPoint[]> {
  const key = `intraday:${stock.secid}`;
  const cached = cache.get<IntradayPoint[]>(key);
  if (cached.hit) return cached.value;
  const providers = enabledProviders(config);
  for (const provider of providers) {
    try {
      const points = await provider.fetchIntraday(stock);
      if (points.length) {
        cache.set(key, points, 30);
        return points;
      }
    } catch {
      // Try the next provider.
    }
  }
  return [];
}

async function fetchNews(stock: StockRef, config: AppConfig): Promise<{ announcements: NewsItem[]; news: NewsItem[]; cached: boolean }> {
  const key = `news:${stock.code}`;
  const cached = cache.get<{ announcements: NewsItem[]; news: NewsItem[] }>(key);
  if (cached.hit) return { ...cached.value, cached: true };
  const [announcementResult, newsResult] = await Promise.allSettled([
    eastmoney.fetchAnnouncements(stock),
    eastmoney.fetchNews(stock)
  ]);
  const announcements = announcementResult.status === 'fulfilled'
    ? announcementResult.value.map((item) => scoreNews({ ...item, kind: 'announcement', summary: '', source: '交易所公告' }))
    : [];
  const news = newsResult.status === 'fulfilled'
    ? newsResult.value.map((item) => scoreNews({ ...item, kind: 'news' }))
    : [];
  const value = { announcements, news };
  cache.set(key, value, config.marketData.newsCacheSeconds);
  return { ...value, cached: false };
}

export async function getDashboard(query: string, config: AppConfig): Promise<DashboardData> {
  const stock = await resolveStock(query);
  const [quoteResult, dailyResult, intraday, newsResult] = await Promise.all([
    fetchProviderQuotes(stock, config),
    fetchProviderDaily(stock, config),
    fetchIntraday(stock, config),
    fetchNews(stock, config)
  ]);

  const quoteValidation = buildQuoteValidation(
    quoteResult.quotes,
    config.marketData.quoteTolerancePct,
    quoteResult.sourceStatus
  );
  const secondary = Object.entries(dailyResult.all).find(([id]) => id !== 'eastmoney')?.[1] ?? [];
  const primary = dailyResult.daily;
  const validation = addKlineValidation(
    quoteValidation.validation,
    primary,
    secondary,
    config.marketData.closeTolerancePct
  );
  const indicators = calculateIndicators(primary);
  const consensusQuote: Quote = {
    ...quoteValidation.consensusQuote,
    code: stock.code,
    name: stock.name,
    exchange: stock.exchange
  };

  return {
    stock,
    quote: consensusQuote,
    providerQuotes: quoteResult.quotes,
    daily: primary,
    intraday,
    indicators,
    announcements: newsResult.announcements,
    news: newsResult.news,
    validation,
    generatedAt: new Date().toISOString(),
    cache: {
      quote: quoteResult.cached,
      daily: dailyResult.cached,
      news: newsResult.cached
    }
  };
}

export function clearMarketCache(): void {
  cache.clear();
}
