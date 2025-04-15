#!/bin/bash
# Nightly cleanup script for print tasks
# This script should be run via cron job, e.g.:
# 0 2 * * * /path/to/y3dhub/scripts/nightly-cleanup.sh >> /path/to/logs/nightly-cleanup.log 2>&1

# Navigate to the project directory
cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Set NODE_ENV to production if not set
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=production
fi

# Log start time
echo "=== Starting nightly print task cleanup at $(date) ==="

# Run the cleanup script
npm run cleanup-print-tasks

# Log completion
echo "=== Completed nightly print task cleanup at $(date) ==="
