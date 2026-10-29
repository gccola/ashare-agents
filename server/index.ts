import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import type { AnalysisErrorEvent, AnalysisResultEvent, AnalysisStageEvent, AppMeta } from '../shared/types.js';
import { createAdminApp } from './admin.js';
import { loadConfig, publicAgentMeta } from './config.js';
import { runAnalysis } from './services/agents.js';
import { getDashboard, searchStocks } from './services/market.js';
import { loadSecrets } from './secrets.js';

try {
  process.loadEnvFile();
} catch {
  // .env is optional.
}

await loadSecrets();

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const adminPort = Number(process.env.ADMIN_PORT ?? 8788);
const adminHost = process.env.ADMIN_HOST ?? '0.0.0.0';

if (port === adminPort) throw new Error('PORT 与 ADMIN_PORT 不能相同');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'a-share-multi-agent-analyst', time: new Date().toISOString() });
});

app.get('/api/meta', asyncRoute(async (_req, res) => {
  const config = await loadConfig();
  const meta: AppMeta = {
    version: '1.0.0',
    sources: [
      { id: 'eastmoney', label: '东方财富', enabled: config.marketData.sources.includes('eastmoney') },
      { id: 'tencent', label: '腾讯行情', enabled: config.marketData.sources.includes('tencent') }
    ],
    agents: publicAgentMeta(config),
    strategyReferences: [
      { name: 'Qlib Alpha158 多因子框架', url: 'https://github.com/microsoft/qlib', usedBy: 'agent2' },
      { name: '均线收敛与发散形态因子', url: 'https://github.com/hugo2046/QuantsPlaybook', usedBy: 'agent3' }
    ]
  };
  res.json(meta);
}));

app.get('/api/search', asyncRoute(async (req, res) => {
  const query = z.string().min(1).max(40).parse(String(req.query.q ?? ''));
  res.json({ items: await searchStocks(query) });
}));

app.get('/api/dashboard', asyncRoute(async (req, res) => {
  const query = z.string().min(1).max(40).parse(String(req.query.q ?? ''));
  const config = await loadConfig();
  res.json(await getDashboard(query, config));
}));

app.post('/api/analysis/stream', asyncRoute(async (req, res) => {
  const query = z.string().min(1).max(40).parse(req.body?.query);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: AnalysisStageEvent | AnalysisResultEvent | AnalysisErrorEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const config = await loadConfig();
    const data = await getDashboard(query, config);
    const result = await runAnalysis(data, config, (event) => send(event));
    send({ type: 'result', data: result });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof z.ZodError ? 400 : 502;
  res.status(status).json({ error: message, details: error instanceof z.ZodError ? error.flatten() : undefined });
});

const webDist = path.resolve(process.cwd(), 'dist/web');
app.use(express.static(webDist));
app.get('*splat', (_req, res, next) => {
  res.sendFile(path.join(webDist, 'index.html'), (error) => {
    if (error) next();
  });
});

const adminApp = createAdminApp({ publicPort: port, adminPort });
const userServer = app.listen(port, host, () => {
  console.log(`用户端: http://${host}:${port}`);
});
const adminServer = adminApp.listen(adminPort, adminHost, () => {
  console.log(`管理端: http://${adminHost}:${adminPort}`);
  if (!process.env.ADMIN_TOKEN) {
    console.warn('ADMIN_TOKEN未设置：仅允许本机访问管理控制台。生产服务器必须配置 ADMIN_TOKEN。');
  }
});

function shutdown(): void {
  userServer.close();
  adminServer.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
