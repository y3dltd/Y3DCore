#!/bin/bash

# Update all column headers to use the compact style
sed -i 's/variant="ghost"/variant="ghost"\n        size="sm"\n        className="px-2 py-1 h-7"/g' src/components/print-queue-table.tsx
sed -i 's/className="ml-2 h-4 w-4"/className="ml-1 h-3 w-3"/g' src/components/print-queue-table.tsx
