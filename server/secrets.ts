import fs from 'node:fs/promises';
import path from 'node:path';

type AgentId = 'agent1' | 'agent2' | 'agent3' | 'agent4';

interface KeyedAgent {
  id: AgentId;
  apiKeyEnv: string;
}

const secretsPath = path.resolve(process.cwd(), 'server/config/secrets.json');
let consoleSecrets: Partial<Record<AgentId, string>> = {};

export async function loadSecrets(): Promise<void> {
  try {
    const raw = await fs.readFile(secretsPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    consoleSecrets = Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => /^agent[1-4]$/.test(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, String(value).trim()])
    ) as Partial<Record<AgentId, string>>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
    consoleSecrets = {};
  }
}

export function getAgentApiKey(agent: KeyedAgent): string {
  const environmentKey = process.env[agent.apiKeyEnv]?.trim();
  return environmentKey || consoleSecrets[agent.id] || '';
}

export function getAgentKeyStatus(agent: KeyedAgent): {
  configured: boolean;
  source: 'environment' | 'console' | 'none';
} {
  if (process.env[agent.apiKeyEnv]?.trim()) return { configured: true, source: 'environment' };
  if (consoleSecrets[agent.id]) return { configured: true, source: 'console' };
  return { configured: false, source: 'none' };
}

export function hasConsoleSecret(agentId: AgentId): boolean {
  return Boolean(consoleSecrets[agentId]);
}

export async function saveAgentSecret(agentId: AgentId, apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (normalized) consoleSecrets[agentId] = normalized;
  else delete consoleSecrets[agentId];
  await fs.writeFile(secretsPath, `${JSON.stringify(consoleSecrets, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
