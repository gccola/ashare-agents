import type { DailyBar, DataValidation, ProviderQuote, SourceStatus, ValidationMetric } from '../../shared/types.js';
import { median, round } from '../http.js';

const metricDefinitions: Array<{ field: keyof ProviderQuote; label: string }> = [
  { field: 'price', label: '最新价' },
  { field: 'prevClose', label: '昨收' },
  { field: 'open', label: '今开' },
  { field: 'high', label: '最高' },
  { field: 'low', label: '最低' }
];

export function buildQuoteValidation(
  quotes: ProviderQuote[],
  quoteTolerancePct: number,
  sourceStatus: Array<{ id: string; label: string; status: SourceStatus; latencyMs: number | null; error?: string }>
): { validation: DataValidation; consensusQuote: ProviderQuote } {
  const quoteMetrics: ValidationMetric[] = metricDefinitions.map(({ field, label }) => {
    const values = quotes.map((quote) => ({ source: quote.sourceLabel, value: Number(quote[field] ?? 0) }));
    const consensus = median(values.map((item) => item.value));
    const deviations = values.map((item) =>
      consensus && consensus !== 0 ? (Math.abs(item.value - consensus) / consensus) * 100 : 0
    );
    const maxDeviationPct = deviations.length ? round(Math.max(...deviations), 3) : null;
    const status = maxDeviationPct === null ? 'fail' : maxDeviationPct <= quoteTolerancePct ? 'pass' : maxDeviationPct <= quoteTolerancePct * 3 ? 'warning' : 'fail';
    return { field, label, values, consensus: consensus === null ? null : round(consensus), maxDeviationPct, status };
  });

  const sourceStatusScore = sourceStatus.reduce((score, source) => score + (source.status === 'ok' ? 1 : 0), 0) / Math.max(1, sourceStatus.length);
  const metricScore = quoteMetrics.reduce((score, metric) => score + (metric.status === 'pass' ? 1 : metric.status === 'warning' ? 0.55 : 0), 0) / quoteMetrics.length;
  const score = Math.round(metricScore * 70 + sourceStatusScore * 30);
  const status = score >= 85 ? 'verified' : score >= 55 ? 'warning' : 'failed';
  const notes: string[] = [];
  if (quotes.length < 2) notes.push('仅获取到一个行情源，无法完成双源交叉校验。');
  for (const metric of quoteMetrics.filter((item) => item.status !== 'pass')) {
    notes.push(`${metric.label}最大偏差 ${metric.maxDeviationPct ?? '-'}%，阈值 ${quoteTolerancePct}%。`);
  }
  if (status === 'verified') notes.push('核心行情字段在容差范围内一致。');

  const primary = quotes[0];
  const consensusQuote: ProviderQuote = {
    ...primary,
    price: quoteMetrics.find((item) => item.field === 'price')?.consensus ?? primary.price,
    prevClose: quoteMetrics.find((item) => item.field === 'prevClose')?.consensus ?? primary.prevClose,
    open: quoteMetrics.find((item) => item.field === 'open')?.consensus ?? primary.open,
    high: quoteMetrics.find((item) => item.field === 'high')?.consensus ?? primary.high,
    low: quoteMetrics.find((item) => item.field === 'low')?.consensus ?? primary.low,
    change: round((quoteMetrics.find((item) => item.field === 'price')?.consensus ?? primary.price) - (quoteMetrics.find((item) => item.field === 'prevClose')?.consensus ?? primary.prevClose)),
    changePct: primary.prevClose ? round(((quoteMetrics.find((item) => item.field === 'price')?.consensus ?? primary.price) / (quoteMetrics.find((item) => item.field === 'prevClose')?.consensus ?? primary.prevClose) - 1) * 100) : primary.changePct
  };

  return {
    validation: {
      score,
      status,
      quoteMetrics,
      closeDeviationPct: null,
      matchedTradingDays: 0,
      notes,
      sourceStatus
    },
    consensusQuote
  };
}

export function addKlineValidation(
  validation: DataValidation,
  primary: DailyBar[],
  secondary: DailyBar[],
  closeTolerancePct: number
): DataValidation {
  const secondaryMap = new Map(secondary.map((bar) => [bar.date, bar]));
  const pairs = primary
    .map((bar) => ({ primary: bar, secondary: secondaryMap.get(bar.date) }))
    .filter((pair): pair is { primary: DailyBar; secondary: DailyBar } => Boolean(pair.secondary));
  const deviations = pairs
    .map(({ primary: a, secondary: b }) => (a.close ? (Math.abs(a.close - b.close) / a.close) * 100 : 0))
    .filter((value) => Number.isFinite(value));
  const closeDeviationPct = deviations.length ? round(Math.max(...deviations), 3) : null;
  const notes = [...validation.notes];
  if (closeDeviationPct === null) {
    notes.push('未找到可对齐的日K记录，无法完成K线交叉校验。');
    return { ...validation, notes, closeDeviationPct, matchedTradingDays: 0, score: Math.max(0, validation.score - 15) };
  }
  if (closeDeviationPct > closeTolerancePct) {
    notes.push(`日K收盘价最大偏差 ${closeDeviationPct}%，超过阈值 ${closeTolerancePct}%。`);
  } else {
    notes.push(`已对齐 ${pairs.length} 个交易日，日K收盘价最大偏差 ${closeDeviationPct}%。`);
  }
  const klinePenalty = closeDeviationPct > closeTolerancePct ? 20 : closeDeviationPct > closeTolerancePct / 2 ? 5 : 0;
  const score = Math.max(0, validation.score - klinePenalty);
  return {
    ...validation,
    score,
    status: score >= 85 ? 'verified' : score >= 55 ? 'warning' : 'failed',
    closeDeviationPct,
    matchedTradingDays: pairs.length,
    notes
  };
}
