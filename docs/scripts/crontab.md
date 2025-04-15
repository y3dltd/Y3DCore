# Cron Job Configuration

This document provides the recommended cron job configuration for the Y3DHub system. These cron jobs ensure that the database is kept up-to-date with the latest orders and that print tasks are generated and cleaned up as needed.

## Environment Variables

The cron jobs use the following environment variables:

```bash
# Set these in your environment or in a .env file
Y3D_DIR=/home/jayson/y3dhub
LOG_DIR=/home/jayson/y3dhub/logs
```

## Order Synchronization

```bash
# Sync recent orders every 10 minutes
*/10 * * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/sync-orders-wrapper.ts sync-recent --hours=2 >> $LOG_DIR/cron_sync_orders_recent_`date +\%Y\%m\%d`.log 2>&1

# Sync orders from the last 2 days once per hour
0 * * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/sync-orders-wrapper.ts sync-recent --days=2 >> $LOG_DIR/cron_sync_orders_daily_`date +\%Y\%m\%d`.log 2>&1

# Sync all orders once per day at 1 AM
0 1 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/sync-orders-wrapper.ts sync-all >> $LOG_DIR/cron_sync_orders_all_`date +\%Y\%m\%d`.log 2>&1

# Sync ShipStation tags once per day at 1:30 AM
30 1 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/sync-orders-wrapper.ts sync-tags >> $LOG_DIR/cron_sync_tags_`date +\%Y\%m\%d`.log 2>&1
```

## Print Queue Management

```bash
# Populate print queue for new orders every 10 minutes
*/10 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/populate-print-queue.ts --recent >> $LOG_DIR/cron_populate_queue_recent_`date +\%Y\%m\%d`.log 2>&1

# Run daily cleanup for completed/shipped order print tasks at 2 AM
0 2 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/cleanup.ts fix-pending-tasks --execute >> $LOG_DIR/cron_cleanup_queue_`date +\%Y\%m\%d`.log 2>&1

# Process Amazon customization files every 15 minutes (chained execution)
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/amazon-customization-sync.ts && /usr/bin/npx tsx scripts/analysis/update-order-items-from-amazon.ts --create-print-tasks --update-shipstation && /usr/bin/npx tsx scripts/update-print-tasks-from-order-items.ts --days-back=1 >> $LOG_DIR/cron_amazon_sync_`date +\%Y\%m\%d`.log 2>&1

# Find and fix orders with missing personalization every 2 hours
0 */2 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/find-amazon-orders-needing-personalization.ts --days-back=2 --fix >> $LOG_DIR/cron_fix_missing_personalization_`date +\%Y\%m\%d`.log 2>&1

# Update print task review status every 15 minutes
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/update-print-task-review-status.ts --days-back=1 >> $LOG_DIR/cron_update_print_task_review_`date +\%Y\%m\%d`.log 2>&1
```

## Stats & Monitoring

```bash
# Run AI usage stats once a day at 6am
0 6 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/utils/ai-usage-stats.ts > $LOG_DIR/ai_usage_stats_`date +\%Y\%m\%d`.log 2>&1

# Check for inconsistencies in the database once a day at 3am
0 3 * * * cd $Y3D_DIR && /usr/bin/npx tsx scripts/analysis/cleanup.ts find-inconsistencies > $LOG_DIR/inconsistencies_`date +\%Y\%m\%d`.log 2>&1
```

## Log Rotation

```bash
# Rotate logs older than 7 days at 4 AM
0 4 * * * find $LOG_DIR -name "*.log" -type f -mtime +7 -delete
```

## Installation

To install these cron jobs, save the configuration to a file and use the `crontab` command:

```bash
# Save the cron jobs to a file
crontab -l > current_crontab
cat crontab.txt >> current_crontab
crontab current_crontab
rm current_crontab
```

## Verification

To verify that the cron jobs are installed correctly, use the following command:

```bash
crontab -l
```

This should display the cron jobs listed above.

## Script Dependencies and Order

Some scripts depend on others to run correctly. Here's the dependency order for the Amazon customization scripts:

1. `amazon-customization-sync.ts`: Downloads and processes Amazon customization files
2. `update-order-items-from-amazon.ts`: Updates order items with personalization data and sends it to ShipStation
3. `update-print-tasks-from-order-items.ts`: Updates print tasks with personalization data
4. `find-amazon-orders-needing-personalization.ts`: Finds and fixes orders with missing personalization data

As of April 2025, we've implemented a chained execution approach for the Amazon customization scripts. This ensures that all steps of the process run in sequence, and if one step fails, the subsequent steps won't run. This helps maintain data consistency and reduces the chance of orders being processed incompletely.

The chained execution runs every 15 minutes and includes:

1. `amazon-customization-sync.ts`: Downloads and processes Amazon customization files
2. `update-order-items-from-amazon.ts --create-print-tasks --update-shipstation`: Updates order items, creates print tasks, and updates ShipStation
3. `update-print-tasks-from-order-items.ts`: Updates print tasks with personalization data

Additionally, the `find-amazon-orders-needing-personalization.ts` script runs every 2 hours as a backup mechanism to catch and fix any orders that might have been missed by the regular process.

## Common Challenges

The cron jobs can face several challenges:

1. **Timing Issues**: If the scripts run too close together, they might not have the latest data from the previous script
2. **Error Recovery**: If a script fails, it might leave the system in an inconsistent state
3. **Resource Contention**: If multiple scripts run at the same time, they might compete for resources

To address these challenges, we've implemented the following solutions:

1. **Chained Execution**: The Amazon customization scripts now run in sequence using the `&&` operator, ensuring that each step completes before the next one starts.
2. **Backup Mechanism**: The `find-amazon-orders-needing-personalization.ts` script runs every 2 hours as a backup to catch and fix any missed orders.
3. **Appropriate Intervals**: The cron jobs are scheduled with appropriate intervals to avoid resource contention.
4. **Comprehensive Logging**: All scripts log their output to dedicated log files for troubleshooting.

## Troubleshooting

If the cron jobs are not running as expected, check the following:

1. Ensure that the environment variables are set correctly
2. Check the log files for any errors
3. Verify that the scripts exist in the specified locations
4. Make sure the user running the cron jobs has the necessary permissions
5. Check the system logs for any cron-related errors: `sudo grep CRON /var/log/syslog`

### Common Issues and Solutions

#### 1. Missing Personalization Data

If orders are missing personalization data, it could be due to:

- The amazon-customization-sync.ts script failed to download or process the customization files
- The update-order-items-from-amazon.ts script failed to update the order items
- The update-print-tasks-from-order-items.ts script failed to update the print tasks

Solution:

- Run the find-amazon-orders-needing-personalization.ts script with the --fix flag:

  ```bash
  npx tsx scripts/find-amazon-orders-needing-personalization.ts --days-back=2 --fix
  ```

- Alternatively, run the chained execution manually for a specific order:
  ```bash
  cd $Y3D_DIR && \
  npx tsx scripts/analysis/amazon-customization-sync.ts --order-id=YOUR_ORDER_ID && \
  npx tsx scripts/analysis/update-order-items-from-amazon.ts --order-id=YOUR_ORDER_ID --create-print-tasks --update-shipstation && \
  npx tsx scripts/update-print-tasks-from-order-items.ts --order-id=YOUR_ORDER_ID
  ```

#### 2. ShipStation Integration Issues

If ShipStation is not showing the correct personalization data, it could be due to:

- The update-order-items-from-amazon.ts script failed to update ShipStation
- The ShipStation API rate limits were exceeded
- The ShipStation API returned an error

Solution:

- Check the logs for specific error messages
- Run the update-order-items-from-amazon.ts script with the --update-shipstation flag for specific orders
- Verify that the ShipStation API credentials are correct

#### 3. Cron Job Timing Issues

If the cron jobs are not running at the expected times, it could be due to:

- The system time is incorrect
- The cron service is not running
- The cron jobs are conflicting with each other

Solution:

- Check the system time: `date`
- Check if the cron service is running: `systemctl status cron`
- Adjust the cron job schedule to avoid conflicts

See the [Amazon Customization Challenges](../Amazon/AMAZON_CUSTOMIZATION_CHALLENGES.md) document for more details on these challenges and their solutions.
