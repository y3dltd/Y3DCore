import { SellingPartner } from 'amazon-sp-api'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

// The order ID to check
const AMAZON_ORDER_ID = '026-5585200-4785105'

async function main() {
    try {
        console.log('Initializing Amazon SP-API client...')

        // Create SP-API client with credentials passed directly
        const spClient = new SellingPartner({
            region: 'eu', // Use 'eu' for European marketplaces
            refresh_token: process.env.SPAPI_LWA_REFRESH_TOKEN,
            credentials: {
                SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_LWA_APP_CLIENT_ID,
                SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_LWA_APP_CLIENT_SECRET
            },
            options: {
                debug_log: false // Set to true for verbose logging
            }
        })

        console.log(`Looking up Amazon order: ${AMAZON_ORDER_ID}`)

        // Get order items
        console.log('Retrieving order items...')
        const orderItemsResult = await spClient.callAPI({
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: {
                orderId: AMAZON_ORDER_ID
            },
            options: {
                version: 'v0'
            }
        })

        // Save complete API response to file for inspection
        fs.writeFileSync('amazon-order-items-response.json', JSON.stringify(orderItemsResult, null, 2))
        console.log('Complete API response saved to amazon-order-items-response.json')

        // Check if order has items
        if (!orderItemsResult.OrderItems || orderItemsResult.OrderItems.length === 0) {
            console.log('No order items found')
            return
        }

        console.log(`Found ${orderItemsResult.OrderItems.length} order items`)

        // Look for customization data in order items
        console.log('\n=== Checking for Customization Data ===')

        // Get order itself for additional data
        const orderResult = await spClient.callAPI({
            operation: 'getOrder',
            endpoint: 'orders',
            path: {
                orderId: AMAZON_ORDER_ID
            },
            options: {
                version: 'v0'
            }
        })

        // Check if there's customization data in order notes
        if (orderResult.OrderTotal) {
            console.log('Order Total:', orderResult.OrderTotal)
        }

        if (orderResult.BuyerInfo && orderResult.BuyerInfo.BuyerEmail) {
            console.log('Buyer Email:', orderResult.BuyerInfo.BuyerEmail)
        }

        if (orderResult.OrderItems && orderResult.OrderItems.length > 0) {
            console.log('Order Items Count:', orderResult.OrderItems.length)
        }

        // Check seller notes
        if (orderResult.SellerNote) {
            console.log('Seller Note:', orderResult.SellerNote)
        }

        // Check for gift message
        if (orderResult.BuyerInfo && orderResult.BuyerInfo.BuyerName) {
            console.log('Buyer Name:', orderResult.BuyerInfo.BuyerName)
        }

        // Check if there's a gift message
        if (orderResult.IsGift) {
            console.log('Is Gift:', orderResult.IsGift)
            if (orderResult.GiftMessageText) {
                console.log('Gift Message:', orderResult.GiftMessageText)
            }
        }

        // Check customer notes
        if (orderResult.OrderCustomerInfos && orderResult.OrderCustomerInfos.length > 0) {
            console.log('Customer Info:', JSON.stringify(orderResult.OrderCustomerInfos, null, 2))
        }

        // Extract custom fields from the order items
        for (let i = 0; i < orderItemsResult.OrderItems.length; i++) {
            const item = orderItemsResult.OrderItems[i]

            console.log(`\n--- Item ${i + 1}: ${item.Title || 'Unknown'} ---`)
            console.log(`ASIN: ${item.ASIN}`)
            console.log(`SKU: ${item.SellerSKU}`)
            console.log(`Quantity: ${item.QuantityOrdered}`)

            // Check for custom print options in ProductInfo
            if (item.ProductInfo) {
                console.log('Product Info:', JSON.stringify(item.ProductInfo, null, 2))

                // Special check for CustomizedURL which might appear in ProductInfo
                if (item.ProductInfo.CustomizedURL) {
                    console.log('Found CustomizedURL:', item.ProductInfo.CustomizedURL)
                }
            }

            // Check if there's customization data in the item level
            if (item.CustomizationInfo) {
                console.log('Customization Info:', JSON.stringify(item.CustomizationInfo, null, 2))
            }

            // Check for customization options in array format
            if (item.CustomizationOptions && Array.isArray(item.CustomizationOptions)) {
                console.log('Customization Options:', JSON.stringify(item.CustomizationOptions, null, 2))
            }

            // Check for OrderItemAttributes which might contain customization info
            if (item.OrderItemAttributes) {
                console.log('Order Item Attributes:', JSON.stringify(item.OrderItemAttributes, null, 2))
            }

            // Look for special fields that might contain customization data
            if (item.BuyerInfo) {
                console.log('Buyer Info:', JSON.stringify(item.BuyerInfo, null, 2))
            }
        }

        // If we need to get additional information, let's try a different approach:
        // Some customization data might be in the order level rather than the item level
        console.log('\n=== Looking for Print Settings in Database ===')
        console.log('Check your database OrderItem model for print_settings field')
        console.log('Sample query: await prisma.orderItem.findFirst({ where: { orderId: <order_id> }, select: { print_settings: true } })')

    } catch (error) {
        console.error('Error calling Amazon API:', error.message)

        if (error.error) {
            console.error('Error Details:', JSON.stringify(error.error, null, 2))
        }
    }
}

main() 
