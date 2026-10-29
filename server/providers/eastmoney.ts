import type { DailyBar, IntradayPoint, ProviderQuote, StockRef, StockSearchItem } from '../../shared/types.js';
import { requestJson, requestText, round, safeNumber } from '../http.js';
import type { MarketDataProvider } from './types.js';

interface SuggestResponse {
  QuotationCodeTable?: {
    Data?: Array<{
      Code: string;
      Name: string;
      MktNum: string;
      QuoteID: string;
      SecurityTypeName: string;
      Classify: string;
    }>;
  };
}

interface QuoteResponse {
  data?: Record<string, unknown> | null;
}

interface KlineResponse {
  data?: { klines?: string[]; preKPrice?: number; name?: string } | null;
}

interface TrendResponse {
  data?: { trends?: string[]; preClose?: number } | null;
}

function marketFromSecid(secid: string): StockRef['exchange'] {
  const market = secid.split('.')[0];
  if (market === '1') return 'SH';
  if (market === '0') return 'SZ';
  return 'BJ';
}

function tencentCodeFor(code: string, exchange: StockRef['exchange']): string {
  if (exchange === 'SH') return `sh${code}`;
  if (exchange === 'BJ') return `bj${code}`;
  return `sz${code}`;
}

export class EastmoneyProvider implements MarketDataProvider {
  id = 'eastmoney' as const;
  label = '东方财富';

  async search(query: string): Promise<StockSearchItem[]> {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=8`;
    const { data } = await requestJson<SuggestResponse>(url);
    const rows = data.QuotationCodeTable?.Data ?? [];
    return rows
      .filter((row) => row.Classify === 'AStock' || /A|沪|深|京/.test(row.SecurityTypeName))
      .map((row) => {
        const exchange = marketFromSecid(row.QuoteID);
        return {
          code: row.Code,
          name: row.Name,
          exchange,
          secid: row.QuoteID,
          tencentCode: tencentCodeFor(row.Code, exchange),
          securityType: row.SecurityTypeName,
          display: `${row.Name} ${row.Code} · ${row.SecurityTypeName}`
        };
      });
  }

  async fetchQuote(stock: StockRef): Promise<ProviderQuote> {
    const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f86,f162,f167,f168,f170';
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${stock.secid}&fields=${fields}`;
    const { data, latencyMs } = await requestJson<QuoteResponse>(url);
    if (!data.data) throw new Error('东方财富未返回行情');
    const row = data.data;
    const price = safeNumber(row.f43) / 100;
    const prevClose = safeNumber(row.f60) / 100;
    const timestamp = safeNumber(row.f86)
      ? new Date(safeNumber(row.f86) * 1000).toISOString()
      : new Date().toISOString();
    return {
      source: this.id,
      sourceLabel: this.label,
      price,
      prevClose,
      open: safeNumber(row.f46) / 100,
      high: safeNumber(row.f44) / 100,
      low: safeNumber(row.f45) / 100,
      volume: safeNumber(row.f47) * 100,
      amount: safeNumber(row.f48),
      change: round(price - prevClose),
      changePct: safeNumber(row.f170) / 100,
      turnoverRate: safeNumber(row.f168) / 100,
      pe: safeNumber(row.f162) ? safeNumber(row.f162) / 100 : undefined,
      pb: safeNumber(row.f167) ? safeNumber(row.f167) / 100 : undefined,
      timestamp,
      fetchedAt: new Date().toISOString(),
      latencyMs
    };
  }

  async fetchDaily(stock: StockRef, limit: number): Promise<DailyBar[]> {
    const fields = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${stock.secid}&klt=101&fqt=1&lmt=${limit}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=${fields}`;
    const { data } = await requestJson<KlineResponse>(url);
    const lines = data.data?.klines ?? [];
    return lines.map((line) => {
      const [date, open, close, high, low, volume, amount, , changePct, , turnoverRate] = line.split(',');
      return {
        date,
        open: safeNumber(open),
        close: safeNumber(close),
        high: safeNumber(high),
        low: safeNumber(low),
        volume: safeNumber(volume) * 100,
        amount: safeNumber(amount),
        changePct: safeNumber(changePct),
        turnoverRate: safeNumber(turnoverRate)
      };
    });
  }

  async fetchIntraday(stock: StockRef): Promise<IntradayPoint[]> {
    const fields1 = 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13';
    const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58';
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${stock.secid}&fields1=${fields1}&fields2=${fields2}&ndays=1&iscr=0`;
    const { data } = await requestJson<TrendResponse>(url);
    return (data.data?.trends ?? []).map((line) => {
      const [dateTime, open, close, high, low, volume, amount, avgPrice] = line.split(',');
      return {
        time: dateTime.slice(11),
        price: safeNumber(close || open),
        avgPrice: safeNumber(avgPrice, safeNumber(close)),
        high: safeNumber(high),
        low: safeNumber(low),
        volume: safeNumber(volume) * 100,
        amount: safeNumber(amount)
      };
    });
  }

  async fetchAnnouncements(stock: StockRef): Promise<Array<{ id: string; title: string; date: string; url: string }>> {
    const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=12&page_index=1&ann_type=A&client_source=web&stock_list=${stock.code}`;
    const { text } = await requestText(url);
    const payload = JSON.parse(text) as {
      data?: { list?: Array<{ art_code: string; title: string; notice_date: string }> };
    };
    return (payload.data?.list ?? []).map((item) => ({
      id: item.art_code,
      title: item.title,
      date: item.notice_date,
      url: `https://data.eastmoney.com/notices/detail/${stock.code}/${item.art_code}.html`
    }));
  }

  async fetchNews(stock: StockRef): Promise<Array<{ id: string; title: string; summary: string; date: string; source: string; url: string }>> {
    const param = {
      uid: '',
      keyword: stock.name,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          sort: 'default',
          pageIndex: 1,
          pageSize: 12,
          preTag: '',
          postTag: ''
        }
      }
    };
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=${encodeURIComponent(JSON.stringify(param))}`;
    const { text } = await requestText(url, { headers: { Referer: 'https://so.eastmoney.com/' } });
    const match = text.match(/^cb\((.*)\)\s*;?$/s);
    if (!match) return [];
    const payload = JSON.parse(match[1]) as {
      result?: {
        cmsArticleWebOld?: Array<{ code: string; title: string; content: string; date: string; mediaName: string; url: string }>;
      };
    };
    return (payload.result?.cmsArticleWebOld ?? []).map((item) => ({
      id: item.code,
      title: item.title.replace(/<[^>]+>/g, ''),
      summary: item.content.replace(/<[^>]+>/g, '').slice(0, 240),
      date: item.date,
      source: item.mediaName,
      url: item.url
    }));
  }
}
