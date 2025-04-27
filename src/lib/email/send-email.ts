import sgMail from '@sendgrid/mail'

// track if sgMail has been initialized already to avoid redundant setApiKey() calls
let initialized = false

/**
 * Initialize SendGrid with API key from environment variable and expose sendEmail utility.
 */
export function initSendGrid() {
    const apiKey = process.env.SENDGRID_API_KEY
    if (!apiKey) {
        throw new Error('SENDGRID_API_KEY env var is required')
    }
    // Lazy init only once
    if (initialized) return
    sgMail.setApiKey(apiKey)
    initialized = true
}

export interface EmailOptions {
    to: string | string[]
    from?: string // default configured sender
    subject: string
    text?: string
    html?: string
}

/**
 * Send an email via SendGrid. Call initSendGrid at least once before using.
 */
export async function sendEmail({
    to,
    from = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@example.com',
    subject,
    text,
    html,
}: EmailOptions) {
    initSendGrid()

    if (!text && !html) {
        throw new Error('Either text or html content must be provided')
    }

    const msg = {
        to,
        from,
        subject,
        text,
        html,
    }

    const [response] = await sgMail.send(msg)
    return response
} 
