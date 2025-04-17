'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import { Label } from '@/components/ui/label'; // Corrected path if needed, removed extra quotes
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'; // Corrected path if needed, removed extra quotes

interface LimitSelectorProps {
  currentLimit: number;
  options?: number[];
}

// Updated options as per NEWFEATURES.md
const defaultOptions = [50, 100, 250, 500, 1000];

export function LimitSelector({ currentLimit, options = defaultOptions }: LimitSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleLimitChange = (newLimit: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('limit', newLimit);
    // Reset to page 1 when limit changes
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Ensure the currentLimit is a valid option, otherwise default to the first option or 50
  const validLimit = options.includes(currentLimit)
    ? currentLimit
    : options.find(o => o === 50) || options[0];

  return (
    <div className="flex items-center space-x-2">
      <Label
        htmlFor="limit-select"
        className="text-sm font-medium text-muted-foreground whitespace-nowrap"
      >
        Items per page:
      </Label>
      <Select value={validLimit.toString()} onValueChange={handleLimitChange}>
        <SelectTrigger id="limit-select" className="w-[80px]">
          <SelectValue placeholder="Limit" />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option} value={option.toString()}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
