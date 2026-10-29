import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getAgentApiKey, hasConsoleSecret, saveAgentSecret } from './secrets.js';

export const agentConfigSchema = z.object({
  id: z.enum(['agent1', 'agent2', 'agent3', 'agent4']),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(300),
  enabled: z.boolean(),
  provider: z.enum(['rule', 'openai', 'deepseek', 'qwen', 'moonshot', 'ollama', 'custom']),
  model: z.string().min(1).max(120),
  baseUrl: z.string().max(300),
  apiKeyEnv: z.string().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, '环境变量名只能包含字母、数字和下划线，不能填写 API Key'),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(32000),
  timeoutMs: z.number().int().min(1000).max(180000),
  systemPrompt: z.string().min(1).max(8000),
  parameters: z.record(z.union([z.number(), z.array(z.number())])).optional()
});

export const appConfigSchema = z.object({
  version: z.literal(1),
  marketData: z.object({
    sources: z.array(z.enum(['eastmoney', 'tencent'])).min(1),
    quoteTolerancePct: z.number().min(0.01).max(10),
    closeTolerancePct: z.number().min(0.01).max(10),
    quoteCacheSeconds: z.number().int().min(1).max(3600),
    dailyCacheSeconds: z.number().int().min(10).max(86400),
    newsCacheSeconds: z.number().int().min(10).max(86400)
  }),
  agents: z.array(agentConfigSchema).length(4),
  weights: z.object({
    agent1: z.number().min(0).max(1),
    agent2: z.number().min(0).max(1),
    agent3: z.number().min(0).max(1)
  })
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;

const configPath = path.resolve(process.cwd(), 'server/config/agents.json');
let cached: { config: AppConfig; mtimeMs: number } | null = null;

const defaultEnvNames: Record<string, string> = {
  agent1: 'AGENT1_API_KEY',
  agent2: 'AGENT2_API_KEY',
  agent3: 'AGENT3_API_KEY',
  agent4: 'AGENT4_API_KEY'
};

async function migrateLegacyApiKeys(parsed: unknown): Promise<boolean> {
  if (!parsed || typeof parsed !== 'object') return false;
  const agents = (parsed as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) return false;
  let changed = false;
  for (const candidate of agents) {
    if (!candidate || typeof candidate !== 'object') continue;
    const agent = candidate as { id?: unknown; apiKeyEnv?: unknown };
    if (typeof agent.id !== 'string' || typeof agent.apiKeyEnv !== 'string') continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(agent.apiKeyEnv)) continue;
    const defaultName = defaultEnvNames[agent.id];
    if (!defaultName) continue;
    if (!hasConsoleSecret(agent.id as 'agent1' | 'agent2' | 'agent3' | 'agent4')) {
      await saveAgentSecret(agent.id as 'agent1' | 'agent2' | 'agent3' | 'agent4', agent.apiKeyEnv);
    }
    agent.apiKeyEnv = defaultName;
    changed = true;
  }
  return changed;
}

export async function loadConfig(): Promise<AppConfig> {
  const stat = await fs.stat(configPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.config;

  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  const migrated = await migrateLegacyApiKeys(parsed);
  if (migrated) {
    try {
      await fs.copyFile(configPath, `${configPath}.pre-secret-migration.bak`);
    } catch {
      // Backup is best effort.
    }
    await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  }
  const config = appConfigSchema.parse(parsed);
  const total = config.weights.agent1 + config.weights.agent2 + config.weights.agent3;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`Agent权重之和必须为1，当前为 ${total}`);
  }
  cached = { config, mtimeMs: stat.mtimeMs };
  return config;
}

export async function saveConfig(next: unknown): Promise<AppConfig> {
  const config = appConfigSchema.parse(next);
  const total = config.weights.agent1 + config.weights.agent2 + config.weights.agent3;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`Agent权重之和必须为1，当前为 ${total}`);
  }
  try {
    await fs.copyFile(configPath, `${configPath}.bak`);
  } catch {
    // First save may not have an existing file.
  }
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  cached = null;
  return loadConfig();
}

export function getAgent(config: AppConfig, id: AgentConfig['id']): AgentConfig {
  const agent = config.agents.find((item) => item.id === id);
  if (!agent) throw new Error(`缺少Agent配置: ${id}`);
  return agent;
}

export function publicAgentMeta(config: AppConfig) {
  return config.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    enabled: agent.enabled,
    provider: agent.provider,
    model: agent.model,
    llmConfigured: agent.provider !== 'rule' && Boolean(resolveBaseUrl(agent) && getAgentApiKey(agent))
  }));
}

const providerBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  ollama: 'http://localhost:11434/v1'
};

export function resolveBaseUrl(agent: AgentConfig): string {
  if (agent.baseUrl.trim()) return agent.baseUrl.trim().replace(/\/$/, '');
  return providerBaseUrls[agent.provider] ?? '';
}
