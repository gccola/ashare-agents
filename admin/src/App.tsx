import {
  Activity, Bot, Check, ChevronDown, CircleAlert, Database, Eye, EyeOff,
  Gauge, KeyRound, LoaderCircle, LogOut, Save, Server, Settings2, ShieldCheck, SlidersHorizontal, X
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AdminAgentConfig, AdminConfig, AdminStatus, AgentTestResult } from './api.js';
import { getConfig, getSession, getStatus, saveAgentKey, saveConfig, testAgentConnection, validateConfig } from './api.js';

const providerLabels: Record<AdminAgentConfig['provider'], string> = {
  rule: '本地规则引擎',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  moonshot: 'Moonshot',
  ollama: 'Ollama 本地',
  custom: '自定义兼容接口'
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}天 ${hours}小时`;
  if (hours) return `${hours}小时 ${minutes}分`;
  return `${minutes}分钟`;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Login({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onLogin(token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-grid" />
      <section className="login-card">
        <div className="admin-logo"><Settings2 size={24} /></div>
        <span className="kicker">OPERATIONS CONSOLE</span>
        <h1>管理控制台</h1>
        <p>配置 Agent 模型、数据源、校验阈值和融合权重。管理令牌仅保存在当前浏览器会话中。</p>
        <form onSubmit={submit}>
          <label>管理员令牌</label>
          <div className="token-input">
            <KeyRound size={17} />
            <input type={show ? 'text' : 'password'} value={token} onChange={(event) => setToken(event.target.value)} placeholder="输入 ADMIN_TOKEN；本机开发可留空" autoFocus />
            <button type="button" onClick={() => setShow((current) => !current)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {error && <div className="login-error"><CircleAlert size={15} />{error}</div>}
          <button className="login-button" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}{loading ? '正在验证…' : '进入控制台'}</button>
        </form>
        <div className="login-note"><Server size={14} /><span>生产服务器必须在环境变量中设置强随机 ADMIN_TOKEN。</span></div>
      </section>
    </main>
  );
}

function StatusCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className={`status-card ${tone ?? ''}`}>
      <div className="status-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>
  );
}

function AgentEditor({
  agent, index, tokenStatus, onChange, onSaveSecret, onTest
}: {
  agent: AdminAgentConfig;
  index: number;
  tokenStatus?: { env: string; configured: boolean; source: 'environment' | 'console' | 'local' | 'none' };
  onChange: (agent: AdminAgentConfig) => void;
  onSaveSecret: (agentId: AdminAgentConfig['id'], apiKey: string) => Promise<void>;
  onTest: (agent: AdminAgentConfig, apiKey?: string) => Promise<AgentTestResult>;
}) {
  const [parametersText, setParametersText] = useState(JSON.stringify(agent.parameters ?? {}, null, 2));
  const [parameterError, setParameterError] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState('');
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null);
  const envNameValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(agent.apiKeyEnv);

  useEffect(() => {
    setParametersText(JSON.stringify(agent.parameters ?? {}, null, 2));
  }, [agent.id]);

  const update = <K extends keyof AdminAgentConfig>(key: K, value: AdminAgentConfig[K]) => {
    setTestResult(null);
    setSecretMessage(null);
    onChange({ ...agent, [key]: value });
  };

  const updateParameters = (value: string) => {
    setParametersText(value);
    try {
      const parsed = value.trim() ? JSON.parse(value) : {};
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('参数必须是 JSON 对象');
      for (const [key, item] of Object.entries(parsed)) {
        if (typeof item !== 'number' && !(Array.isArray(item) && item.every((entry) => typeof entry === 'number'))) throw new Error(`参数 ${key} 必须是数字或数字数组`);
      }
      setParameterError(null);
      onChange({ ...agent, parameters: parsed });
    } catch (error) {
      setParameterError(error instanceof Error ? error.message : String(error));
    }
  };

  const submitSecret = async (apiKey: string) => {
    setSecretSaving(true);
    setSecretMessage(null);
    try {
      await onSaveSecret(agent.id, apiKey);
      setSecretInput('');
      setSecretMessage(apiKey.trim() ? '密钥已保存，后续分析立即生效。' : '控制台密钥已清除。');
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSecretSaving(false);
    }
  };

  const submitTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest(agent, secretInput || undefined));
    } catch (error) {
      setTestResult({
        ok: false,
        provider: agent.provider,
        model: agent.model,
        baseUrl: agent.baseUrl,
        latencyMs: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <details className="agent-editor" open={index < 2}>
      <summary>
        <div className={`agent-number agent${index + 1}`}>{index + 1}</div>
        <div className="agent-summary-copy"><span>AGENT {index + 1}</span><strong>{agent.name}</strong><small>{agent.role}</small></div>
        <div className="agent-summary-meta">
          <span className={agent.enabled ? 'enabled' : 'disabled'}>{agent.enabled ? '已启用' : '已停用'}</span>
          <span>{providerLabels[agent.provider]} / {agent.model}</span>
          <ChevronDown size={16} />
        </div>
      </summary>
      <div className="agent-editor-body">
        <div className="form-grid two">
          <label className="field"><span>Agent 名称</span><input value={agent.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label className="toggle-field"><span>启用状态</span><button type="button" className={`toggle ${agent.enabled ? 'on' : ''}`} onClick={() => update('enabled', !agent.enabled)}><i />{agent.enabled ? '启用' : '停用'}</button></label>
        </div>
        <label className="field"><span>职责说明</span><input value={agent.role} onChange={(event) => update('role', event.target.value)} /></label>
        <div className="form-grid three">
          <label className="field"><span>模型供应商</span><select value={agent.provider} onChange={(event) => update('provider', event.target.value as AdminAgentConfig['provider'])}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>模型名称</span><input value={agent.model} onChange={(event) => update('model', event.target.value)} placeholder="例如 deepseek-chat" /></label>
          <label className="field"><span>环境变量名称 <small>高级，只填变量名</small></span><input className={!envNameValid ? 'invalid' : ''} value={agent.apiKeyEnv} onChange={(event) => update('apiKeyEnv', event.target.value)} placeholder="AGENT1_API_KEY" /><small className={!envNameValid ? 'env-invalid' : tokenStatus?.configured ? 'env-ok' : 'env-missing'}>{!envNameValid ? '这里不能填 API Key，请填 AGENT1_API_KEY 这类变量名' : tokenStatus?.configured ? '服务器已检测到该变量' : '服务器尚未检测到该变量'}</small></label>
        </div>
        <label className="field"><span>自定义 Base URL <small>留空使用供应商默认地址</small></span><input value={agent.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder="https://api.example.com/v1" /></label>
        <div className="secret-box">
          <div className="secret-box-copy">
            <span><KeyRound size={14} />模型 API Key</span>
            <p>{tokenStatus?.source === 'environment' ? `当前使用环境变量 ${tokenStatus.env}，环境变量优先于控制台密钥。` : tokenStatus?.source === 'console' ? '控制台已保存密钥。输入新密钥可覆盖，密钥不会回显。' : '直接在这里填写供应商 API Key；密钥只保存在后端，不会返回前端。'}</p>
          </div>
          <div className="secret-control">
            <input
              type="password"
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              placeholder={tokenStatus?.source === 'environment' ? '环境变量已配置' : tokenStatus?.source === 'console' ? '已配置，输入新密钥可替换' : '输入 API Key，例如 sk-...'}
              disabled={tokenStatus?.source === 'environment'}
              autoComplete="new-password"
            />
            <button type="button" className="test-secret" onClick={submitTest} disabled={testing}>{testing ? <LoaderCircle size={14} className="spin" /> : <Activity size={14} />}{testing ? '测试中…' : '测试连接'}</button>
            <button type="button" onClick={() => submitSecret(secretInput)} disabled={secretSaving || !secretInput.trim() || tokenStatus?.source === 'environment'}>{secretSaving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}保存密钥</button>
            {tokenStatus?.source === 'console' && <button type="button" className="clear-secret" onClick={() => submitSecret('')} disabled={secretSaving}>清除</button>}
          </div>
          {secretMessage && <small className={secretMessage.includes('已保存') || secretMessage.includes('已清除') ? 'secret-success' : 'secret-error'}>{secretMessage}</small>}
          {testResult && <div className={`agent-test-result ${testResult.ok ? 'success' : 'error'}`}>{testResult.ok ? <Check size={15} /> : <X size={15} />}<div><strong>{testResult.ok ? `连接正常 · ${testResult.latencyMs} ms` : `测试失败 · ${testResult.latencyMs} ms`}</strong><p>{testResult.ok ? testResult.reply : testResult.error}</p><small>{testResult.provider} / {testResult.model}</small></div></div>}
        </div>
        <div className="form-grid four">
          <NumberField label="温度" value={agent.temperature} min={0} max={2} step={0.05} onChange={(value) => update('temperature', value)} />
          <NumberField label="最大输出 Tokens（研判建议 8192）" value={agent.maxTokens} min={128} max={32000} onChange={(value) => update('maxTokens', value)} />
          <NumberField label="超时（毫秒）" value={agent.timeoutMs} min={1000} max={180000} step={1000} onChange={(value) => update('timeoutMs', value)} />
          <div className="field"><span>当前模式</span><div className="readonly-value">{agent.provider === 'rule' ? '本地可复现规则' : tokenStatus?.configured ? '模型 + 规则降级' : '缺少密钥，自动降级'}</div></div>
        </div>
        <label className="field"><span>系统提示词</span><textarea className="prompt-textarea" value={agent.systemPrompt} onChange={(event) => update('systemPrompt', event.target.value)} /></label>
        <label className="field"><span>策略参数 <small>JSON 对象，仅 Agent2 / Agent3 使用</small></span><textarea className={`code-textarea ${parameterError ? 'invalid' : ''}`} value={parametersText} onChange={(event) => updateParameters(event.target.value)} />{parameterError && <small className="field-error">{parameterError}</small>}</label>
      </div>
    </details>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('a-share-admin-token') ?? '');
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const connect = async (nextToken: string) => {
    const session = await getSession(nextToken);
    const [loadedConfig, loadedStatus] = await Promise.all([getConfig(nextToken), getStatus(nextToken)]);
    sessionStorage.setItem('a-share-admin-token', nextToken);
    setToken(nextToken);
    setConfig(loadedConfig);
    setStatus(loadedStatus);
    setAuthenticated(true);
    setDirty(false);
    setNotice({ type: 'success', message: session.mode === 'local-development' ? '已进入本机开发模式' : '管理令牌验证成功' });
  };

  useEffect(() => {
    connect(token)
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  const weightSum = useMemo(() => config ? config.weights.agent1 + config.weights.agent2 + config.weights.agent3 : 0, [config]);
  const envNamesValid = useMemo(() => config?.agents.every((agent) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(agent.apiKeyEnv)) ?? false, [config]);

  const patchConfig = (next: AdminConfig) => {
    setConfig(next);
    setDirty(true);
    setNotice(null);
  };

  const refreshStatus = async () => {
    if (!authenticated) return;
    setStatus(await getStatus(token));
  };

  const validate = async () => {
    if (!config) return;
    setValidating(true);
    setNotice(null);
    try {
      const result = await validateConfig(token, config);
      setNotice({ type: 'success', message: `配置校验通过，权重合计 ${result.weightSum.toFixed(2)}` });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setValidating(false);
    }
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveConfig(token, config);
      setConfig(result.config);
      setDirty(false);
      setNotice({ type: 'success', message: `配置已保存并生效：${new Date(result.appliedAt).toLocaleTimeString('zh-CN', { hour12: false })}` });
      await refreshStatus();
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  if (checking) return <div className="boot-screen"><LoaderCircle size={24} className="spin" /><span>正在连接管理服务…</span></div>;
  if (!authenticated || !config) return <Login onLogin={connect} />;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand"><div className="admin-logo small"><Settings2 size={20} /></div><div><strong>A股智析</strong><span>BACKEND CONTROL CENTER</span></div></div>
        <div className="header-actions">
          <span className="connection-state"><i />管理服务已连接</span>
          <button className="ghost-button" onClick={() => { sessionStorage.removeItem('a-share-admin-token'); setAuthenticated(false); setToken(''); }}><LogOut size={15} />退出</button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-title-row">
          <div><span className="kicker">SYSTEM CONFIGURATION</span><h1>后端配置中心</h1><p>所有修改保存到服务端配置文件，并立即应用到后续分析请求。</p></div>
          <div className="title-actions">
            <button className="secondary-button" onClick={validate} disabled={validating}><Check size={16} />{validating ? '校验中…' : '校验配置'}</button>
            <button className="save-button" onClick={save} disabled={saving || !dirty || !envNamesValid}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{saving ? '保存中…' : !envNamesValid ? '请修正变量名' : dirty ? '保存并应用' : '已保存'}</button>
          </div>
        </section>

        {notice && <div className={`admin-notice ${notice.type}`}>{notice.type === 'success' ? <Check size={16} /> : <X size={16} />}<span>{notice.message}</span><button onClick={() => setNotice(null)}><X size={14} /></button></div>}

        <section className="status-grid">
          <StatusCard icon={<Server size={19} />} label="用户端端口" value={`:${status?.publicPort ?? 8787}`} detail="行情、分析、公开 API" tone="blue" />
          <StatusCard icon={<Settings2 size={19} />} label="管理端端口" value={`:${status?.adminPort ?? 8788}`} detail="配置与运行状态" tone="teal" />
          <StatusCard icon={<Bot size={19} />} label="启用 Agent" value={`${status?.enabledAgents ?? config.agents.filter((agent) => agent.enabled).length} / 4`} detail={`${config.agents.filter((agent) => agent.provider !== 'rule').length} 个配置了外部模型`} tone="purple" />
          <StatusCard icon={<Activity size={19} />} label="服务运行" value={formatUptime(status?.uptimeSeconds ?? 0)} detail={`${status?.nodeVersion ?? '-'} · 内存 ${formatMemory(status?.memory.rss ?? 0)}`} tone="gold" />
        </section>

        <div className="config-layout">
          <div className="config-main">
            <section className="config-card">
              <div className="config-card-head"><div className="card-icon"><Database size={18} /></div><div><h2>数据源与准确性</h2><p>至少启用一个行情源；启用两个数据源时执行交叉校验。</p></div></div>
              <div className="source-options">
                {[{ id: 'eastmoney', name: '东方财富', detail: '行情、日K、分时、公告与资讯' }, { id: 'tencent', name: '腾讯行情', detail: '行情、日K与分时备用源' }].map((source) => {
                  const enabled = config.marketData.sources.includes(source.id as 'eastmoney' | 'tencent');
                  return <button key={source.id} className={`source-option ${enabled ? 'selected' : ''}`} onClick={() => {
                    const sources = enabled ? config.marketData.sources.filter((item) => item !== source.id) : [...config.marketData.sources, source.id as 'eastmoney' | 'tencent'];
                    if (sources.length) patchConfig({ ...config, marketData: { ...config.marketData, sources } });
                  }}><span className="source-check">{enabled && <Check size={13} />}</span><div><strong>{source.name}</strong><small>{source.detail}</small></div></button>;
                })}
              </div>
              <div className="form-grid four">
                <NumberField label="行情容差 %" value={config.marketData.quoteTolerancePct} min={0.01} max={10} step={0.05} onChange={(value) => patchConfig({ ...config, marketData: { ...config.marketData, quoteTolerancePct: value } })} />
                <NumberField label="K线容差 %" value={config.marketData.closeTolerancePct} min={0.01} max={10} step={0.05} onChange={(value) => patchConfig({ ...config, marketData: { ...config.marketData, closeTolerancePct: value } })} />
                <NumberField label="行情缓存 秒" value={config.marketData.quoteCacheSeconds} min={1} max={3600} onChange={(value) => patchConfig({ ...config, marketData: { ...config.marketData, quoteCacheSeconds: value } })} />
                <NumberField label="K线缓存 秒" value={config.marketData.dailyCacheSeconds} min={10} max={86400} onChange={(value) => patchConfig({ ...config, marketData: { ...config.marketData, dailyCacheSeconds: value } })} />
              </div>
            </section>

            <section className="config-card agent-config-card">
              <div className="config-card-head"><div className="card-icon"><SlidersHorizontal size={18} /></div><div><h2>Agent 独立配置</h2><p>每个 Agent 可独立选择供应商、模型、提示词和运行参数。</p></div></div>
              <div className="agent-config-help"><KeyRound size={16} /><p>展开任意 Agent，在“模型 API Key”输入框中直接填写密钥并保存。“测试连接”会验证结构化 JSON；正式研判最低使用 8192 tokens，Agent4 建议 16384 tokens、180 秒超时。</p></div>
              <div className="agent-editor-list">{config.agents.map((agent, index) => <AgentEditor key={agent.id} agent={agent} index={index} tokenStatus={status?.agentKeyStatus.find((item) => item.id === agent.id)} onChange={(next) => patchConfig({ ...config, agents: config.agents.map((item) => item.id === agent.id ? next : item) })} onSaveSecret={async (agentId, apiKey) => { await saveAgentKey(token, agentId, apiKey); await refreshStatus(); setNotice({ type: 'success', message: apiKey.trim() ? `${agentId.toUpperCase()} 密钥已保存并生效` : `${agentId.toUpperCase()} 控制台密钥已清除` }); }} onTest={(agentToTest, apiKey) => testAgentConnection(token, agentToTest, apiKey)} />)}</div>
            </section>
          </div>

          <aside className="config-side">
            <section className="config-card">
              <div className="config-card-head compact"><div className="card-icon"><Gauge size={18} /></div><div><h2>融合权重</h2><p>三个前序 Agent 权重之和必须为 1。</p></div></div>
              <div className="weight-list">
                {(['agent1', 'agent2', 'agent3'] as const).map((id) => <NumberField key={id} label={config.agents.find((agent) => agent.id === id)?.name ?? id} value={config.weights[id]} min={0} max={1} step={0.05} onChange={(value) => patchConfig({ ...config, weights: { ...config.weights, [id]: value } })} />)}
              </div>
              <div className={`weight-sum ${Math.abs(weightSum - 1) < 0.001 ? 'valid' : 'invalid'}`}><span>当前合计</span><strong>{weightSum.toFixed(2)}</strong>{Math.abs(weightSum - 1) < 0.001 ? <Check size={15} /> : <CircleAlert size={15} />}</div>
            </section>

            <section className="config-card">
              <div className="config-card-head compact"><div className="card-icon"><KeyRound size={18} /></div><div><h2>模型密钥状态</h2><p>环境变量优先，控制台密钥作为后备。</p></div></div>
              <div className="key-status-list">{status?.agentKeyStatus.map((item) => <div key={item.id}><span className={`status-dot ${item.configured ? 'ok' : ''}`} /><div><strong>{item.id.toUpperCase()} · {item.env}</strong><small>{item.provider === 'rule' ? '本地规则模式' : item.source === 'environment' ? '使用服务器环境变量' : item.source === 'console' ? '使用控制台保存的密钥' : item.source === 'local' ? 'Ollama 本地模式' : '未配置，将自动降级'}</small></div></div>)}</div>
            </section>

            <section className="config-card security-card">
              <div className="config-card-head compact"><div className="card-icon"><ShieldCheck size={18} /></div><div><h2>服务器安全</h2><p>当前管理端状态</p></div></div>
              <div className="security-row"><span>管理令牌</span><strong className={status?.tokenConfigured ? 'ok' : 'warn'}>{status?.tokenConfigured ? '已配置' : '本机开发模式'}</strong></div>
              <div className="security-row"><span>监听地址</span><strong>0.0.0.0</strong></div>
              <div className="security-row"><span>配置文件备份</span><strong className="ok">自动生成 .bak</strong></div>
              <p className="security-note">部署到公网前，请设置 ADMIN_TOKEN，并只向可信网络开放 8788 端口。</p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
