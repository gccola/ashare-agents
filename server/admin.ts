import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { agentConfigSchema, appConfigSchema, loadConfig, saveConfig } from './config.js';
import { getAgentKeyStatus, saveAgentSecret } from './secrets.js';
import { clearMarketCache } from './services/market.js';
import { testAgentConnection } from './services/llm.js';

interface AdminAppOptions {
  publicPort: number;
  adminPort: number;
}

function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function isLoopback(req: express.Request): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function requireAdmin(req: express.Request, res: express.Response): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    if (isLoopback(req)) return true;
    res.status(503).json({
      error: '服务器未配置 ADMIN_TOKEN，管理控制台已禁止远程访问',
      code: 'ADMIN_TOKEN_REQUIRED'
    });
    return false;
  }
  if (req.header('x-admin-token') !== expected) {
    res.status(401).json({ error: '管理令牌无效', code: 'INVALID_ADMIN_TOKEN' });
    return false;
  }
  return true;
}

export function createAdminApp(options: AdminAppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'a-share-admin-console', time: new Date().toISOString() });
  });

  app.get('/api/admin/session', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
      ok: true,
      mode: process.env.ADMIN_TOKEN ? 'token' : 'local-development',
      tokenConfigured: Boolean(process.env.ADMIN_TOKEN)
    });
  });

  app.get('/api/admin/status', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const config = await loadConfig();
    res.json({
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      publicPort: options.publicPort,
      adminPort: options.adminPort,
      tokenConfigured: Boolean(process.env.ADMIN_TOKEN),
      configVersion: config.version,
      enabledSources: config.marketData.sources,
      enabledAgents: config.agents.filter((agent) => agent.enabled).length,
      agentKeyStatus: config.agents.map((agent) => {
        const keyStatus = getAgentKeyStatus(agent);
        return {
          id: agent.id,
          env: agent.apiKeyEnv,
          configured: agent.provider === 'ollama' || keyStatus.configured,
          source: agent.provider === 'ollama' ? 'local' : keyStatus.source,
          provider: agent.provider,
          model: agent.model
        };
      }),
      memory: process.memoryUsage()
    });
  }));

  app.get('/api/admin/config', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await loadConfig());
  }));

  app.post('/api/admin/config/validate', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const config = appConfigSchema.parse(req.body);
    const weightSum = config.weights.agent1 + config.weights.agent2 + config.weights.agent3;
    if (Math.abs(weightSum - 1) > 0.001) throw new Error(`Agent权重之和必须为1，当前为 ${weightSum}`);
    res.json({ ok: true, config, weightSum });
  }));

  app.put('/api/admin/config', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const config = await saveConfig(req.body);
    clearMarketCache();
    res.json({ ok: true, config, appliedAt: new Date().toISOString() });
  }));

  app.post('/api/admin/secrets', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const input = z.object({
      agentId: z.enum(['agent1', 'agent2', 'agent3', 'agent4']),
      apiKey: z.string().max(1000)
    }).parse(req.body);
    await saveAgentSecret(input.agentId, input.apiKey);
    res.json({ ok: true, agentId: input.agentId, cleared: !input.apiKey.trim() });
  }));

  app.post('/api/admin/agents/:id/test', asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const agent = agentConfigSchema.parse(req.body?.agent);
    if (agent.id !== req.params.id) {
      res.status(400).json({ ok: false, error: '路径中的 Agent ID 与请求体不一致。' });
      return;
    }
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : undefined;
    res.json(await testAgentConnection(agent, apiKey));
  }));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof z.ZodError ? 400 : 500;
    res.status(status).json({
      error: message,
      details: error instanceof z.ZodError ? error.flatten() : undefined
    });
  });

  const adminDist = path.resolve(process.cwd(), 'dist/admin');
  app.use(express.static(adminDist));
  app.get('*splat', (_req, res, next) => {
    res.sendFile(path.join(adminDist, 'index.html'), (error) => {
      if (error) next();
    });
  });

  return app;
}
