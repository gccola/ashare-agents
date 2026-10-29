import { Search, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StockSearchItem } from '../../../shared/types.js';
import { searchStocks } from '../api.js';

interface Props {
  loading: boolean;
  onSelect: (query: string) => void;
}

export default function SearchBar({ loading, onSelect }: Props) {
  const [value, setValue] = useState('');
  const [items, setItems] = useState<StockSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keyword = value.trim();
    if (!keyword) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        setItems(await searchStocks(keyword, controller.signal));
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setItems([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const submit = (query: string) => {
    const normalized = query.trim();
    if (!normalized) return;
    setOpen(false);
    setValue('');
    onSelect(normalized);
  };

  return (
    <div className="search-shell" ref={containerRef}>
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          submit(items[0]?.code ?? value);
        }}
      >
        {loading ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => items.length && setOpen(true)}
          placeholder="输入股票代码或名称，例如 600519 / 贵州茅台"
          aria-label="搜索股票"
        />
        <button type="submit" disabled={loading || (!value.trim() && !items.length)}>查询</button>
      </form>
      {open && (items.length > 0 || searching) && (
        <div className="search-results">
          {searching && <div className="search-empty">正在搜索…</div>}
          {items.map((item) => (
            <button key={`${item.secid}-${item.code}`} onClick={() => submit(item.code)} className="search-result">
              <span className="search-result-main">
                <strong>{item.name}</strong>
                <span>{item.code}</span>
              </span>
              <span className="search-result-meta">{item.exchange} · {item.securityType}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
