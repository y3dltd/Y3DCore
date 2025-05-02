#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/workflow.sh [--mode all|recent|single] [--order-id ID] [--days-back N] [--hours N] [--dry-run] [--verbose]

# --- Configuration ---
NOTIFICATION_EMAIL="jayson@yorkshire3d.co.uk"
WORKFLOW_TIMEOUT="30m" # e.g., 30m, 1h, 1800s
PIDFILE="/tmp/y3dhub_workflow.pid"
# --- End Configuration ---

# Load environment variables from .env if present
if [ -f .env ]; then
  echo "Loading environment variables from .env"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Validate required ShipStation credentials
if [ -z "${SHIPSTATION_API_KEY:-}" ] || [ -z "${SHIPSTATION_API_SECRET:-}" ]; then
  echo "ERROR: SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET must be set (in environment or .env)"
  exit 1
fi

# --- Argument Parsing ---
DRY_RUN=false
VERBOSE=false
MODE="recent"
SKIP_TAGS=false
ORDER_ID=""
DAYS_BACK="2"
HOURS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --mode) MODE=$2; shift 2 ;;
    --order-id) ORDER_ID=$2; shift 2 ;;
    --days-back) DAYS_BACK=$2; shift 2 ;;
    --hours) HOURS=$2; shift 2 ;;
    --skip-tags) SKIP_TAGS=true; shift ;;
    --help)
      show_help
      exit 0
      ;;
    handle-merged) # New command to handle merged orders
      echo "Processing merged orders..."
      npx tsx src/scripts/handle-merged-orders.ts
      exit 0
      ;;
    *)
      # Unknown option
      if [ -n "$1" ]; then
        echo "Unknown option: $1"
        show_help
        exit 1
      fi
      ;;
  esac
done

DRY_OPTION=$([ "$DRY_RUN" = true ] && echo "--dry-run" || echo "")
VERBOSE_OPTION=$([ "$VERBOSE" = true ] && echo "--verbose" || echo "")
SKIP_TAGS_OPTION=$([ "$SKIP_TAGS" = true ] && echo "--skip-tags" || echo "")
# --- End Argument Parsing ---


# --- Utility Functions ---
send_notification() {
  local subject="$1"
  local body="$2"
  echo "Sending notification via SendGrid API: Subject='$subject'"

  # Ensure required SendGrid env vars are set
  if [ -z "${SENDGRID_API_KEY:-}" ] || [ -z "${SENDGRID_FROM_EMAIL:-}" ]; then
    echo "ERROR: SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set in .env for notifications."
    # Don't exit the main script, just log the error
    return 1
  fi

  # Prepare JSON payload - Basic HTML for the body
  # Ensure the body content is properly escaped for JSON
  # For simplicity, assuming the body doesn't contain quotes or newlines needing complex escaping.
  # If it might, a more robust JSON construction method would be needed (e.g., using jq)
  local bodyHTML="<p>${body}</p>"
  local maildata
  # Use printf for safer variable assignment, especially with quotes
  printf -v maildata '{
    "personalizations": [{"to": [{"email": "%s"}]}],
    "from": {"email": "%s", "name": "Y3DHub Workflow"},
    "subject": "%s",
    "content": [{"type": "text/html", "value": "%s"}]
  }' "$NOTIFICATION_EMAIL" "$SENDGRID_FROM_EMAIL" "$subject" "$bodyHTML"

  # Run curl in a subshell and background to avoid blocking & capture output
  ( 
    curl --request POST \
      --url https://api.sendgrid.com/v3/mail/send \
      --header "Authorization: Bearer $SENDGRID_API_KEY" \
      --header 'Content-Type: application/json' \
      --data "$maildata" --silent --show-error --fail >> logs/sendgrid_notification.log 2>&1 || \
      echo "SendGrid API call failed. Check logs/sendgrid_notification.log" 
  ) &
}

log_and_exit_on_error() {
  local exit_code=$1
  local error_message="$2"
  if [ $exit_code -ne 0 ]; then
    echo "ERROR: $error_message. Exited with code $exit_code."
    # Optional: Send notification on critical errors within the workflow
    # send_notification "Y3DHub Workflow Error" "Step failed: $error_message (Exit code: $exit_code)"
    exit $exit_code
  fi
}
# --- End Utility Functions ---


# --- Locking Logic ---
# Check if PID file exists and contains a running PID
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE")
  # Check if the process is still running. kill -0 returns true if it exists.
  if kill -0 "$OLD_PID" > /dev/null 2>&1; then
    echo "Another instance (PID $OLD_PID) is already running. Exiting."
    exit 1
  else
    # Process not running, likely a stale lock file
    stale_lock_message="Found stale lock file for non-running PID $OLD_PID. Removing and proceeding."
    echo "$stale_lock_message"
    send_notification "Y3DHub Workflow Stale Lock" "$stale_lock_message"
    rm -f "$PIDFILE"
  fi
fi

# Try to acquire the lock using file descriptor 9
# Note: Redirecting FD 9 to the PID file creates it if it doesn't exist
exec 9>"$PIDFILE"
if ! flock -n 9; then
  # This should ideally not happen if the PID check above works,
  # but keep it as a fallback safety measure.
  echo "Failed to acquire lock, another instance might be running concurrently. Exiting."
  # Ensure FD 9 is closed if flock fails right after opening
  exec 9>&-
  rm -f "$PIDFILE" # Clean up the file we might have just created
  exit 1
fi

# Write current PID to the lock file AFTER acquiring the lock
echo $$ >&9

# Setup trap to release lock (by closing FD) and remove PID file on exit
trap 'echo "Workflow exiting. Releasing lock (FD 9) and removing PID file $PIDFILE."; exec 9>&-; rm -f "$PIDFILE"' EXIT INT TERM HUP
# --- End Locking Logic ---

# --- Main Workflow Steps ---
# Define the main workflow commands as a function or here directly
run_main_workflow() {
  echo "Starting main workflow steps..."

  # 1. Sync ShipStation Orders
  echo "Step 1: Sync ShipStation orders (mode: $MODE)..."
  cmd="npx tsx src/scripts/sync-orders.ts --mode $MODE $SKIP_TAGS_OPTION"
  [[ -n $ORDER_ID ]] && cmd+=" --order-id $ORDER_ID"
  [[ -n $HOURS ]] && cmd+=" --hours $HOURS" || cmd+=" --days-back $DAYS_BACK"
  cmd+=" $DRY_OPTION $VERBOSE_OPTION"
  echo "Running: $cmd"
  eval $cmd
  log_and_exit_on_error $? "ShipStation order sync failed"

  # 2. Create Print Tasks
  echo "Step 2: Create print tasks..."
  cmd="npx tsx src/scripts/populate-print-queue.ts"
  [[ -n $ORDER_ID ]] && cmd+=" --order-id $ORDER_ID"
  [[ -n $HOURS ]] && cmd+=" --hours $HOURS" || cmd+=" --limit 30" # Ensure limit is appropriate
  cmd+=" $DRY_OPTION $VERBOSE_OPTION"
  echo "Running: $cmd"
  eval $cmd
  log_and_exit_on_error $? "Print task population failed"

  # 3. Update status of tasks for shipped orders
  echo "Step 3: Update tasks for shipped orders to COMPLETED..."
  cmd="npx tsx src/scripts/complete-shipped-print-tasks.ts $DRY_OPTION $VERBOSE_OPTION --confirm"
  echo "Running: $cmd"
  eval $cmd
  log_and_exit_on_error $? "Print task status update failed"

  echo "Main workflow steps completed."
}

# Execute the main workflow with timeout
echo "Executing workflow with timeout: $WORKFLOW_TIMEOUT"
timeout --foreground "$WORKFLOW_TIMEOUT" bash -c "$(declare -f log_and_exit_on_error); $(declare -f run_main_workflow); run_main_workflow"
TIMEOUT_EXIT_CODE=$?

if [ $TIMEOUT_EXIT_CODE -eq 124 ]; then
  timeout_message="Workflow timed out after $WORKFLOW_TIMEOUT. It was killed."
  echo "$timeout_message"
  send_notification "Y3DHub Workflow TIMEOUT" "$timeout_message"
  # Exit with a specific code for timeout
  exit 124
elif [ $TIMEOUT_EXIT_CODE -ne 0 ]; then
  # The workflow failed for a reason other than timeout (error handled by log_and_exit_on_error)
  echo "Workflow failed with exit code $TIMEOUT_EXIT_CODE (non-timeout error)."
  # Notification for non-timeout errors is optional here, as log_and_exit_on_error might handle it
  exit $TIMEOUT_EXIT_CODE
fi

# 4. Crontab Maintenance/Cleanups - Reminder
# (Handled outside this script by crontab - see docs/scripts/cleanup.md)

echo "Full Workflow completed successfully within timeout."

# Trap will handle cleanup on successful exit

# --- End Main Workflow Steps ---
