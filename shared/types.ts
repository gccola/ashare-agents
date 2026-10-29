export type Exchange = 'SH' | 'SZ' | 'BJ';
export type Signal = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
export type SourceStatus = 'ok' | 'error' | 'disabled';

export interface StockRef {
  code: string;
  name: string;
  exchange: Exchange;
  secid: string;
  tencentCode: string;
}

export interface StockSearchItem extends StockRef {
  securityType: string;
  display: string;
}

export interface ProviderQuote {
  source: string;
  sourceLabel: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  change: number;
  changePct: number;
  turnoverRate?: number;
  pe?: number;
  pb?: number;
  timestamp: string;
  fetchedAt: string;
  latencyMs: number;
}

export interface Quote extends ProviderQuote {
  code: string;
  name: string;
  exchange: Exchange;
}

export interface DailyBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePct?: number;
  turnoverRate?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  rsi14?: number;
  dif?: number;
  dea?: number;
  macd?: number;
  bollUpper?: number;
  bollMid?: number;
  bollLower?: number;
  k?: number;
  d?: number;
  j?: number;
  atr14?: number;
}

export interface IntradayPoint {
  time: string;
  price: number;
  avgPrice: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}

export interface IndicatorSnapshot {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  dif: number | null;
  dea: number | null;
  macd: number | null;
  bollUpper: number | null;
  bollMid: number | null;
  bollLower: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  atr14: number | null;
  volumeRatio: number | null;
  return5d: number | null;
  return20d: number | null;
  trendScore: number;
  technicalSignals: string[];
}

export interface NewsItem {
  id: string;
  kind: 'announcement' | 'news';
  title: string;
  summary: string;
  date: string;
  source: string;
  url: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
}

export interface ValidationMetric {
  field: string;
  label: string;
  values: Array<{ source: string; value: number | null }>;
  consensus: number | null;
  maxDeviationPct: number | null;
  status: 'pass' | 'warning' | 'fail';
}

export interface DataValidation {
  score: number;
  status: 'verified' | 'warning' | 'failed';
  quoteMetrics: ValidationMetric[];
  closeDeviationPct: number | null;
  matchedTradingDays: number;
  notes: string[];
  sourceStatus: Array<{ id: string; label: string; status: SourceStatus; latencyMs: number | null; error?: string }>;
}

export interface DashboardData {
  stock: StockRef;
  quote: Quote;
  providerQuotes: ProviderQuote[];
  daily: DailyBar[];
  intraday: IntradayPoint[];
  indicators: IndicatorSnapshot;
  announcements: NewsItem[];
  news: NewsItem[];
  validation: DataValidation;
  generatedAt: string;
  cache: { quote: boolean; daily: boolean; news: boolean };
}

export interface AgentAction {
  horizon: string;
  action: string;
  entryZone: string;
  stopLoss: string;
  takeProfit: string;
  position: string;
}

export interface AgentFactor {
  name: string;
  value: string;
  interpretation: string;
  direction: 'positive' | 'neutral' | 'negative';
}

export interface AgentAnalysis {
  agentId: 'agent1' | 'agent2' | 'agent3';
  name: string;
  role: string;
  signal: Signal;
  score: number;
  confidence: number;
  summary: string;
  analysis: string[];
  action: AgentAction;
  risks: string[];
  evidence: string[];
  factors: AgentFactor[];
  strategy?: {
    name: string;
    repository: string;
    repositoryUrl: string;
    description: string;
  };
  model: {
    provider: string;
    model: string;
    mode: 'llm' | 'rule-based';
    latencyMs: number;
  };
  warning?: string;
}

export interface FinalAnalysis {
  agentId: 'agent4';
  name: string;
  signal: Signal;
  score: number;
  confidence: number;
  summary: string;
  consensus: string;
  analysis: string[];
  action: AgentAction;
  risks: string[];
  conflicts: string[];
  model: {
    provider: string;
    model: string;
    mode: 'llm' | 'rule-based';
    latencyMs: number;
  };
  warning?: string;
}

export interface AnalysisResult {
  stock: StockRef;
  generatedAt: string;
  dataQuality: {
    score: number;
    status: DataValidation['status'];
  };
  agents: AgentAnalysis[];
  final: FinalAnalysis;
  disclaimer: string;
}

export interface AgentMeta {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
  provider: string;
  model: string;
  llmConfigured: boolean;
}

export interface AppMeta {
  version: string;
  sources: Array<{ id: string; label: string; enabled: boolean }>;
  agents: AgentMeta[];
  strategyReferences: Array<{ name: string; url: string; usedBy: string }>;
}

export interface AnalysisStageEvent {
  type: 'stage';
  agentId: 'agent1' | 'agent2' | 'agent3' | 'agent4';
  status: 'pending' | 'running' | 'done' | 'error';
  message: string;
  timestamp: string;
}

export interface AnalysisResultEvent {
  type: 'result';
  data: AnalysisResult;
}

export interface AnalysisErrorEvent {
  type: 'error';
  message: string;
}
