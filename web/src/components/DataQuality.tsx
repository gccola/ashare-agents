import { CheckCircle2, CircleAlert, DatabaseZap, TriangleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { DataValidation } from '../../../shared/types.js';

export default function DataQuality({ validation }: { validation: DataValidation }) {
  const Icon = validation.status === 'verified' ? CheckCircle2 : validation.status === 'warning' ? TriangleAlert : CircleAlert;
  return (
    <section className="panel quality-panel">
      <div className="panel-heading">
        <div><DatabaseZap size={17} /><h2>数据交叉校验</h2></div>
        <span className={`quality-status ${validation.status}`}>{validation.status === 'verified' ? '校验通过' : validation.status === 'warning' ? '需要关注' : '校验失败'}</span>
      </div>
      <div className="quality-main">
        <div className="quality-ring" style={{ '--score': validation.score } as CSSProperties}>
          <strong>{validation.score}</strong><span>数据质量</span>
        </div>
        <div className="quality-copy">
          <div className="quality-title"><Icon size={16} />{validation.sourceStatus.filter((item) => item.status === 'ok').length} / {validation.sourceStatus.length} 个数据源可用</div>
          <p>日K对齐 {validation.matchedTradingDays} 个交易日，最大收盘偏差 {validation.closeDeviationPct ?? '—'}%。</p>
        </div>
      </div>
      <div className="source-list">
        {validation.sourceStatus.map((source) => (
          <div key={source.id} className="source-row">
            <span className={`source-dot ${source.status}`} />
            <span>{source.label}</span>
            <small>{source.status === 'ok' ? `${source.latencyMs} ms` : source.error ?? '不可用'}</small>
          </div>
        ))}
      </div>
      <div className="validation-notes">
        {validation.notes.slice(0, 3).map((note) => <p key={note}>{note}</p>)}
      </div>
    </section>
  );
}
