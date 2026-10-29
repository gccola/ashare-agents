import { Gauge, MoveUpRight, Waves } from 'lucide-react';
import type { IndicatorSnapshot } from '../../../shared/types.js';

function format(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? '—' : value.toFixed(digits);
}

export default function IndicatorGrid({ indicators }: { indicators: IndicatorSnapshot }) {
  const rsiTone = indicators.rsi14 === null ? '' : indicators.rsi14 >= 70 ? 'negative' : indicators.rsi14 <= 30 ? 'positive' : '';
  return (
    <section className="panel indicator-panel">
      <div className="panel-heading">
        <div><Gauge size={17} /><h2>技术指标</h2></div>
        <span className={`trend-badge ${indicators.trendScore >= 59 ? 'up' : indicators.trendScore <= 41 ? 'down' : ''}`}>趋势 {indicators.trendScore}</span>
      </div>
      <div className="indicator-grid">
        <div className="indicator-item"><span>RSI 14</span><strong className={rsiTone}>{format(indicators.rsi14, 1)}</strong><small>{indicators.rsi14 && indicators.rsi14 >= 70 ? '超买区' : indicators.rsi14 && indicators.rsi14 <= 30 ? '超卖区' : '中性区'}</small></div>
        <div className="indicator-item"><span>MACD</span><strong>{format(indicators.macd, 3)}</strong><small>DIF {format(indicators.dif, 3)}</small></div>
        <div className="indicator-item"><span>KDJ</span><strong>{format(indicators.k, 1)}</strong><small>D {format(indicators.d, 1)} · J {format(indicators.j, 1)}</small></div>
        <div className="indicator-item"><span>量比</span><strong>{format(indicators.volumeRatio)}</strong><small>5日 / 20日均量</small></div>
        <div className="indicator-item"><span>20日涨幅</span><strong className={(indicators.return20d ?? 0) >= 0 ? 'up' : 'down'}>{format(indicators.return20d)}%</strong><small>5日 {format(indicators.return5d)}%</small></div>
        <div className="indicator-item"><span>ATR 14</span><strong>{format(indicators.atr14)}</strong><small>波动参考</small></div>
      </div>
      <div className="signal-strip">
        <Waves size={15} />
        {indicators.technicalSignals.length
          ? indicators.technicalSignals.map((signal) => <span key={signal}>{signal}</span>)
          : <span>暂无显著技术信号</span>}
      </div>
      <div className="ma-line-row">
        <MoveUpRight size={14} />
        <span>MA5 {format(indicators.ma5)}</span><span>MA10 {format(indicators.ma10)}</span><span>MA20 {format(indicators.ma20)}</span><span>MA60 {format(indicators.ma60)}</span>
      </div>
    </section>
  );
}
