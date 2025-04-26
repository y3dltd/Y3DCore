#!/bin/bash

# Change to project directory
cd "$(dirname "$0")/.."

# Ensure only one instance runs
exec 9>/tmp/y3dhub-historical-sync.lock
if ! flock -n 9; then
    echo "Another sync process is running"
    exit 1
fi

# Run the sync script using tsx
NODE_ENV=production npx tsx src/scripts/sync-historical-orders.ts "$@" >> logs/historical-sync.log 2>&1

# Release lock
flock -u 9
