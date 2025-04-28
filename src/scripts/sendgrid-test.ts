import 'dotenv/config'
import { sendEmail } from '../lib/email/send-email'

async function main() {
    const to = process.env.SENDGRID_TEST_TO ?? process.env.SENDGRID_TO_EMAIL
    const from = process.env.SENDGRID_FROM_EMAIL
    if (!to) {
        throw new Error('Provide SENDGRID_TEST_TO or SENDGRID_TO_EMAIL env var with recipient email address')
    }
    const subject = 'SendGrid integration test'
    const text = 'Hello from y3dhub via SendGrid!'
    console.log(`Sending email to ${to}...`)
    try {
        const res = await sendEmail({ to, from, subject, text })
        console.log('Email sent, status code:', res.statusCode)
    } catch (err) {
        console.error('Failed to send email:', err)
        process.exit(1)
    }
}

main() 
