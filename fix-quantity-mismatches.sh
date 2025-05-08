#!/bin/bash
# Script to fix quantity mismatches

echo "Fixing order 3678417187..."
npx tsx src/scripts/populate-print-queue.ts --shipstation-sync-only --order-id 3678417187
