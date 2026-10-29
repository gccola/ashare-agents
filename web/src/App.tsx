import { Activity, ExternalLink, GitBranch, Info, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnalysisResult,
  AnalysisStageEvent,
  AppMeta,
  DashboardData
} from '../../shared/types.js';
import { fetchDashboard, fetchMeta, streamAnalysis } from './api.js';
import AgentPanel from './components/AgentPanel.js';
import DataQuality from './components/DataQuality.js';
import IndicatorGrid from './components/IndicatorGrid.js';
import IntradayChart from './components/IntradayChart.js';
import KlineChart from './components/KlineChart.js';
import NewsPanel from './components/NewsPanel.js';
import QuoteHeader from './components/QuoteHeader.js';
import SearchBar from './components/SearchBar.js';

const initialStages: Record<string, AnalysisStageEvent> = {};

export default function App() {
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [stages, setStages] = useState(initialStages);
  const [loading, setLoading] = useState(true);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const analysisController = useRef<AbortController | null>(null);

  const loadStock = useCallback(async (query: string) => {
    loadController.current?.abort();
    analysisController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setStages({});
    try {
      const data = await fetchDashboard(query, controller.signal);
      setDashboard(data);
      document.title = `${data.stock.name} ${data.stock.code} · A股智析`;
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => undefined);
    void loadStock('600519');
    return () => {
      loadController.current?.abort();
      analysisController.current?.abort();
    };
  }, [loadStock]);

  const runAgents = async () => {
    if (!dashboard || analysisRunning) return;
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    setAnalysisRunning(true);
    setAnalysisError(null);
    setAnalysis(null);
    setStages({});
    try {
      await streamAnalysis(
        dashboard.stock.code,
        (event) => setStages((current) => ({ ...current, [event.agentId]: event })),
        (result) => setAnalysis(result),
        controller.signal
      );
    } catch (runError) {
      if (!(runError instanceof DOMException && runError.name === 'AbortError')) {
        setAnalysisError(runError instanceof Error ? runError.message : String(runError));
      }
    } finally {
      if (!controller.signal.aborted) setAnalysisRunning(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="ambient-grid" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Activity size={20} /></div>
          <div><strong>A股智析</strong><span>MULTI-AGENT RESEARCH</span></div>
        </div>
        <SearchBar loading={loading} onSelect={loadStock} />
      </header>

      <main>
        {error && (
          <div className="top-error panel"><Info size={18} /><div><strong>行情加载失败</strong><p>{error}</p></div><button onClick={() => loadStock('600519')}>加载示例</button></div>
        )}
        {loading && !dashboard && (
          <div className="loading-layout">
            <div className="skeleton hero-skeleton" /><div className="skeleton chart-skeleton" /><div className="skeleton chart-skeleton short" />
          </div>
        )}
        {dashboard && (
          <>
            <QuoteHeader data={dashboard} />
            <div className="workspace-grid">
              <div className="workspace-main">
                <IntradayChart data={dashboard} />
                <KlineChart data={dashboard} />
                <NewsPanel announcements={dashboard.announcements} news={dashboard.news} />
              </div>
              <aside className="workspace-side">
                <DataQuality validation={dashboard.validation} />
                <IndicatorGrid indicators={dashboard.indicators} />
                <section className="panel strategy-panel">
                  <div className="panel-heading"><div><GitBranch size={17} /><h2>开源策略参考</h2></div></div>
                  <p className="strategy-intro">策略信号由程序计算，大模型仅负责解释与形成条件化操作建议。</p>
                  {meta?.strategyReferences.map((reference) => (
                    <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="strategy-link">
                      <span>{reference.usedBy === 'agent2' ? 'AGENT 2' : 'AGENT 3'}</span>
                      <strong>{reference.name}</strong>
                      <small>{reference.url.replace('https://github.com/', '')}</small>
                      <ExternalLink size={14} />
                    </a>
                  ))}
                  <div className="config-note"><Info size={14} /><p>Agent模型、提示词、权重和数据源均在服务端 <code>server/config/agents.json</code> 与环境变量中配置，前端不接触密钥。</p></div>
                </section>
                <section className="panel method-panel">
                  <div className="panel-heading"><div><ShieldCheck size={17} /><h2>研究方法</h2></div></div>
                  <div className="method-row"><span>01</span><div><strong>多源共识</strong><p>核心行情与日K收盘价按容差交叉校验，低质量数据自动降低置信度。</p></div></div>
                  <div className="method-row"><span>02</span><div><strong>策略隔离</strong><p>三路Agent使用独立上下文与模型配置，避免单一模型自证。</p></div></div>
                  <div className="method-row"><span>03</span><div><strong>首席汇总</strong><p>Agent4显式处理分歧、风险和仓位，形成唯一最终结论。</p></div></div>
                </section>
              </aside>
            </div>
            <AgentPanel
              analysis={analysis}
              stages={stages}
              running={analysisRunning}
              error={analysisError}
              onRun={runAgents}
            />
          </>
        )}
      </main>
      <footer>
        <span>A股智析 · 多 Agent 量化研究台</span>
        <span>行情仅供研究参考，不构成投资建议</span>
        <span>数据：东方财富 / 腾讯行情</span>
      </footer>
    </div>
  );
}
