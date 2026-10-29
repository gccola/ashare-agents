import ReactECharts from 'echarts-for-react';
import { Activity } from 'lucide-react';
import type { DashboardData } from '../../../shared/types.js';

export default function IntradayChart({ data }: { data: DashboardData }) {
  const times = data.intraday.map((point) => point.time);
  const prices = data.intraday.map((point) => point.price);
  const averages = data.intraday.map((point) => point.avgPrice);
  const volumes = data.intraday.map((point, index) => ({
    value: point.volume,
    itemStyle: { color: point.price >= (index ? data.intraday[index - 1].price : point.price) ? 'rgba(248,113,113,.55)' : 'rgba(52,211,153,.5)' }
  }));
  const prevClose = data.quote.prevClose;

  const option = {
    animationDuration: 450,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,15,21,.96)',
      borderColor: 'rgba(148,163,184,.2)',
      textStyle: { color: '#dce6f2', fontSize: 13 },
      axisPointer: { type: 'cross', crossStyle: { color: 'rgba(148,163,184,.35)' } }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 56, right: 24, top: 28, height: '56%' },
      { left: 56, right: 24, top: '75%', height: '17%' }
    ],
    xAxis: [
      { type: 'category', data: times, boundaryGap: false, axisLine: { lineStyle: { color: 'rgba(148,163,184,.18)' } }, axisLabel: { color: '#8190a3', hideOverlap: true, fontSize: 11.5 }, splitLine: { show: false } },
      { type: 'category', data: times, gridIndex: 1, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } }
    ],
    yAxis: [
      { type: 'value', scale: true, axisLabel: { color: '#8190a3', fontSize: 11.5, formatter: (value: number) => value.toFixed(2) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,.08)' } } },
      { type: 'value', gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } }
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        data: prices,
        symbol: 'none',
        lineStyle: { width: 2, color: '#60a5fa' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(96,165,250,.22)' }, { offset: 1, color: 'rgba(96,165,250,0)' }]
          }
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: { color: '#8a98aa', formatter: `昨收 ${prevClose.toFixed(2)}`, position: 'insideEndTop' },
          lineStyle: { color: 'rgba(251,191,36,.5)', type: 'dashed', width: 1 },
          data: [{ yAxis: prevClose }]
        }
      },
      { name: '均价', type: 'line', data: averages, symbol: 'none', lineStyle: { width: 1.2, color: '#fbbf24' } },
      { name: '成交量', type: 'bar', data: volumes, xAxisIndex: 1, yAxisIndex: 1, barWidth: '55%' }
    ]
  };

  return (
    <section className="chart-panel panel">
      <div className="panel-heading">
        <div><Activity size={17} /><h2>分时走势</h2></div>
        <div className="chart-legend"><span className="blue-dot">价格</span><span className="gold-dot">均价</span><span>成交量</span></div>
      </div>
      {data.intraday.length ? <ReactECharts option={option} style={{ height: 330 }} notMerge /> : <div className="chart-empty">暂无当日分时数据</div>}
    </section>
  );
}
