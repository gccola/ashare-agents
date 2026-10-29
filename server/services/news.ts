import type { NewsItem } from '../../shared/types.js';

const positiveTerms = ['增长', '增持', '回购', '中标', '分红', '盈利', '预增', '突破', '超预期', '上调', '创新高', '净利润增长', '签订', '获批', '订单'];
const negativeTerms = ['减持', '亏损', '下调', '立案', '处罚', '风险', '退市', '违约', '诉讼', '下降', '预亏', '终止', '质押', '澄清', '下滑', '暴跌'];

export function scoreNews(item: Omit<NewsItem, 'sentiment' | 'sentimentScore'>): NewsItem {
  const text = `${item.title} ${item.summary}`;
  let score = 0;
  for (const term of positiveTerms) if (text.includes(term)) score += 1;
  for (const term of negativeTerms) if (text.includes(term)) score -= 1;
  const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return { ...item, sentiment, sentimentScore: Math.max(-5, Math.min(5, score)) };
}

export function aggregateNewsSentiment(items: NewsItem[]): { score: number; positive: number; negative: number; neutral: number } {
  const positive = items.filter((item) => item.sentiment === 'positive').length;
  const negative = items.filter((item) => item.sentiment === 'negative').length;
  const neutral = items.length - positive - negative;
  const weighted = items.reduce((sum, item) => sum + item.sentimentScore, 0);
  return {
    score: items.length ? Math.max(-1, Math.min(1, weighted / Math.max(4, items.length * 1.5))) : 0,
    positive,
    negative,
    neutral
  };
}
