#!/usr/bin/env node
import { sendEmail } from '../../lib/email/send-email';
import minimist from 'minimist';

async function main() {
    const args = minimist(process.argv.slice(2));

    const to = args.to;
    const subject = args.subject;
    const body = args.body; // Assuming text body for simplicity

    if (!to || !subject || !body) {
        console.error(
            'Usage: tsx src/scripts/utils/send-notification-email.ts --to <email> --subject "<subject>" --body "<body>"'
        );
        process.exit(1);
    }

    try {
        console.log(`Sending notification email to ${to}...`);
        await sendEmail({
            to,
            subject,
            text: body, // Send as plain text
        });
        console.log('Email sent successfully.');
    } catch (error) {
        console.error('Failed to send email:', error);
        process.exit(1);
    }
}

main(); 
