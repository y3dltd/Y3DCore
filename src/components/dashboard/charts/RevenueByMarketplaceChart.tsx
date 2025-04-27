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
import type { ChartOptions, Tick, ScriptableContext } from 'chart.js';
import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';

import { formatMarketplaceName, MARKETPLACE_DISPLAY } from '@/lib/marketplace-utils';

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

  // Filter out 'Unknown' marketplace from display
  const filteredDataPoints = dataPoints.filter(d => d.marketplace.toLowerCase() !== 'unknown');
  
  // Get formatted labels and matching color scheme
  const formattedLabels = filteredDataPoints.map(d => formatMarketplaceName(d.marketplace));
  const filteredRevenues = filteredDataPoints.map(d => d.revenue);
  // Get the base colors for each marketplace
  const marketplaceColors = filteredDataPoints.map(d => {
    const info = MARKETPLACE_DISPLAY[d.marketplace.toLowerCase()] || MARKETPLACE_DISPLAY.unknown;
    // Extract color from Tailwind class by getting the general color family
    const colorClass = info.badgeColor.split('-')[1];
    
    // Map to color pairs based on marketplace
    switch (colorClass) {
      case 'blue': return ['#3B82F6', '#2563EB']; // blue-500, blue-600
      case 'yellow': return ['#F59E0B', '#D97706']; // amber-500, amber-600
      case 'orange': return ['#F97316', '#EA580C']; // orange-500, orange-600
      case 'green': return ['#10B981', '#059669']; // emerald-500, emerald-600
      case 'violet': return ['#8B5CF6', '#7C3AED']; // violet-500, violet-600
      case 'gray': return ['#6B7280', '#4B5563']; // gray-500, gray-600
      default: return ['#3B82F6', '#2563EB']; // blue-500, blue-600
    }
  });
  
  // Function to create a gradient when the chart is rendered
  function createGradient(ctx: CanvasRenderingContext2D, colors: string[]) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    return gradient;
  }

  const chartData = {
    labels: formattedLabels,
    datasets: [
      { 
        label: 'Revenue', 
        data: filteredRevenues, 
        backgroundColor: function(context: ScriptableContext<'bar'>) {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return marketplaceColors[context.dataIndex]?.[0] || '#3B82F6';
          
          // Use the helper function to create gradients for each bar
          return createGradient(ctx, marketplaceColors[context.dataIndex] || ['#3B82F6', '#2563EB']);
        },
        borderRadius: 6,
        borderWidth: 0,
        hoverBackgroundColor: marketplaceColors.map(colors => colors[0]),
        hoverBorderWidth: 0,
      }
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
          callback: (value: number | string, _index: number, _ticks: Tick[]) => `£${value}`
        }
      }
    }
  };

  return (
    <div className="bg-card p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Revenue by Marketplace</h3>
        <select 
          value={days} 
          onChange={e => setDays(e.target.value)} 
          className="border rounded px-2 py-1 text-sm bg-transparent text-foreground"
          style={{ color: 'var(--foreground)', background: 'var(--background)' }}
        >
          <option value="today" style={{ color: 'black', background: 'white' }}>Today</option>
          <option value={7} style={{ color: 'black', background: 'white' }}>7 days</option>
          <option value={14} style={{ color: 'black', background: 'white' }}>14 days</option>
          <option value={30} style={{ color: 'black', background: 'white' }}>30 days</option>
          <option value={90} style={{ color: 'black', background: 'white' }}>90 days</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : <Bar data={chartData} options={options} />}
    </div>
  );
}
