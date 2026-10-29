import {
  Bot, BrainCircuit, Check, ChevronRight, CircleDashed, ExternalLink,
  LoaderCircle, Play, ShieldAlert, Sparkles, Target, TriangleAlert, X
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { AgentAnalysis, AnalysisResult, AnalysisStageEvent, FinalAnalysis, Signal } from '../../../shared/types.js';

type StageStatus = AnalysisStageEvent['status'] | 'idle';

interface Props {
  analysis: AnalysisResult | null;
  stages: Record<string, AnalysisStageEvent>;
  running: boolean;
  error: string | null;
  onRun: () => void;
}

const signalText: Record<Signal, string> = {
  STRONG_BUY: '强烈买入', BUY: '买入', HOLD: '持有 / 观望', SELL: '卖出', STRONG_SELL: '强烈卖出'
};

function signalClass(signal: Signal): string {
  return signal === 'STRONG_BUY' || signal === 'BUY' ? 'bullish' : signal === 'SELL' || signal === 'STRONG_SELL' ? 'bearish' : 'neutral';
}

function ScoreRing({ score, size = 'normal' }: { score: number; size?: 'normal' | 'small' }) {
  return (
    <div className={`score-ring ${size}`} style={{ '--score': score } as CSSProperties}>
      <strong>{score}</strong><span>/100</span>
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <Check size={14} />;
  if (status === 'running') return <LoaderCircle size={14} className="spin" />;
  if (status === 'error') return <X size={14} />;
  return <CircleDashed size={14} />;
}

function ActionPlan({ action }: { action: AgentAnalysis['action'] }) {
  return (
    <div className="action-grid">
      <div><span>观察周期</span><strong>{action.horizon}</strong></div>
      <div><span>参考区间</span><strong>{action.entryZone}</strong></div>
      <div><span>止损条件</span><strong>{action.stopLoss}</strong></div>
      <div><span>目标 / 退出</span><strong>{action.takeProfit}</strong></div>
      <div className="position-item"><span>仓位建议</span><strong>{action.position}</strong></div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentAnalysis }) {
  return (
    <article className="agent-card panel">
      <div className="agent-card-head">
        <div className={`agent-icon ${signalClass(agent.signal)}`}><Bot size={19} /></div>
        <div className="agent-title"><span>AGENT {agent.agentId.slice(-1)}</span><h3>{agent.name}</h3></div>
        <ScoreRing score={agent.score} size="small" />
      </div>
      <p className="agent-role">{agent.role}</p>
      <div className="agent-verdict">
        <span className={`signal-pill ${signalClass(agent.signal)}`}>{signalText[agent.signal]}</span>
        <span>置信度 {agent.confidence}%</span>
        <span className="model-badge">{agent.model.mode === 'llm' ? `${agent.model.provider} / ${agent.model.model}` : '本地规则引擎'}</span>
      </div>
      <p className="agent-summary">{agent.summary}</p>
      {agent.strategy && (
        <a className="strategy-source" href={agent.strategy.repositoryUrl} target="_blank" rel="noreferrer">
          <Sparkles size={14} />
          <div><span>策略参考 · {agent.strategy.repository}</span><strong>{agent.strategy.name}</strong></div>
          <ExternalLink size={13} />
        </a>
      )}
      <div className="factor-list">
        {agent.factors.slice(0, 5).map((factor) => (
          <div className="factor-row" key={factor.name}>
            <span className={`factor-dot ${factor.direction}`} />
            <span>{factor.name}</span>
            <strong>{factor.value}</strong>
            <small>{factor.interpretation}</small>
          </div>
        ))}
      </div>
      <div className="analysis-points">
        {agent.analysis.slice(0, 4).map((point) => <p key={point}>{point}</p>)}
      </div>
      <ActionPlan action={agent.action} />
      {agent.warning && <div className="inline-warning"><TriangleAlert size={14} />{agent.warning}</div>}
    </article>
  );
}

function FinalCard({ final, generatedAt, disclaimer }: { final: FinalAnalysis; generatedAt: string; disclaimer: string }) {
  return (
    <div className="final-analysis panel">
      <div className="final-top">
        <div className="final-badge"><BrainCircuit size={18} />Agent4 · 首席决策</div>
        <span className="final-time">{new Date(generatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
      </div>
      <div className="final-hero">
        <div>
          <span className="eyebrow">FINAL VERDICT</span>
          <div className={`final-signal ${signalClass(final.signal)}`}>{signalText[final.signal]}</div>
          <p>{final.summary}</p>
        </div>
        <ScoreRing score={final.score} />
      </div>
      <div className="final-meta-row">
        <span>综合置信度 <strong>{final.confidence}%</strong></span>
        <span className="model-badge">{final.model.mode === 'llm' ? `${final.model.provider} / ${final.model.model}` : '本地加权引擎'}</span>
      </div>
      <div className="final-sections">
        <div className="final-section">
          <h3><Target size={16} />操作计划</h3>
          <ActionPlan action={final.action} />
        </div>
        <div className="final-section">
          <h3><ChevronRight size={16} />整合逻辑</h3>
          {final.analysis.map((point) => <p key={point}>{point}</p>)}
        </div>
      </div>
      {final.conflicts.length > 0 && (
        <div className="conflict-box"><TriangleAlert size={15} /><div><strong>Agent分歧</strong>{final.conflicts.map((item) => <p key={item}>{item}</p>)}</div></div>
      )}
      <div className="risk-box"><ShieldAlert size={16} /><div><strong>主要风险</strong>{final.risks.slice(0, 5).map((risk) => <p key={risk}>{risk}</p>)}</div></div>
      {final.warning && <div className="inline-warning"><TriangleAlert size={14} />{final.warning}</div>}
      <p className="disclaimer">{disclaimer}</p>
    </div>
  );
}

export default function AgentPanel({ analysis, stages, running, error, onRun }: Props) {
  const stageIds = ['agent1', 'agent2', 'agent3', 'agent4'] as const;
  return (
    <section className="analysis-section" id="agent-analysis">
      <div className="section-title-row">
        <div><span className="eyebrow">MULTI-AGENT RESEARCH</span><h2>多 Agent 协作研判</h2><p>三路独立分析并行执行，首席决策 Agent 汇总分歧与数据质量。</p></div>
        <button className="primary-button" onClick={onRun} disabled={running}>
          {running ? <LoaderCircle size={17} className="spin" /> : <Play size={17} fill="currentColor" />}
          {running ? 'Agent 研判中…' : analysis ? '重新研判' : '启动 Agent 研判'}
        </button>
      </div>

      <div className="agent-pipeline panel">
        {stageIds.map((id, index) => {
          const stage = stages[id];
          const status: StageStatus = stage?.status ?? (analysis ? 'done' : 'idle');
          const labels = ['盘面舆情', '多因子', '收敛形态', '首席决策'];
          return (
            <div className="pipeline-step-wrap" key={id}>
              <div className={`pipeline-step ${status}`}>
                <div className="stage-icon"><StageIcon status={status} /></div>
                <div><span>AGENT {index + 1}</span><strong>{labels[index]}</strong><small>{stage?.message ?? '等待启动'}</small></div>
              </div>
              {index < stageIds.length - 1 && <div className={`pipeline-line ${status === 'done' ? 'done' : ''}`} />}
            </div>
          );
        })}
      </div>

      {error && <div className="analysis-error panel"><TriangleAlert size={17} /><div><strong>研判失败</strong><p>{error}</p></div></div>}

      {!analysis && !running && !error && (
        <div className="analysis-intro panel">
          <div className="intro-orbit"><BrainCircuit size={34} /></div>
          <div><h3>等待启动多 Agent 研究</h3><p>系统将同时运行盘面舆情、Qlib 多因子与收敛形态三路分析，再由 Agent4 整合为最终结论。当前模型与提示词均由后端配置。</p></div>
        </div>
      )}

      {analysis && (
        <div className="analysis-results">
          <FinalCard final={analysis.final} generatedAt={analysis.generatedAt} disclaimer={analysis.disclaimer} />
          <div className="agent-card-grid">{analysis.agents.map((agent) => <AgentCard key={agent.agentId} agent={agent} />)}</div>
        </div>
      )}
    </section>
  );
}
