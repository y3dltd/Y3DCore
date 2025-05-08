# Email Notifications

The system supports sending automated email notifications for various events using SendGrid.

## Setup

1. Make sure SendGrid is configured correctly (see main README)
2. Set the following environment variables:

```
# SendGrid Configuration
SENDGRID_API_KEY="your-sendgrid-api-key"
SENDGRID_FROM_EMAIL="noreply@example.com"

# For New Order Notifications
NEW_ORDER_NOTIFICATION_EMAILS="admin@example.com,manager@example.com"
NOTIFY_PREMIUM_ORDERS_ONLY="false"

# System Error Notifications
SYSTEM_NOTIFICATION_EMAILS="admin@example.com,sysadmin@example.com"
```

## Available Notifications

### New Order Notifications

When new orders are synchronized from ShipStation, automated notifications can be sent to administrators.

#### Features

- **Admin Notifications**: Emails sent to addresses listed in `NEW_ORDER_NOTIFICATION_EMAILS`
- **Premium Order Filtering**: When `NOTIFY_PREMIUM_ORDERS_ONLY` is set to `true`, only orders meeting premium criteria will trigger notifications
- **Customizable Templates**: HTML and text templates with order summary information

#### Email Content

The email includes:

- Order number and customer name
- Order date and total
- Status and marketplace information
- List of items ordered
- Link to view the order in the admin system

#### Premium Order Criteria

An order is considered "premium" when any of these conditions are met:

- Contains specific ShipStation tags (currently IDs 1, 2, or 3)
- Order value exceeds $100

You can modify this logic in `src/lib/email/order-notifications.ts` in the `isPremiumOrder` function.

### System Error Notifications

Critical system errors and issues requiring admin attention are sent as system notifications.

#### Features

- **Admin Notifications**: Emails sent to addresses listed in `SYSTEM_NOTIFICATION_EMAILS`
- **Severity Levels**: Three levels of severity - WARNING, ERROR, and CRITICAL
- **Error Categories**: Categorized by system area (ORDER_PROCESSING, AI_SERVICE, DATABASE, etc.)
- **Detailed Information**: Includes stack traces and context to assist in troubleshooting

#### Email Content

System notification emails include:

- Severity level (with color coding)
- Error category
- Timestamp
- Detailed error message
- Stack trace (if available and enabled)
- Additional context

#### Notification Triggers

The system automatically sends notifications for:

- Order processing failures
- AI processing issues that require manual review
- API rate limit warnings and exceeded limits
- Database errors
- Authentication failures
- Other critical system errors

## Customizing Notifications

The email notification system can be extended to support additional events. The core functionality is in:

- `src/lib/email/send-email.ts` - Core SendGrid integration
- `src/lib/email/order-notifications.ts` - Order notification implementation
- `src/lib/email/system-notifications.ts` - System error notification implementation

To add new notification types:

1. Create a new file in `src/lib/email/` for your notification type
2. Use the `sendEmail()` function to handle actual delivery
3. Implement your notification logic
4. Call the notification function from the appropriate place in the codebase
