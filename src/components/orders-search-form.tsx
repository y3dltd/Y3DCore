'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OrdersSearchFormProps {
  currentSearch?: string;
  currentStatus?: string;
  currentMarketplace?: string;
  currentOrderDateStart?: string;
  currentOrderDateEnd?: string;
  statuses: string[];
  marketplaces: string[];
}

export function OrdersSearchForm({
  currentSearch,
  currentStatus,
  currentMarketplace,
  currentOrderDateStart,
  currentOrderDateEnd,
  statuses,
  marketplaces,
}: OrdersSearchFormProps) {
  return (
    <form method="GET" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        {/* Search Input */}
        <div className="lg:col-span-2">
          <Label htmlFor="search" className="block text-sm font-medium text-muted-foreground mb-1">
            Search
          </Label>
          <div className="space-y-1">
            <Input
              id="search"
              name="search"
              placeholder="Order # or Customer Name..."
              className="w-full"
              defaultValue={currentSearch || ''}
              onBlur={e => {
                e.target.value = e.target.value.trim();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Search by order ID, customer name, or marketplace order number (Amazon:
              123-1234567-1234567, eBay: 12-12345-12345, Etsy: 1234567890)
            </p>
          </div>
        </div>
        {/* Status Filter */}
        <div>
          <Label htmlFor="status" className="block text-sm font-medium text-muted-foreground mb-1">
            Status
          </Label>
          <Select name="status" defaultValue={currentStatus || 'all'}>
            <SelectTrigger id="status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map(status => (
                <SelectItem key={status} value={status}>
                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Marketplace Filter */}
        <div>
          <Label
            htmlFor="marketplace"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            Marketplace
          </Label>
          <Select name="marketplace" defaultValue={currentMarketplace || 'all'}>
            <SelectTrigger id="marketplace">
              <SelectValue placeholder="All Marketplaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Marketplaces</SelectItem>
              {marketplaces.map(market => (
                <SelectItem key={market} value={market}>
                  {market.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Order Date Start Filter */}
        <div className="lg:col-start-1">
          <Label
            htmlFor="orderDateStart"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            Order Date From
          </Label>
          <DatePicker name="orderDateStart" value={currentOrderDateStart} />
        </div>
        {/* Order Date End Filter */}
        <div>
          <Label
            htmlFor="orderDateEnd"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            Order Date To
          </Label>
          <DatePicker name="orderDateEnd" value={currentOrderDateEnd} />
        </div>

        {/* Submit Button */}
        <div className="lg:col-start-4 flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/orders" replace>
              Clear Filters
            </Link>
          </Button>
          <Button type="submit">Apply Filters</Button>
        </div>
      </div>
    </form>
  );
}
