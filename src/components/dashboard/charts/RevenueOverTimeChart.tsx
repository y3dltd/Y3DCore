'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, Tick, ScriptableContext } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type DataPoint = { time: string; revenue: number };
type ApiResponse = { data: DataPoint[]; total: number };
interface Props { defaultDays?: string }

export default function RevenueOverTimeChart({ defaultDays = '7' }: Props) {
  const [days, setDays] = useState<string>(defaultDays);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/revenue-over-time?days=${days}`)
      .then(res => res.json())
      .then((json: ApiResponse) => setDataPoints(json.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const labels = dataPoints.map(d => d.time);
  const revenues = dataPoints.map(d => d.revenue);
 
  // Define gradient colors
  const startColor = '#10B981'; // emerald-500
  const endColor = '#059669';   // emerald-600
  
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Revenue',
        data: revenues,
        borderColor: function(context: ScriptableContext<'line'>) {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          
          if (!chartArea) return startColor;
          
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, endColor);
          gradient.addColorStop(1, startColor);
          return gradient;
        },
        backgroundColor: function(context: ScriptableContext<'line'>) {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          
          if (!chartArea) return 'rgba(16, 185, 129, 0.2)';
          
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'rgba(5, 150, 105, 0.1)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.4)');
          return gradient;
        },
        fill: true,
        tension: 0.4, // Add curve to the line
        borderWidth: 3,
        pointBackgroundColor: startColor,
        pointBorderColor: '#FFF',
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: days === 'today' ? 'Revenue Over Time (Hourly)' : 'Revenue Over Time (Daily)',
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string, _index: number, _ticks: Tick[]) => `£${value}`,
        },
      },
    },
  };

  return (
    <div className="bg-card p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Revenue Over Time</h3>
        <select
          value={days}
          onChange={e => setDays(e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-transparent text-foreground"
          style={{ color: 'var(--foreground)', background: 'var(--background)' }}
        >
          <option value="today" style={{ color: 'black', background: 'white' }}>Today</option>
          <option value="7" style={{ color: 'black', background: 'white' }}>7 days</option>
          <option value="14" style={{ color: 'black', background: 'white' }}>14 days</option>
          <option value="30" style={{ color: 'black', background: 'white' }}>30 days</option>
          <option value="90" style={{ color: 'black', background: 'white' }}>90 days</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : <Line data={chartData} options={options} />}
    </div>
  );
}
