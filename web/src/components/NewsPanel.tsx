import { ExternalLink, FileText, Newspaper } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { NewsItem } from '../../../shared/types.js';

export default function NewsPanel({ announcements, news }: { announcements: NewsItem[]; news: NewsItem[] }) {
  const [tab, setTab] = useState<'all' | 'announcement' | 'news'>('all');
  const items = useMemo(() => {
    const all = [...announcements, ...news].sort((a, b) => b.date.localeCompare(a.date));
    return tab === 'all' ? all : all.filter((item) => item.kind === tab);
  }, [announcements, news, tab]);

  return (
    <section className="panel news-panel">
      <div className="panel-heading news-heading">
        <div><Newspaper size={17} /><h2>公告与资讯</h2></div>
        <div className="segmented">
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>全部</button>
          <button className={tab === 'announcement' ? 'active' : ''} onClick={() => setTab('announcement')}>公告</button>
          <button className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}>资讯</button>
        </div>
      </div>
      <div className="news-list">
        {items.length ? items.slice(0, 14).map((item) => (
          <a key={`${item.kind}-${item.id}`} className="news-item" href={item.url} target="_blank" rel="noreferrer">
            <div className={`news-kind ${item.kind}`}>{item.kind === 'announcement' ? <FileText size={14} /> : <Newspaper size={14} />}</div>
            <div className="news-content">
              <div className="news-title-row"><h3>{item.title}</h3><ExternalLink size={13} /></div>
              {item.summary && <p>{item.summary}</p>}
              <div className="news-meta">
                <span>{item.date.slice(0, 16)}</span><span>{item.source}</span>
                <span className={`sentiment ${item.sentiment}`}>{item.sentiment === 'positive' ? '偏正面' : item.sentiment === 'negative' ? '偏负面' : '中性'}</span>
              </div>
            </div>
          </a>
        )) : <div className="empty-state">暂无可展示的消息</div>}
      </div>
    </section>
  );
}
