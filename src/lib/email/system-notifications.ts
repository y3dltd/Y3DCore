import { logger } from '../shared/logging'

import { sendEmail } from './send-email'

/* eslint-disable no-unused-vars */
export enum ErrorSeverity {
    CRITICAL = 'CRITICAL',
    ERROR = 'ERROR',
    WARNING = 'WARNING'
}
/* eslint-enable no-unused-vars */

/* eslint-disable no-unused-vars */
export enum ErrorCategory {
    ORDER_PROCESSING = 'ORDER_PROCESSING',
    AI_SERVICE = 'AI_SERVICE',
    DATABASE = 'DATABASE',
    SHIPSTATION = 'SHIPSTATION',
    SYNC = 'SYNC',
    AUTHENTICATION = 'AUTHENTICATION',
    GENERAL = 'GENERAL'
}
/* eslint-enable no-unused-vars */

interface SystemNotificationOptions {
    // Admin recipients for system notifications
    adminEmails?: string[]
    // Minimum severity level to notify about
    minSeverity?: ErrorSeverity
    // Include stack trace in email (if available)
    includeStackTrace?: boolean
    // Notification subject prefix
    subjectPrefix?: string
}

const DEFAULT_OPTIONS: SystemNotificationOptions = {
    adminEmails: [],
    minSeverity: ErrorSeverity.ERROR, // By default send ERROR and CRITICAL
    includeStackTrace: true,
    subjectPrefix: '🚨 Y3DHub Alert'
}

/**
 * Send notification about system errors or issues needing admin attention
 * 
 * @param title Brief title describing the issue
 * @param message Detailed error message or description
 * @param severity Error severity level
 * @param category Error category for classification
 * @param details Additional context or error object
 * @param options Notification configuration options
 * @returns Success status
 */
export async function sendSystemNotification(
    title: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    category: ErrorCategory = ErrorCategory.GENERAL,
    details?: unknown,
    customOptions?: Partial<SystemNotificationOptions>
): Promise<boolean> {
    try {
        const options = { ...DEFAULT_OPTIONS, ...customOptions }

        // Check if severity meets threshold for notification
        const severityLevels = [ErrorSeverity.WARNING, ErrorSeverity.ERROR, ErrorSeverity.CRITICAL];
        const severityIndex = severityLevels.indexOf(severity);
        const minSeverityIndex = severityLevels.indexOf(options.minSeverity || ErrorSeverity.ERROR);

        if (severityIndex < minSeverityIndex) {
            logger.info(`System notification "${title}" (${severity}) skipped - below threshold ${options.minSeverity}`);
            return true; // Skip but return success
        }

        // Get admin emails from environment if not provided in options
        const adminEmails = options.adminEmails?.length
            ? options.adminEmails
            : process.env.SYSTEM_NOTIFICATION_EMAILS?.split(',').map(email => email.trim());

        if (!adminEmails?.length) {
            logger.warn('System notification attempted, but no admin emails configured');
            return false;
        }

        // Format the notification content
        const timestamp = new Date().toISOString();
        const errorDetails = formatErrorDetails(details, options.includeStackTrace);

        // Each severity gets a different emoji
        const severityEmoji = {
            [ErrorSeverity.CRITICAL]: '🔴',
            [ErrorSeverity.ERROR]: '🟠',
            [ErrorSeverity.WARNING]: '🟡'
        }[severity];

        // Subject line with severity
        const subject = `${options.subjectPrefix}: ${severityEmoji} ${severity} - ${title}`;

        // Send the email
        await sendEmail({
            to: adminEmails,
            subject,
            text: `
${title}
-----------------
Severity: ${severity}
Category: ${category}
Time: ${timestamp}

${message}

${errorDetails ? `\nError Details:\n${errorDetails}` : ''}
      `.trim(),
            html: `
<h2 style="color: ${severity === ErrorSeverity.CRITICAL ? '#dc3545' : (severity === ErrorSeverity.ERROR ? '#fd7e14' : '#ffc107')};">
  ${severityEmoji} ${title}
</h2>

<table style="border-collapse: collapse; width: 100%;">
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Severity</th>
    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${severity === ErrorSeverity.CRITICAL ? '#dc3545' : (severity === ErrorSeverity.ERROR ? '#fd7e14' : '#ffc107')
                };">${severity}</td>
  </tr>
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Category</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${category}</td>
  </tr>
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Time</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${timestamp}</td>
  </tr>
</table>

<h3>Message:</h3>
<p style="white-space: pre-line;">${message.replace(/\n/g, '<br>')}</p>

${errorDetails ? `
<h3>Error Details:</h3>
<pre style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow: auto; max-height: 300px; font-size: 14px;">${errorDetails}</pre>
` : ''}

<p style="margin-top: 30px; font-size: 12px; color: #6c757d;">
  This is an automated system notification from Y3DHub. Please investigate and address this issue.
</p>
      `.trim()
        });

        logger.info(`System notification sent: "${title}" (${severity}/${category})`);
        return true;
    } catch (error: unknown) {
        logger.error(`Failed to send system notification "${title}":`, { error });
        return false;
    }
}

/**
 * Format error details for inclusion in notifications
 */
function formatErrorDetails(details: unknown, includeStack = true): string {
    if (!details) return '';

    let formattedDetails = '';

    if (details instanceof Error) {
        formattedDetails = details.message;

        // Include stack trace if available and enabled
        if (includeStack && details.stack) {
            formattedDetails += '\n\nStack Trace:\n' + details.stack;
        }

        // Include additional properties if any
        const extraProps = Object.entries(details)
            .filter(([key]) => !['name', 'message', 'stack'].includes(key))
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');

        if (extraProps) {
            formattedDetails += '\n\nAdditional Properties:\n' + extraProps;
        }
    } else {
        try {
            formattedDetails = JSON.stringify(details, null, 2);
        } catch {
            formattedDetails = String(details);
        }
    }

    return formattedDetails;
}    
