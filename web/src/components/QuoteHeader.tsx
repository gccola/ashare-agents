import { ArrowDownRight, ArrowUpRight, Clock3 } from 'lucide-react';
import type { DashboardData } from '../../../shared/types.js';

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1e8) return `${formatNumber(value / 1e8)} 亿`;
  if (value >= 1e4) return `${formatNumber(value / 1e4)} 万`;
  return formatNumber(value, 0);
}

export default function QuoteHeader({ data }: { data: DashboardData }) {
  const up = data.quote.change >= 0;
  return (
    <section className="quote-hero panel">
      <div className="stock-identity">
        <div className="exchange-tag">{data.stock.exchange}</div>
        <div>
          <div className="stock-title-row">
            <h1>{data.stock.name}</h1>
            <span className="stock-code">{data.stock.code}</span>
          </div>
          <div className="quote-meta">
            <Clock3 size={13} />
            {new Date(data.quote.timestamp).toLocaleString('zh-CN', { hour12: false })} · 合并行情
          </div>
        </div>
      </div>
      <div className={`price-block ${up ? 'up' : 'down'}`}>
        <strong>{formatNumber(data.quote.price)}</strong>
        <div className="price-change">
          {up ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
          {up ? '+' : ''}{formatNumber(data.quote.change)} / {up ? '+' : ''}{formatNumber(data.quote.changePct)}%
        </div>
      </div>
      <div className="quote-stats">
        <div><span>今开</span><strong>{formatNumber(data.quote.open)}</strong></div>
        <div><span>最高</span><strong className="up">{formatNumber(data.quote.high)}</strong></div>
        <div><span>最低</span><strong className="down">{formatNumber(data.quote.low)}</strong></div>
        <div><span>成交额</span><strong>{formatCompact(data.quote.amount)}</strong></div>
        <div><span>换手率</span><strong>{data.quote.turnoverRate?.toFixed(2) ?? '-'}%</strong></div>
        <div><span>市盈率</span><strong>{data.quote.pe?.toFixed(2) ?? '-'}</strong></div>
      </div>
    </section>
  );
}
