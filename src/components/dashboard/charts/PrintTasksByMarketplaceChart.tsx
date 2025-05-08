'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';

import { formatMarketplaceName, MARKETPLACE_DISPLAY } from '@/lib/marketplace-utils';

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

  // Filter out 'Unknown' marketplace from display
  const filteredDataPoints = dataPoints.filter(d => d.marketplace.toLowerCase() !== 'unknown');
  
  // Get formatted labels and matching color scheme
  const formattedLabels = filteredDataPoints.map(d => formatMarketplaceName(d.marketplace));
  const filteredCounts = filteredDataPoints.map(d => d.count);
  const backgroundColors = filteredDataPoints.map(d => {
    const info = MARKETPLACE_DISPLAY[d.marketplace.toLowerCase()] || MARKETPLACE_DISPLAY.unknown;
    // Extract color from Tailwind class by getting the general color family
    const colorClass = info.badgeColor.split('-')[1];
    // Map to hex or fallback
    switch (colorClass) {
      case 'blue': return '#3B82F6';
      case 'yellow': return '#F59E0B';
      case 'orange': return '#F97316';
      case 'green': return '#10B981';
      case 'violet': return '#8B5CF6';
      case 'gray': return '#6B7280';
      default: return '#3B82F6';
    }
  });

  const chartData = {
    labels: formattedLabels,
    datasets: [
      {
        label: 'Print Tasks',
        data: filteredCounts,
        backgroundColor: backgroundColors
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
      {loading ? <p>Loading...</p> : <Bar data={chartData} options={options} />}
    </div>
  );
}
