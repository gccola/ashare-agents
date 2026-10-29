import ReactECharts from 'echarts-for-react';
import { CandlestickChart } from 'lucide-react';
import type { DashboardData } from '../../../shared/types.js';

export default function KlineChart({ data }: { data: DashboardData }) {
  const bars = data.daily.slice(-110);
  const dates = bars.map((bar) => bar.date.slice(5));
  const candle = bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]);
  const volumes = bars.map((bar) => ({
    value: bar.volume,
    itemStyle: { color: bar.close >= bar.open ? 'rgba(248,113,113,.55)' : 'rgba(52,211,153,.5)' }
  }));
  const line = (key: 'ma5' | 'ma10' | 'ma20' | 'ma60', color: string) => ({
    name: key.toUpperCase(),
    type: 'line',
    data: bars.map((bar) => bar[key]),
    symbol: 'none',
    smooth: true,
    lineStyle: { width: 1.2, color },
    itemStyle: { color }
  });

  const option = {
    animationDuration: 400,
    backgroundColor: 'transparent',
    legend: {
      top: 0, left: 54, itemWidth: 16, itemHeight: 2, textStyle: { color: '#94a3b6', fontSize: 12 },
      data: ['MA5', 'MA10', 'MA20', 'MA60']
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,15,21,.96)',
      borderColor: 'rgba(148,163,184,.2)',
      textStyle: { color: '#dce6f2', fontSize: 13 },
      axisPointer: { type: 'cross', crossStyle: { color: 'rgba(148,163,184,.35)' } }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 54, right: 24, top: 34, height: '54%' },
      { left: 54, right: 24, top: '72%', height: '17%' }
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLine: { lineStyle: { color: 'rgba(148,163,184,.18)' } }, axisLabel: { color: '#8190a3', hideOverlap: true, fontSize: 11.5 }, splitLine: { show: false } },
      { type: 'category', data: dates, gridIndex: 1, boundaryGap: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } }
    ],
    yAxis: [
      { type: 'value', scale: true, axisLabel: { color: '#8190a3', fontSize: 11.5, formatter: (value: number) => value.toFixed(2) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,.08)' } } },
      { type: 'value', gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 16, borderColor: 'transparent', backgroundColor: 'rgba(148,163,184,.05)', fillerColor: 'rgba(96,165,250,.12)', handleStyle: { color: '#60a5fa' }, textStyle: { color: '#728095' } }
    ],
    series: [
      {
        name: '日K', type: 'candlestick', data: candle,
        itemStyle: { color: '#f87171', color0: '#34d399', borderColor: '#f87171', borderColor0: '#34d399' }
      },
      line('ma5', '#fbbf24'),
      line('ma10', '#60a5fa'),
      line('ma20', '#c084fc'),
      line('ma60', '#94a3b8'),
      { name: '成交量', type: 'bar', data: volumes, xAxisIndex: 1, yAxisIndex: 1, barWidth: '58%' }
    ]
  };

  return (
    <section className="chart-panel panel">
      <div className="panel-heading">
        <div><CandlestickChart size={17} /><h2>日 K 线与均线</h2></div>
        <span className="panel-note">前复权 · 最近 {bars.length} 个交易日</span>
      </div>
      {bars.length ? <ReactECharts option={option} style={{ height: 390 }} notMerge /> : <div className="chart-empty">暂无日K数据</div>}
    </section>
  );
}
