export interface AdminAgentConfig {
  id: 'agent1' | 'agent2' | 'agent3' | 'agent4';
  name: string;
  role: string;
  enabled: boolean;
  provider: 'rule' | 'openai' | 'deepseek' | 'qwen' | 'moonshot' | 'ollama' | 'custom';
  model: string;
  baseUrl: string;
  apiKeyEnv: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  systemPrompt: string;
  parameters?: Record<string, number | number[]>;
}

export interface AdminConfig {
  version: 1;
  marketData: {
    sources: Array<'eastmoney' | 'tencent'>;
    quoteTolerancePct: number;
    closeTolerancePct: number;
    quoteCacheSeconds: number;
    dailyCacheSeconds: number;
    newsCacheSeconds: number;
  };
  agents: AdminAgentConfig[];
  weights: { agent1: number; agent2: number; agent3: number };
}

export interface AdminStatus {
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  publicPort: number;
  adminPort: number;
  tokenConfigured: boolean;
  configVersion: number;
  enabledSources: string[];
  enabledAgents: number;
  agentKeyStatus: Array<{ id: string; env: string; configured: boolean; source: 'environment' | 'console' | 'local' | 'none'; provider: string; model: string }>;
  memory: { rss: number; heapUsed: number; heapTotal: number };
}

export interface AgentTestResult {
  ok: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

async function adminRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'x-admin-token': token } : {}),
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error ?? `HTTP ${response.status}`);
    Object.assign(error, { code: payload?.code, status: response.status });
    throw error;
  }
  return payload as T;
}

export function getSession(token: string) {
  return adminRequest<{ ok: true; mode: string; tokenConfigured: boolean }>('/api/admin/session', token);
}

export function getConfig(token: string) {
  return adminRequest<AdminConfig>('/api/admin/config', token);
}

export function getStatus(token: string) {
  return adminRequest<AdminStatus>('/api/admin/status', token);
}

export function validateConfig(token: string, config: AdminConfig) {
  return adminRequest<{ ok: true; config: AdminConfig; weightSum: number }>('/api/admin/config/validate', token, {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export function saveConfig(token: string, config: AdminConfig) {
  return adminRequest<{ ok: true; config: AdminConfig; appliedAt: string }>('/api/admin/config', token, {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}

export function saveAgentKey(token: string, agentId: string, apiKey: string) {
  return adminRequest<{ ok: true; agentId: string; cleared: boolean }>('/api/admin/secrets', token, {
    method: 'POST',
    body: JSON.stringify({ agentId, apiKey })
  });
}

export function testAgentConnection(token: string, agent: AdminAgentConfig, apiKey?: string) {
  return adminRequest<AgentTestResult>(`/api/admin/agents/${agent.id}/test`, token, {
    method: 'POST',
    body: JSON.stringify({ agent, apiKey })
  });
}
