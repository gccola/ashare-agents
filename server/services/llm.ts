import { z } from 'zod';
import type { AgentAnalysis } from '../../shared/types.js';
import type { AgentConfig as BackendAgentConfig } from '../config.js';
import { resolveBaseUrl } from '../config.js';
import { getAgentApiKey } from '../secrets.js';

const actionSchema = z.object({
  horizon: z.string(),
  action: z.string(),
  entryZone: z.string(),
  stopLoss: z.string(),
  takeProfit: z.string(),
  position: z.string()
});

const llmAnalysisSchema = z.object({
  signal: z.enum(['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL']),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1),
  analysis: z.array(z.string()).min(1).max(8),
  action: actionSchema,
  risks: z.array(z.string()).min(1).max(8),
  evidence: z.array(z.string()).min(1).max(12)
});

export type LlmAnalysis = z.infer<typeof llmAnalysisSchema>;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
      reasoning?: unknown;
    };
    text?: unknown;
    finish_reason?: string;
  }>;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

interface ChatRequestResult {
  ok: boolean;
  status: number;
  body: string;
  payload: ChatPayload | null;
}

// Reasoning models consume part of max_tokens before emitting the final JSON.
// Keep a floor so a small UI value cannot truncate every structured analysis.
const MIN_STRUCTURED_MAX_TOKENS = 8192;
const MAX_STRUCTURED_RETRY_TOKENS = 16384;

function responseContent(payload: ChatPayload | null): string {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : typeof part === 'object' && part && 'text' in part ? String(part.text ?? '') : '')
      .join('')
      .trim();
  }
  if (typeof choice?.text === 'string') return choice.text.trim();
  return '';
}

function responseDiagnostic(payload: ChatPayload | null): string {
  const choice = payload?.choices?.[0];
  const finishReason = choice?.finish_reason ?? 'unknown';
  const completionTokens = payload?.usage?.completion_tokens;
  return `finish_reason=${finishReason}${completionTokens == null ? '' : `, completion_tokens=${completionTokens}`}`;
}

async function postChatCompletion(
  agent: BackendAgentConfig,
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonMode: boolean,
  signal: AbortSignal
): Promise<ChatRequestResult> {
  const baseUrl = resolveBaseUrl(agent);
  const requestBody = JSON.stringify({
    model: agent.model,
    temperature: agent.temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages
  });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: requestBody
      });
      const body = await response.text();
      let payload: ChatPayload | null = null;
      try {
        payload = JSON.parse(body) as ChatPayload;
      } catch {
        // Keep the raw body so callers can return a useful compatibility error.
      }
      const transientHttpFailure = [429, 500, 502, 503, 504].includes(response.status);
      const malformedSuccess = response.ok && payload === null;
      if ((transientHttpFailure || malformedSuccess) && attempt < 3) {
        lastError = new Error(`模型接口 HTTP ${response.status}: ${body.slice(0, 180)}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }
      return { ok: response.ok, status: response.status, body, payload };
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function postStructuredCompletion(
  agent: BackendAgentConfig,
  apiKey: string,
  messages: ChatMessage[],
  requestedMaxTokens: number,
  signal: AbortSignal
): Promise<ChatRequestResult> {
  const maxTokens = Math.max(requestedMaxTokens, MIN_STRUCTURED_MAX_TOKENS);
  let result = await postChatCompletion(agent, apiKey, messages, maxTokens, true, signal);

  // Some OpenAI-compatible gateways do not implement response_format yet.
  // Retry without it only when the gateway explicitly rejects that parameter.
  if (!result.ok && [400, 404, 422].includes(result.status) && /response_format|json_object/i.test(result.body)) {
    result = await postChatCompletion(agent, apiKey, messages, maxTokens, false, signal);
  }
  return result;
}

export function isLlmEnabled(agent: BackendAgentConfig): boolean {
  if (agent.provider === 'rule') return false;
  const baseUrl = resolveBaseUrl(agent);
  const key = getAgentApiKey(agent);
  return Boolean(baseUrl && (agent.provider === 'ollama' || key));
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('模型未返回JSON对象');
  return JSON.parse(candidate.slice(start, end + 1));
}

function toStringArray(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return items
    .map((item) => typeof item === 'string' ? item.trim() : String(item ?? '').trim())
    .filter(Boolean);
}

function normalizeSignal(value: unknown): string {
  const signal = String(value ?? '').trim().toUpperCase();
  const aliases: Record<string, string> = {
    '强烈买入': 'STRONG_BUY',
    '买入': 'BUY',
    '持有': 'HOLD',
    '卖出': 'SELL',
    '强烈卖出': 'STRONG_SELL',
    'STRONG BUY': 'STRONG_BUY',
    'STRONG SELL': 'STRONG_SELL'
  };
  return aliases[signal] ?? signal;
}

function normalizeScore(value: unknown): unknown {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : value;
}

function normalizeLlmOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const rawAction = record.action && typeof record.action === 'object' && !Array.isArray(record.action)
    ? record.action as Record<string, unknown>
    : {};
  const actionKeys = ['horizon', 'action', 'entryZone', 'stopLoss', 'takeProfit', 'position'] as const;
  return {
    ...record,
    signal: normalizeSignal(record.signal),
    score: normalizeScore(record.score),
    confidence: normalizeScore(record.confidence),
    summary: typeof record.summary === 'string' ? record.summary.trim() : record.summary,
    analysis: toStringArray(record.analysis).slice(0, 8),
    risks: toStringArray(record.risks).slice(0, 8),
    evidence: toStringArray(record.evidence).slice(0, 12),
    action: Object.fromEntries(actionKeys.map((key) => [key, String(rawAction[key] ?? '').trim()]))
  };
}

export async function callLlmJson(
  agent: BackendAgentConfig,
  userPrompt: string
): Promise<{ data: LlmAnalysis; latencyMs: number }> {
  const apiKey = getAgentApiKey(agent);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), agent.timeoutMs);
  const started = performance.now();
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      {
        role: 'user',
        content: `${userPrompt}\n\n严格只输出一个JSON对象，不要输出Markdown、解释或前后缀。请控制篇幅，每项分析保持简洁。字段必须为：signal, score, confidence, summary, analysis, action, risks, evidence。signal取STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL；score和confidence为0-100；action必须包含horizon, action, entryZone, stopLoss, takeProfit, position。`
      }
    ];
    let result = await postStructuredCompletion(agent, apiKey, messages, agent.maxTokens, controller.signal);
    if (!result.ok) {
      throw new Error(`模型接口 HTTP ${result.status}: ${result.body.slice(0, 240)}`);
    }
    let content = responseContent(result.payload);
    let diagnostic = responseDiagnostic(result.payload);

    // A reasoning model can spend the entire first budget on hidden reasoning.
    // Retry once with a larger ceiling before degrading to local rules.
    if (!content && result.payload?.choices?.[0]?.finish_reason === 'length') {
      result = await postStructuredCompletion(
        agent,
        apiKey,
        messages,
        MAX_STRUCTURED_RETRY_TOKENS,
        controller.signal
      );
      if (!result.ok) throw new Error(`模型接口 HTTP ${result.status}: ${result.body.slice(0, 240)}`);
      content = responseContent(result.payload);
      diagnostic = responseDiagnostic(result.payload);
    }
    if (!content) throw new Error(`模型返回内容为空（${diagnostic}）`);
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}（${diagnostic}）`);
    }
    let data: LlmAnalysis;
    try {
      data = llmAnalysisSchema.parse(normalizeLlmOutput(parsed));
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.issues.map((issue) => `${issue.path.join('.') || 'result'}: ${issue.message}`).join('；');
        throw new Error(`模型JSON字段不符合研判结构：${details}`);
      }
      throw error;
    }
    return { data, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

export function mergeLlmAnalysis(
  fallback: Omit<AgentAnalysis, 'model' | 'agentId' | 'name' | 'role'>,
  llm: LlmAnalysis,
  latencyMs: number,
  provider: string,
  model: string,
  enforceStrategySignal = false
): Omit<AgentAnalysis, 'agentId' | 'name' | 'role'> {
  const signalMismatch = enforceStrategySignal && llm.signal !== fallback.signal;
  const scoreMismatch = enforceStrategySignal && Math.abs(llm.score - fallback.score) > 8;
  return {
    ...fallback,
    signal: enforceStrategySignal ? fallback.signal : llm.signal,
    score: enforceStrategySignal ? fallback.score : Math.round(llm.score),
    confidence: Math.round(llm.confidence),
    summary: llm.summary,
    analysis: llm.analysis,
    action: llm.action,
    risks: llm.risks,
    evidence: llm.evidence,
    model: { provider, model, mode: 'llm', latencyMs },
    warning: signalMismatch || scoreMismatch
      ? '模型叙述与程序策略信号存在偏差，已保留可复现的程序信号与得分。'
      : undefined
  };
}

export function localModelMeta(provider: string, model: string, latencyMs: number) {
  return { provider, model, mode: 'rule-based' as const, latencyMs };
}

export interface AgentConnectionTestResult {
  ok: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

export async function testAgentConnection(
  agent: BackendAgentConfig,
  apiKeyOverride?: string
): Promise<AgentConnectionTestResult> {
  const started = performance.now();
  const baseUrl = resolveBaseUrl(agent);
  if (agent.provider === 'rule') {
    return {
      ok: true,
      provider: agent.provider,
      model: agent.model,
      baseUrl: '',
      latencyMs: Math.round(performance.now() - started),
      reply: '本地规则引擎可用，无需模型网络连接。'
    };
  }
  if (!baseUrl) {
    return {
      ok: false,
      provider: agent.provider,
      model: agent.model,
      baseUrl,
      latencyMs: Math.round(performance.now() - started),
      error: '缺少模型 Base URL。'
    };
  }
  const apiKey = apiKeyOverride?.trim() || getAgentApiKey(agent);
  if (agent.provider !== 'ollama' && !apiKey) {
    return {
      ok: false,
      provider: agent.provider,
      model: agent.model,
      baseUrl,
      latencyMs: Math.round(performance.now() - started),
      error: '缺少 API Key。请填写“模型 API Key”，或配置对应环境变量。'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(agent.timeoutMs, 30000));
  try {
    const testAgent: BackendAgentConfig = { ...agent, temperature: 0 };
    const result = await postStructuredCompletion(
      testAgent,
      apiKey,
      [
        { role: 'system', content: '这是结构化输出测试。只输出一个JSON对象，不要Markdown。' },
        { role: 'user', content: '输出 {"status":"ok","message":"结构化研判可用"}。' }
      ],
      1024,
      controller.signal
    );
    const latencyMs = Math.round(performance.now() - started);
    if (!result.ok) {
      return {
        ok: false,
        provider: agent.provider,
        model: agent.model,
        baseUrl,
        latencyMs,
        error: `模型接口 HTTP ${result.status}: ${result.body.slice(0, 280)}`
      };
    }
    const content = responseContent(result.payload);
    if (!content) {
      return {
        ok: false,
        provider: agent.provider,
        model: agent.model,
        baseUrl,
        latencyMs,
        error: `接口响应成功，但没有正文（${responseDiagnostic(result.payload)}）。`
      };
    }
    try {
      const structured = z.object({
        status: z.string(),
        message: z.string()
      }).parse(extractJson(content));
      if (structured.status.toLowerCase() !== 'ok') throw new Error(`测试状态为 ${structured.status}`);
      return {
        ok: true,
        provider: agent.provider,
        model: agent.model,
        baseUrl,
        latencyMs,
        reply: `结构化 JSON 正常：${structured.message}`
      };
    } catch (error) {
      return {
        ok: false,
        provider: agent.provider,
        model: agent.model,
        baseUrl,
        latencyMs,
        error: `模型未返回可用的结构化 JSON：${error instanceof Error ? error.message : String(error)}（${responseDiagnostic(result.payload)}）`
      };
    }
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? '测试请求超时。'
      : error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      provider: agent.provider,
      model: agent.model,
      baseUrl,
      latencyMs: Math.round(performance.now() - started),
      error: message
    };
  } finally {
    clearTimeout(timer);
  }
}
