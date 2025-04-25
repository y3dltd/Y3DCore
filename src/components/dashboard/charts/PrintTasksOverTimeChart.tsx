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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type DataPoint = { time: string; count: number };
type ApiResponse = { data: DataPoint[]; total: number };
interface Props { defaultDays?: string }

export default function PrintTasksOverTimeChart({ defaultDays = '7' }: Props) {
  const [days, setDays] = useState<string>(defaultDays);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/print-tasks-over-time?days=${days}`)
      .then(res => res.json())
      .then((json: ApiResponse) => setDataPoints(json.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const labels = dataPoints.map(d => d.time);
  const counts = dataPoints.map(d => d.count);

  const chartData = {
    labels,
    datasets: [{
      label: 'Print Tasks',
      data: counts,
      borderColor: '#F59E0B',
      backgroundColor: 'rgba(245, 158, 11, 0.5)',
      fill: true,
    }],
  };

  const options: any = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: days === 'today' ? 'Print Tasks Over Time (Hourly)' : 'Print Tasks Over Time (Daily)',
      },
    },
  };

  return (
    <div className="bg-card p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Print Tasks Over Time</h3>
        <select
          value={days}
          onChange={e => setDays(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="today">Today</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : <Line data={chartData} options={options} />}
    </div>
  );
}
