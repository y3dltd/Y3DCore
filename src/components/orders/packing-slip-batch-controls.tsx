'use client';

import { Loader2, Printer } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Allowed options mirrored from `getCandidateOrderIds`
const WINDOW_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'remaining', label: 'Remaining' },
] as const;

type WindowOption = (typeof WINDOW_OPTIONS)[number]['value'];

type LimitOption = 1 | 5 | 25 | 50 | 100 | 200 | 'all';

const LIMIT_OPTIONS: { value: LimitOption; label: string }[] = [
  { value: 1, label: '1' },
  { value: 5, label: '5' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 'all', label: 'All' },
];

export function PackingSlipBatchControls() {
  const [windowOption, setWindowOption] = useState<WindowOption>('today');
  const [limit, setLimit] = useState<LimitOption>(50);
  const [includePrinted, setIncludePrinted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        window: windowOption,
        limit: limit.toString(),
        includePrinted: includePrinted ? 'true' : 'false',
      });
      const response = await fetch(`/api/packing-slips/candidate-ids?${params.toString()}`);
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to fetch candidate IDs');
      }
      const { ids } = (await response.json()) as { ids: number[] };
      if (!ids.length) {
        alert('No orders found that match the selected criteria.');
        return;
      }
      const pdfUrl = `/api/generate-pdf/packing-slips?ids=${ids.join(',')}`;
      // Open in new tab to let user print / save
      window.open(pdfUrl, '_blank');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      alert('Error generating packing slips. See console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* Window select */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Window</label>
        <Select
          value={windowOption}
          onValueChange={value => setWindowOption(value as WindowOption)}
        >
          <SelectTrigger size="sm" className="min-w-[110px]">
            <SelectValue placeholder="Window" />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Limit select */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Limit</label>
        <Select
          value={limit.toString()}
          onValueChange={value => {
            const parsed = value === 'all' ? 'all' : (parseInt(value, 10) as LimitOption);
            setLimit(parsed);
          }}
        >
          <SelectTrigger size="sm" className="min-w-[80px]">
            <SelectValue placeholder="Limit" />
          </SelectTrigger>
          <SelectContent>
            {LIMIT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Include printed checkbox */}
      <div className="flex items-center gap-2">
        <input
          id="include-printed-checkbox"
          type="checkbox"
          className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
          checked={includePrinted}
          onChange={e => setIncludePrinted(e.target.checked)}
        />
        <label htmlFor="include-printed-checkbox" className="text-sm">
          Include already printed
        </label>
      </div>

      {/* Action button */}
      <Button size="sm" className="gap-1" onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        Print Slips
      </Button>
    </div>
  );
}
