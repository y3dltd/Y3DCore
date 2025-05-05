#!/bin/bash

# Process all the pending orders
echo "Processing pending orders..."

# Etsy orders
echo "Processing Etsy orders..."
npx tsx src/scripts/populate-print-queue.ts --order-id 3677206381
npx tsx src/scripts/populate-print-queue.ts --order-id 3670443364

# Amazon orders
echo "Processing Amazon orders..."
npx tsx src/scripts/populate-print-queue.ts --order-id 205-6716594-0202733
npx tsx src/scripts/populate-print-queue.ts --order-id 206-4606599-1345967

# eBay orders
echo "Processing eBay orders..."
npx tsx src/scripts/populate-print-queue.ts --order-id 10-13035-67795
npx tsx src/scripts/populate-print-queue.ts --order-id 24-13032-74969
npx tsx src/scripts/populate-print-queue.ts --order-id 26-13014-74829
npx tsx src/scripts/populate-print-queue.ts --order-id 10-13033-54340
npx tsx src/scripts/populate-print-queue.ts --order-id 14-13017-08187

echo "All orders processed!"
