import type {
  AgentAction,
  AgentFactor,
  DashboardData,
  Signal
} from '../../shared/types.js';
import { aggregateNewsSentiment } from './news.js';

export interface LocalAgentDraft {
  signal: Signal;
  score: number;
  confidence: number;
  summary: string;
  analysis: string[];
  action: AgentAction;
  risks: string[];
  evidence: string[];
  factors: AgentFactor[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function signalFromScore(score: number): Signal {
  if (score >= 75) return 'STRONG_BUY';
  if (score >= 59) return 'BUY';
  if (score > 41) return 'HOLD';
  if (score > 25) return 'SELL';
  return 'STRONG_SELL';
}

export function signalLabel(signal: Signal): string {
  return {
    STRONG_BUY: '强烈买入',
    BUY: '买入',
    HOLD: '持有 / 观望',
    SELL: '卖出',
    STRONG_SELL: '强烈卖出'
  }[signal];
}

export function buildAction(price: number, atr: number | null, score: number, horizon: string): AgentAction {
  const riskUnit = atr && atr > 0 ? atr : price * 0.025;
  const digits = price >= 100 ? 2 : price >= 10 ? 2 : 3;
  const format = (value: number) => round(value, digits).toFixed(digits);
  const bullish = score >= 59;
  const bearish = score <= 41;
  return {
    horizon,
    action: signalLabel(signalFromScore(score)),
    entryZone: bullish
      ? `${format(price - riskUnit * 0.35)} - ${format(price + riskUnit * 0.25)}`
      : `${format(price)} 附近，等待方向确认`,
    stopLoss: bullish ? `${format(price - riskUnit * 1.5)} 下方` : `${format(price + riskUnit * 1.2)} 上方`,
    takeProfit: bullish ? `${format(price + riskUnit * 2.4)} 附近` : bearish ? '反弹至压力位分批减仓' : '突破后再上移目标',
    position: score >= 75 ? '试仓不超过 30%，确认放量后分批加仓' : score >= 59 ? '轻仓 10%-20%，严格止损' : score <= 25 ? '规避，已有仓位优先降低风险' : '维持低仓位或观望'
  };
}

function factorDirection(value: number, positiveThreshold = 0.1, negativeThreshold = -0.1): AgentFactor['direction'] {
  if (value > positiveThreshold) return 'positive';
  if (value < negativeThreshold) return 'negative';
  return 'neutral';
}

export function analyzeMarketAndNews(data: DashboardData): LocalAgentDraft {
  const { indicators, quote } = data;
  const sentiment = aggregateNewsSentiment([...data.announcements.slice(0, 8), ...data.news.slice(0, 12)]);
  const technical = indicators.trendScore;
  const intradayReturn = data.intraday.length > 1
    ? (quote.price / data.intraday[0].price - 1) * 100
    : 0;
  const score = clamp(technical * 0.78 + (sentiment.score + 1) * 10 + clamp(intradayReturn * 1.2, -6, 6) + (data.validation.score - 70) * 0.08, 0, 100);
  const roundedScore = Math.round(score);
  const signal = signalFromScore(roundedScore);
  const trendText = indicators.ma20 && indicators.ma60
    ? quote.price > indicators.ma20 && quote.price > indicators.ma60
      ? '价格位于 MA20 与 MA60 上方，中期结构偏强'
      : quote.price < indicators.ma20 && quote.price < indicators.ma60
        ? '价格位于 MA20 与 MA60 下方，中期结构偏弱'
        : '价格处于均线之间，趋势方向尚未完全确认'
    : '均线数据不足，暂不能确认中长期结构';
  const newsText = sentiment.positive + sentiment.negative === 0
    ? '近期资讯情绪整体中性'
    : `近期资讯中正向 ${sentiment.positive} 条、负向 ${sentiment.negative} 条`;
  const factors: AgentFactor[] = [
    { name: '趋势结构', value: `${technical}/100`, interpretation: trendText, direction: factorDirection(technical - 50, 5, -5) },
    { name: '资讯情绪', value: sentiment.score.toFixed(2), interpretation: newsText, direction: factorDirection(sentiment.score, 0.12, -0.12) },
    { name: '当日表现', value: `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`, interpretation: quote.changePct >= 0 ? '当日价格表现偏强' : '当日价格承压', direction: factorDirection(quote.changePct, 0.5, -0.5) },
    { name: '分时强弱', value: `${intradayReturn >= 0 ? '+' : ''}${round(intradayReturn, 2)}%`, interpretation: intradayReturn >= 0 ? '当前价高于开盘分时价' : '当前价低于开盘分时价', direction: factorDirection(intradayReturn, 0.3, -0.3) }
  ];
  const confidence = Math.round(clamp(48 + Math.abs(roundedScore - 50) * 0.8 + data.validation.score * 0.18, 35, 92));
  return {
    signal,
    score: roundedScore,
    confidence,
    summary: `${signalLabel(signal)}：${trendText}；${newsText}。数据质量 ${data.validation.score} 分，建议结合仓位与风险承受能力执行。`,
    analysis: [
      `${quote.name} 最新价 ${quote.price.toFixed(2)} 元，当日涨跌 ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%，换手率 ${quote.turnoverRate?.toFixed(2) ?? '-'}%。`,
      `技术面：${indicators.technicalSignals.join('；') || '暂无显著技术信号'}。RSI14 为 ${indicators.rsi14?.toFixed(1) ?? '-'}，20日涨幅为 ${indicators.return20d?.toFixed(2) ?? '-'}%。`,
      `消息面：${newsText}。公告与资讯仅作事件线索，未核验内容真实性的消息不应作为唯一交易依据。`,
      `数据面：东方财富与腾讯行情完成交叉校验，质量状态为 ${data.validation.status}。`
    ],
    action: buildAction(quote.price, indicators.atr14, roundedScore, '短线 3-10 个交易日'),
    risks: [
      '公告与资讯可能存在时滞、标题偏差或市场已提前定价。',
      '技术指标基于历史价格，无法预测突发事件和流动性冲击。',
      data.validation.status === 'verified' ? '双源数据一致，但仍可能存在交易所层面延迟。' : '数据源存在偏差，应降低信号置信度。'
    ],
    evidence: [
      `趋势评分 ${technical}/100`,
      `资讯情绪 ${sentiment.score.toFixed(2)}`,
      `数据质量 ${data.validation.score}/100`,
      `技术信号：${indicators.technicalSignals.slice(0, 4).join('、') || '无明显信号'}`
    ],
    factors
  };
}

export function analyzeQlibFactors(data: DashboardData, parameters: Record<string, number | number[]> = {}): LocalAgentDraft {
  const closes = data.daily.map((bar) => bar.close);
  const volumes = data.daily.map((bar) => bar.volume);
  const momentumWindow = Number(parameters.momentumWindow ?? 20);
  const shortWindow = Number(parameters.shortMomentumWindow ?? 5);
  const volatilityWindow = Number(parameters.volatilityWindow ?? 20);
  const volumeWindow = Number(parameters.volumeWindow ?? 20);
  const ret = (window: number) => closes.length > window ? closes.at(-1)! / closes.at(-1 - window)! - 1 : 0;
  const momentum = ret(momentumWindow);
  const shortMomentum = ret(shortWindow);
  const returns = closes.slice(-volatilityWindow - 1).map((value, index, array) => index ? value / array[index - 1] - 1 : 0).slice(1);
  const volatility = standardDeviation(returns) * Math.sqrt(252);
  const volumeRatio = mean(volumes.slice(-5)) / Math.max(1, mean(volumes.slice(-volumeWindow)));
  const reversal = -shortMomentum;
  const momentumScore = clamp(momentum * 160, -28, 28);
  const shortScore = clamp(shortMomentum * 110, -14, 14);
  const reversalScore = clamp(reversal * 55, -8, 8);
  const volatilityScore = clamp((0.28 - volatility) * 70, -15, 15);
  const volumeScore = clamp((volumeRatio - 1) * (shortMomentum >= 0 ? 24 : -24), -14, 14);
  const technicalScore = clamp((data.indicators.trendScore - 50) * 0.35, -17.5, 17.5);
  const score = Math.round(clamp(50 + momentumScore + shortScore + reversalScore + volatilityScore + volumeScore + technicalScore, 0, 100));
  const signal = signalFromScore(score);
  const factors: AgentFactor[] = [
    { name: `动量 ${momentumWindow}D`, value: `${(momentum * 100).toFixed(2)}%`, interpretation: momentum > 0 ? '中期动量向上' : '中期动量向下', direction: factorDirection(momentum, 0.02, -0.02) },
    { name: `动量 ${shortWindow}D`, value: `${(shortMomentum * 100).toFixed(2)}%`, interpretation: shortMomentum > 0 ? '短期价格延续上行' : '短期价格走弱', direction: factorDirection(shortMomentum, 0.01, -0.01) },
    { name: '短期反转', value: `${(reversal * 100).toFixed(2)}%`, interpretation: reversal > 0 ? '短期回撤提供反转观察窗口' : '短期涨幅较高，存在回吐风险', direction: factorDirection(reversal, 0.01, -0.01) },
    { name: '年化波动率', value: `${(volatility * 100).toFixed(2)}%`, interpretation: volatility < 0.28 ? '波动率处于可接受区间' : '波动率偏高，应降低仓位', direction: factorDirection(0.28 - volatility, 0.03, -0.03) },
    { name: '量能比', value: volumeRatio.toFixed(2), interpretation: volumeRatio > 1.15 ? '近期量能扩张' : '近期量能平稳或收缩', direction: factorDirection(volumeRatio - 1, 0.12, -0.12) },
    { name: '技术趋势', value: `${data.indicators.trendScore}/100`, interpretation: data.indicators.technicalSignals.join('；') || '趋势信号中性', direction: factorDirection(data.indicators.trendScore - 50, 6, -6) }
  ];
  const confidence = Math.round(clamp(46 + Math.abs(score - 50) * 0.85 + data.validation.score * 0.16, 35, 90));
  return {
    signal,
    score,
    confidence,
    summary: `Alpha158 风格复合因子得分 ${score}/100。${momentum > 0 ? '中期动量占优' : '中期动量偏弱'}，${volumeRatio > 1.15 ? '量能对当前方向形成确认' : '量能确认不足'}，信号为${signalLabel(signal)}。`,
    analysis: [
      `将 Qlib Alpha158 的多因子研究框架适配为单标的多维因子评分，组合动量、短期反转、波动率、量能与技术趋势。`,
      `20日动量 ${(momentum * 100).toFixed(2)}%，5日动量 ${(shortMomentum * 100).toFixed(2)}%，年化波动率约 ${(volatility * 100).toFixed(2)}%。`,
      `近期5日均量 / ${volumeWindow}日均量为 ${volumeRatio.toFixed(2)}，${volumeRatio > 1.15 ? '量价配合度改善' : '尚未形成明显放量确认'}。`,
      `该结果是规则化因子合成，并非训练后的 Qlib 模型预测，也不代表历史回测收益。`
    ],
    action: buildAction(data.quote.price, data.indicators.atr14, score, '波段 10-20 个交易日'),
    risks: [
      '单标的因子合成缺少横截面排序，与完整 Qlib 选股流程存在差异。',
      '动量策略在震荡市和快速反转行情中容易失效。',
      '未使用公告、行业景气度等非价量信息，可能遗漏基本面冲击。'
    ],
    evidence: factors.map((factor) => `${factor.name}: ${factor.value}（${factor.interpretation}）`),
    factors
  };
}

interface ConvergencePoint {
  value: number;
  priceStd: number;
  volumeStd: number;
}

function rollingMean(values: number[], window: number): Array<number | null> {
  let sum = 0;
  return values.map((value, index) => {
    sum += value;
    if (index >= window) sum -= values[index - window];
    return index >= window - 1 ? sum / window : null;
  });
}

function calculateConvergenceSeries(closes: number[], volumes: number[], windows: number[]): ConvergencePoint[] {
  const maxWindow = Math.max(...windows);
  const result: ConvergencePoint[] = [];
  for (let index = maxWindow - 1; index < closes.length; index += 1) {
    const priceBase = mean(closes.slice(index - maxWindow + 1, index + 1)) || 1;
    const volumeBase = mean(volumes.slice(index - maxWindow + 1, index + 1)) || 1;
    const priceValues = [closes[index] / priceBase];
    const volumeValues = [volumes[index] / volumeBase];
    for (const window of windows) {
      priceValues.push(mean(closes.slice(index - window + 1, index + 1)) / priceBase);
      volumeValues.push(mean(volumes.slice(index - window + 1, index + 1)) / volumeBase);
    }
    const priceStd = standardDeviation(priceValues);
    const volumeStd = standardDeviation(volumeValues);
    result.push({ value: -Math.log(1 + priceStd + volumeStd * 0.35), priceStd, volumeStd });
  }
  return result;
}

export function analyzeConvergence(data: DashboardData, parameters: Record<string, number | number[]> = {}): LocalAgentDraft {
  const windows = Array.isArray(parameters.windows) ? parameters.windows.map(Number) : [5, 10, 20, 30, 60];
  const breakoutWindow = Number(parameters.breakoutWindow ?? 20);
  const volumeConfirmRatio = Number(parameters.volumeConfirmRatio ?? 1.2);
  const closes = data.daily.map((bar) => bar.close);
  const volumes = data.daily.map((bar) => bar.volume);
  const series = calculateConvergenceSeries(closes, volumes, windows);
  const current = series.at(-1)?.value ?? 0;
  const previous = series.at(-6)?.value ?? current;
  const recentSeries = series.slice(-60).map((point) => point.value);
  const percentile = recentSeries.length
    ? recentSeries.filter((value) => value <= current).length / recentSeries.length
    : 0.5;
  const convergenceDelta = current - previous;
  const previousHigh = Math.max(...closes.slice(-breakoutWindow - 1, -1));
  const previousLow = Math.min(...closes.slice(-breakoutWindow - 1, -1));
  const isUpBreak = closes.at(-1)! > previousHigh;
  const isDownBreak = closes.at(-1)! < previousLow;
  const ma20Now = mean(closes.slice(-20));
  const ma20Previous = mean(closes.slice(-25, -5));
  const trendSlope = ma20Now ? ma20Now / ma20Previous - 1 : 0;
  const volumeRatio = data.indicators.volumeRatio ?? 1;
  const volumeConfirmed = volumeRatio >= volumeConfirmRatio;
  const convergenceScore = (percentile - 0.5) * 22;
  const expansionScore = convergenceDelta < 0 ? clamp(-convergenceDelta * 800, -12, 12) : clamp(-convergenceDelta * 400, -8, 4);
  const trendScore = clamp(trendSlope * 500, -16, 16);
  const breakoutScore = isUpBreak ? 14 : isDownBreak ? -16 : 0;
  const volumeScore = (isUpBreak || isDownBreak) ? (volumeConfirmed ? Math.sign(breakoutScore) * 6 : -Math.sign(breakoutScore || 1) * 4) : 0;
  const score = Math.round(clamp(50 + convergenceScore + expansionScore + trendScore + breakoutScore + volumeScore, 0, 100));
  const signal = signalFromScore(score);
  const shape = percentile >= 0.7 ? '高收敛' : percentile <= 0.3 ? '高发散' : '中性形态';
  const direction = isUpBreak ? '向上突破' : isDownBreak ? '向下破位' : '尚未突破';
  const factors: AgentFactor[] = [
    { name: '收敛分位', value: `${(percentile * 100).toFixed(1)}%`, interpretation: `${shape}，${percentile >= 0.7 ? '均线距离明显收窄' : percentile <= 0.3 ? '均线距离扩大' : '形态处于常态区间'}`, direction: factorDirection(percentile - 0.5, 0.18, -0.18) },
    { name: '5日收敛变化', value: convergenceDelta.toFixed(4), interpretation: convergenceDelta > 0 ? '均线进一步靠拢' : '均线开始发散', direction: factorDirection(convergenceDelta, 0.002, -0.002) },
    { name: `${breakoutWindow}日突破`, value: direction, interpretation: isUpBreak ? `收盘突破前高 ${previousHigh.toFixed(2)}` : isDownBreak ? `收盘跌破前低 ${previousLow.toFixed(2)}` : `位于 ${previousLow.toFixed(2)} - ${previousHigh.toFixed(2)} 区间`, direction: isUpBreak ? 'positive' : isDownBreak ? 'negative' : 'neutral' },
    { name: '量能确认', value: volumeRatio.toFixed(2), interpretation: volumeConfirmed ? '突破/破位获得放量确认' : '量能不足，形态可信度下降', direction: volumeConfirmed ? (isDownBreak ? 'negative' : 'positive') : 'neutral' },
    { name: 'MA20斜率', value: `${(trendSlope * 100).toFixed(2)}%`, interpretation: trendSlope > 0 ? '中期均线向上' : '中期均线向下', direction: factorDirection(trendSlope, 0.002, -0.002) }
  ];
  const confidence = Math.round(clamp(44 + Math.abs(score - 50) * 0.8 + data.validation.score * 0.18 + (volumeConfirmed ? 5 : -4), 32, 90));
  return {
    signal,
    score,
    confidence,
    summary: `均线收敛分位 ${(percentile * 100).toFixed(1)}%，当前形态${shape}，${direction}${volumeConfirmed ? '且量能确认' : '但量能确认不足'}。形态信号为${signalLabel(signal)}。`,
    analysis: [
      `参考 QuantsPlaybook 的价量收敛因子，对收盘价与成交量按 ${windows.join('/')} 日均线计算收敛程度，并适配为单标的时序信号。`,
      `当前收敛分位 ${(percentile * 100).toFixed(1)}%，5日变化 ${convergenceDelta.toFixed(4)}；${convergenceDelta > 0 ? '价格与量能均线进一步收敛' : '价格与量能均线开始发散'}。`,
      `价格相对 ${breakoutWindow} 日区间${direction}，量能比为 ${volumeRatio.toFixed(2)}，确认阈值为 ${volumeConfirmRatio.toFixed(2)}。`,
      `该实现保留原策略“先收敛、后选择方向”的核心逻辑，但不等同于原仓库的多标的横截面回测。`
    ],
    action: buildAction(data.quote.price, data.indicators.atr14, score, '形态 5-15 个交易日'),
    risks: [
      '收敛形态可能长期延续，提前交易会承受时间成本。',
      '假突破风险较高，必须结合收盘确认与量能过滤。',
      '单标的适配简化了原始多股票横截面计算，结果不可直接视为原论文回测表现。'
    ],
    evidence: factors.map((factor) => `${factor.name}: ${factor.value}（${factor.interpretation}）`),
    factors
  };
}
