#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/workflow.sh [--mode all|recent|single] [--order-id ID] [--days-back N] [--hours N] [--dry-run] [--verbose]
# Load environment variables from .env if present
if [ -f .env ]; then
  echo "Loading environment variables from .env"
  set -a
  source .env
  set +a
fi

# Validate required ShipStation credentials
if [ -z "${SHIPSTATION_API_KEY:-}" ] || [ -z "${SHIPSTATION_API_SECRET:-}" ]; then
  echo "ERROR: SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET must be set (in environment or .env)"
  exit 1
fi

DRY_RUN=false
VERBOSE=false
MODE="recent"
SKIP_TAGS=false
ORDER_ID=""
DAYS_BACK="2"
HOURS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --mode)
      MODE=$2
      shift 2
      ;;
    --order-id)
      ORDER_ID=$2
      shift 2
      ;;
    --days-back)
      DAYS_BACK=$2
      shift 2
      ;;
    --hours)
      HOURS=$2
      shift 2
      ;;
    --skip-tags)
      SKIP_TAGS=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

DRY_OPTION=$([ "$DRY_RUN" = true ] && echo "--dry-run" || echo "")
VERBOSE_OPTION=$([ "$VERBOSE" = true ] && echo "--verbose" || echo "")
SKIP_TAGS_OPTION=$([ "$SKIP_TAGS" = true ] && echo "--skip-tags" || echo "")

# Prevent concurrent execution using flock and a lockfile
LOCKFILE="/tmp/y3dhub_workflow.lock"
exec 9>$LOCKFILE
if ! flock -n 9; then
  echo "Another instance of the workflow is already running. Exiting."
  exit 1
fi
trap 'rm -f "$LOCKFILE"' EXIT

# CLI Logging setup
log_and_exit_on_error() {
  if [ $1 -ne 0 ]; then
    echo "ERROR: $2. Exited with code $1."
    exit $1
  fi
}

# 1. Sync ShipStation Orders
echo "Step 1: Sync ShipStation orders (mode: $MODE)..."
cmd="tsx src/scripts/sync-orders.ts --mode $MODE $SKIP_TAGS_OPTION"
[[ -n $ORDER_ID ]] && cmd+=" --order-id $ORDER_ID"
[[ -n $HOURS ]] && cmd+=" --hours $HOURS" || cmd+=" --days-back $DAYS_BACK"
cmd+=" $DRY_OPTION $VERBOSE_OPTION"
echo "Running: $cmd"
eval $cmd
log_and_exit_on_error $? "ShipStation order sync failed"

# 2. Create Print Tasks (direct CLI integration for print tasks)
echo "Step 2: Create print tasks..."
cmd="tsx src/scripts/populate-print-queue.ts"
[[ -n $ORDER_ID ]] && cmd+=" --order-id $ORDER_ID"
[[ -n $HOURS ]] && cmd+=" --hours $HOURS" || cmd+=" --limit 30"
cmd+=" $DRY_OPTION $VERBOSE_OPTION"
echo "Running: $cmd"
eval $cmd
log_and_exit_on_error $? "Print task population failed"

# 3. Cleanup Print Tasks (uses the same CLI)
echo "Step 3: Cleanup completed tasks..."
cmd="tsx src/scripts/populate-print-queue.ts --clear-all $DRY_OPTION $VERBOSE_OPTION"
echo "Running: $cmd"
eval $cmd
log_and_exit_on_error $? "Print task cleanup failed"

# 4. Crontab Maintenance/Cleanups
# (Handled outside this script by crontab - see docs/scripts/cleanup.md)

# 5. Exit and release lockfile

echo "Full Workflow completed successfully."
