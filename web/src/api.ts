import type {
  AnalysisResult,
  AnalysisStageEvent,
  AppMeta,
  DashboardData,
  StockSearchItem
} from '../../shared/types.js';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const payload = contentType.includes('application/json') ? await response.json() : null;
    throw new Error(payload?.error ?? `请求失败：HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchMeta(): Promise<AppMeta> {
  return request<AppMeta>('/api/meta');
}

export async function searchStocks(query: string, signal?: AbortSignal): Promise<StockSearchItem[]> {
  const data = await request<{ items: StockSearchItem[] }>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  return data.items;
}

export function fetchDashboard(query: string, signal?: AbortSignal): Promise<DashboardData> {
  return request<DashboardData>(`/api/dashboard?q=${encodeURIComponent(query)}`, { signal });
}

export async function streamAnalysis(
  query: string,
  onStage: (event: AnalysisStageEvent) => void,
  onResult: (result: AnalysisResult) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/analysis/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `分析请求失败：HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const eventLine = block.split('\n').find((line) => line.startsWith('event: '));
      const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      const eventType = eventLine.slice(7).trim();
      const payload = JSON.parse(dataLine.slice(6));
      if (eventType === 'stage') onStage(payload as AnalysisStageEvent);
      if (eventType === 'result') onResult(payload.data as AnalysisResult);
      if (eventType === 'error') throw new Error(payload.message ?? 'Agent分析失败');
    }
  }
}
