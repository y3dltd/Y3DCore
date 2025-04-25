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
import type { ChartOptions } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type DataPoint = { marketplace: string; count: number };
type ApiResponse = { data: DataPoint[]; total: number };
interface Props { defaultDays?: string }

export default function PrintTasksByMarketplaceChart({ defaultDays = '7' }: Props) {
  const [days, setDays] = useState<string>(defaultDays);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/print-tasks-by-marketplace?days=${days}`)
      .then(res => res.json())
      .then((json: ApiResponse) => setDataPoints(json.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const labels = dataPoints.map(d => d.marketplace);
  const counts = dataPoints.map(d => d.count);
  const colors = ['#F59E0B', '#3B82F6', '#6366F1', '#10B981', '#EC4899', '#F87171', '#8B5CF6', '#14B8A6'];

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Print Tasks',
        data: counts,
        backgroundColor: labels.map((_, i) => colors[i % colors.length])
      }
    ]
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: days === 'today' ? 'Print Tasks by Marketplace (Today)' : `Print Tasks by Marketplace (Last ${days} days)` }
    }
  };

  return (
    <div className="bg-card p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Print Tasks by Marketplace</h3>
        <select value={days} onChange={e => setDays(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="today">Today</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : <Bar data={chartData} options={options} />}
    </div>
  );
}
