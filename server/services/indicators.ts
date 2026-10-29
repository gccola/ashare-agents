import type { DailyBar, IndicatorSnapshot } from '../../shared/types.js';
import { round } from '../http.js';

function sma(values: number[], window: number): Array<number | undefined> {
  const result: Array<number | undefined> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    result.push(i >= window - 1 ? sum / window : undefined);
  }
  return result;
}

function ema(values: number[], window: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (window + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i += 1) result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  return result;
}

function rsi(values: number[], window = 14): Array<number | undefined> {
  const result: Array<number | undefined> = Array(values.length).fill(undefined);
  if (values.length <= window) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= window; i += 1) {
    const diff = values[i] - values[i - 1];
    gain += Math.max(0, diff);
    loss += Math.max(0, -diff);
  }
  let avgGain = gain / window;
  let avgLoss = loss / window;
  result[window] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = window + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (window - 1) + Math.max(0, diff)) / window;
    avgLoss = (avgLoss * (window - 1) + Math.max(0, -diff)) / window;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function std(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function lastDefined<T>(values: Array<T | undefined>): T | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== undefined && values[i] !== null) return values[i] as T;
  }
  return null;
}

function enrichKdj(bars: DailyBar[]): void {
  let k = 50;
  let d = 50;
  for (let i = 0; i < bars.length; i += 1) {
    const window = bars.slice(Math.max(0, i - 8), i + 1);
    const high = Math.max(...window.map((bar) => bar.high));
    const low = Math.min(...window.map((bar) => bar.low));
    const rsv = high === low ? 50 : ((bars[i].close - low) / (high - low)) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
    bars[i].k = round(k);
    bars[i].d = round(d);
    bars[i].j = round(3 * k - 2 * d);
  }
}

export function calculateIndicators(bars: DailyBar[]): IndicatorSnapshot {
  if (!bars.length) {
    return {
      ma5: null, ma10: null, ma20: null, ma60: null, rsi14: null,
      dif: null, dea: null, macd: null, bollUpper: null, bollMid: null,
      bollLower: null, k: null, d: null, j: null, atr14: null,
      volumeRatio: null, return5d: null, return20d: null, trendScore: 0, technicalSignals: []
    };
  }

  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi14 = rsi(closes, 14);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const difSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const deaSeries = ema(difSeries, 9);
  const volumeMa5 = sma(volumes, 5);
  const volumeMa20 = sma(volumes, 20);

  for (let i = 0; i < bars.length; i += 1) {
    bars[i].ma5 = ma5[i] === undefined ? undefined : round(ma5[i]!);
    bars[i].ma10 = ma10[i] === undefined ? undefined : round(ma10[i]!);
    bars[i].ma20 = ma20[i] === undefined ? undefined : round(ma20[i]!);
    bars[i].ma60 = ma60[i] === undefined ? undefined : round(ma60[i]!);
    bars[i].rsi14 = rsi14[i] === undefined ? undefined : round(rsi14[i]!);
    bars[i].dif = round(difSeries[i], 3);
    bars[i].dea = round(deaSeries[i], 3);
    bars[i].macd = round((difSeries[i] - deaSeries[i]) * 2, 3);

    if (i >= 19) {
      const slice = closes.slice(i - 19, i + 1);
      const mid = slice.reduce((sum, value) => sum + value, 0) / slice.length;
      const deviation = std(slice);
      bars[i].bollMid = round(mid);
      bars[i].bollUpper = round(mid + 2 * deviation);
      bars[i].bollLower = round(mid - 2 * deviation);
    }
  }

  enrichKdj(bars);
  let atr14: number | null = null;
  if (bars.length >= 15) {
    const trueRanges = bars.map((bar, index) => {
      if (index === 0) return bar.high - bar.low;
      const previous = bars[index - 1].close;
      return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
    });
    const recent = trueRanges.slice(-14);
    atr14 = round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
    bars[bars.length - 1].atr14 = atr14;
  }

  const last = bars[bars.length - 1];
  const technicalSignals: string[] = [];
  let trendScore = 50;

  if (last.ma5 && last.ma10 && last.ma20 && last.ma60) {
    if (last.ma5 > last.ma10 && last.ma10 > last.ma20 && last.ma20 > last.ma60) {
      trendScore += 20;
      technicalSignals.push('均线多头排列');
    } else if (last.ma5 < last.ma10 && last.ma10 < last.ma20 && last.ma20 < last.ma60) {
      trendScore -= 20;
      technicalSignals.push('均线空头排列');
    } else {
      technicalSignals.push('均线方向交织');
    }
    if (last.close > last.ma20) trendScore += 6;
    else trendScore -= 6;
    if (last.close > last.ma60) trendScore += 5;
    else trendScore -= 5;
  }

  if (last.dif !== undefined && last.dea !== undefined) {
    if (last.dif > last.dea) {
      trendScore += 8;
      technicalSignals.push('MACD位于信号线上方');
    } else {
      trendScore -= 8;
      technicalSignals.push('MACD位于信号线下方');
    }
  }

  if (last.rsi14 !== undefined) {
    if (last.rsi14 >= 75) {
      trendScore -= 8;
      technicalSignals.push('RSI进入超买区');
    } else if (last.rsi14 <= 25) {
      trendScore += 6;
      technicalSignals.push('RSI进入超卖区');
    } else if (last.rsi14 >= 55) {
      trendScore += 4;
      technicalSignals.push('RSI偏强');
    } else if (last.rsi14 <= 45) {
      trendScore -= 3;
      technicalSignals.push('RSI偏弱');
    }
  }

  const recentVolume = lastDefined(volumeMa5);
  const baseVolume = lastDefined(volumeMa20);
  const volumeRatio = recentVolume && baseVolume ? round(recentVolume / baseVolume) : null;
  if (volumeRatio !== null) {
    if (volumeRatio > 1.3) {
      trendScore += last.changePct && last.changePct > 0 ? 5 : -4;
      technicalSignals.push('成交量明显放大');
    } else if (volumeRatio < 0.7) {
      technicalSignals.push('成交量缩量');
    }
  }

  const return5d = closes.length > 5 ? round((closes.at(-1)! / closes.at(-6)! - 1) * 100) : null;
  const return20d = closes.length > 20 ? round((closes.at(-1)! / closes.at(-21)! - 1) * 100) : null;
  if (return20d !== null) trendScore += Math.max(-10, Math.min(10, return20d / 2));

  return {
    ma5: last.ma5 ?? null,
    ma10: last.ma10 ?? null,
    ma20: last.ma20 ?? null,
    ma60: last.ma60 ?? null,
    rsi14: last.rsi14 ?? null,
    dif: last.dif ?? null,
    dea: last.dea ?? null,
    macd: last.macd ?? null,
    bollUpper: last.bollUpper ?? null,
    bollMid: last.bollMid ?? null,
    bollLower: last.bollLower ?? null,
    k: last.k ?? null,
    d: last.d ?? null,
    j: last.j ?? null,
    atr14,
    volumeRatio,
    return5d,
    return20d,
    trendScore: Math.round(Math.max(0, Math.min(100, trendScore))),
    technicalSignals
  };
}
