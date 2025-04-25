'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { ChartOptions, Tick } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type DataPoint = { marketplace: string; revenue: number };
type ApiResponse = { data: DataPoint[]; total: number };
interface Props { defaultDays?: string }

export default function RevenueByMarketplaceChart({ defaultDays = '7' }: Props) {
  const [days, setDays] = useState<string>(defaultDays);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/revenue-by-marketplace?days=${days}`)
      .then(res => res.json())
      .then((json: ApiResponse) => setDataPoints(json.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const labels = dataPoints.map(d => d.marketplace);
  const revenues = dataPoints.map(d => d.revenue);
  const colors = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#EF4444'];

  const chartData = {
    labels,
    datasets: [
      { label: 'Revenue', data: revenues, backgroundColor: labels.map((_,i) => colors[i % colors.length]) }
    ]
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: days === 'today' ? 'Revenue by Marketplace (Today)' : `Revenue by Marketplace (Last ${days} days)` }
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string, _index: number, _ticks: Tick[]) => `$${value}`
        }
      }
    }
  };

  return (
    <div className="bg-card p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Revenue by Marketplace</h3>
        <select value={days} onChange={e => setDays(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="today">Today</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : <Bar data={chartData} options={options} />}
    </div>
  );
}
