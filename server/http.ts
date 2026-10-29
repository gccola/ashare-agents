const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  Accept: 'application/json,text/plain,*/*'
};

export async function requestText(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string>; encoding?: string } = {}
): Promise<{ text: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { ...DEFAULT_HEADERS, ...options.headers }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder(options.encoding ?? 'utf-8').decode(buffer);
    return { text, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(url: string, timeoutMs = 12000): Promise<{ data: T; latencyMs: number }> {
  const result = await requestText(url, { timeoutMs });
  return { data: JSON.parse(result.text) as T, latencyMs: result.latencyMs };
}

export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function safeNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) ? number : fallback;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
