import { prisma } from '../shared/database'
import { logger } from '../shared/logging'

import { sendEmail } from './send-email'

// Define types based on ShipStation API structure
interface ShipToAddress {
    name: string | null
}

interface OrderItem {
    quantity: number
    name: string
}

interface AdvancedOptions {
    storeId?: string | number
}

export interface OrderData {
    orderId: string | number
    orderNumber: string
    orderDate: string
    orderStatus: string
    orderTotal?: number
    amountPaid?: number
    tagIds?: number[] | null
    items?: OrderItem[]
    shipTo?: ShipToAddress | null
    customerUsername?: string | null
    advancedOptions?: AdvancedOptions | null
}

interface OrderNotificationOptions {
    // Admin notification recipients
    adminEmails?: string[]
    // Whether to filter for just premium/prime orders
    onlyPremiumOrders?: boolean
    // Format currency values
    formatCurrency?: (_value: number) => string
}

const DEFAULT_OPTIONS: OrderNotificationOptions = {
    adminEmails: [],
    onlyPremiumOrders: false,
    formatCurrency: (value: number) => `$${value.toFixed(2)}`
}

/**
 * Check if an order has the 'Prime Order' tag in the database.
 */
export async function isPremiumOrder(order: OrderData): Promise<boolean> {
    if (!order.tagIds || order.tagIds.length === 0) return false
    const tag = await prisma.tag.findFirst({
        where: {
            shipstation_tag_id: { in: order.tagIds },
            name: 'Prime Order'
        }
    })
    return tag !== null
}

/**
 * Send notification emails for new orders.
 * 
 * @param order The ShipStation order data
 * @param options Configuration options
 * @returns Success status
 */
export async function sendNewOrderNotification(
    order: OrderData,
    customOptions?: Partial<OrderNotificationOptions>
): Promise<boolean> {
    try {
        const options = { ...DEFAULT_OPTIONS, ...customOptions }

        // Only send notifications for Prime Orders
        const isPrime = await isPremiumOrder(order)
        if (!isPrime) {
            logger.info(`Order ${order.orderNumber} skipped - not a Prime Order`)
            return true
        }

        // Prepare order details for the notification
        const orderDate = new Date(order.orderDate).toLocaleDateString()
        const formatCurrency = options.formatCurrency || ((value: number) => `$${value.toFixed(2)}`)
        const formattedTotal = formatCurrency(order.orderTotal || 0)
        const items = order.items?.map((item: OrderItem) => `${item.quantity}x ${item.name}`).join('\n') || 'No items found'

        // Customer information
        const customerName = order.shipTo?.name || order.customerUsername || 'Unknown Customer'

        // 1. Send notification to admin(s)
        if (options.adminEmails && options.adminEmails.length > 0) {
            await sendEmail({
                to: options.adminEmails,
                subject: `New Order: #${order.orderNumber} - ${formattedTotal}`,
                text: `
New order received from ${customerName}!

Order Details:
-----------------
Order #: ${order.orderNumber}
Date: ${orderDate}
Total: ${formattedTotal}
Status: ${order.orderStatus}
Marketplace: ${order.advancedOptions?.storeId || 'Unknown'}

Items:
${items}

View order: [Your admin URL]/orders/${order.orderId}
        `.trim(),
                html: `
<h2>New Order Received!</h2>
<p>Order <strong>#${order.orderNumber}</strong> from <strong>${customerName}</strong></p>

<table style="border-collapse: collapse; width: 100%;">
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Date</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${orderDate}</td>
  </tr>
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Total</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${formattedTotal}</td>
  </tr>
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Status</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${order.orderStatus}</td>
  </tr>
  <tr>
    <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2;">Marketplace</th>
    <td style="padding: 8px; border: 1px solid #ddd;">${order.advancedOptions?.storeId || 'Unknown'}</td>
  </tr>
</table>

<h3>Items:</h3>
<ul>
  ${order.items?.map((item: OrderItem) => `<li>${item.quantity}x ${item.name}</li>`).join('') || '<li>No items found</li>'}
</ul>

<p>
  <a href="[Your admin URL]/orders/${order.orderId}" 
     style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">
    View Order
  </a>
</p>
        `.trim()
            })

            logger.info(`Admin notification sent for order #${order.orderNumber}`)
        }

        return true
    } catch (error: unknown) {
        logger.error(`Failed to send order notification for #${order.orderNumber}:`, { error })
        return false
    }
}  
