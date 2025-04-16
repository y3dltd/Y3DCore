import { SellingPartner } from 'amazon-sp-api'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

// The order ID to check
const AMAZON_ORDER_ID = '026-5585200-4785105'
const OUTPUT_FILE = 'amazon-order-complete-data.json'

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
                debug_log: false
            }
        })

        console.log(`Looking up Amazon order: ${AMAZON_ORDER_ID}`)

        // Collect all data in a single object for output
        const completeData = {
            amazonOrderId: AMAZON_ORDER_ID,
            timestamp: new Date().toISOString(),
            orderDetails: null,
            orderItems: null,
            databaseOrderItems: null
        }

        // 1. Get order details
        console.log('Retrieving order details...')
        try {
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

            completeData.orderDetails = orderResult
            console.log('Order details retrieved successfully')
        } catch (err) {
            console.log('Error retrieving order details:', err.message)
            completeData.orderDetailsError = err.message
        }

        // 2. Get order items
        console.log('Retrieving order items...')
        try {
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

            completeData.orderItems = orderItemsResult
            console.log(`Retrieved ${orderItemsResult.OrderItems?.length || 0} order items`)
        } catch (err) {
            console.log('Error retrieving order items:', err.message)
            completeData.orderItemsError = err.message
        }

        // 3. Include notes about checking database for print_settings
        completeData.notes = {
            databaseQuery: 'To check for print_settings in the database, run: await prisma.orderItem.findFirst({ where: { orderId: <order_id> }, select: { print_settings: true } })',
            customizationData: 'The customization data may be stored in the print_settings field of the OrderItem model in the database, and not directly available from the Amazon API'
        }

        // Save all data to file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(completeData, null, 2))
        console.log(`All Amazon order data saved to ${OUTPUT_FILE}`)

        // Display a summary of the data
        console.log('\n=== Data Summary ===')
        if (completeData.orderDetails) {
            console.log('Order Details:')
            console.log(`- Order Status: ${completeData.orderDetails.OrderStatus}`)
            console.log(`- Purchase Date: ${completeData.orderDetails.PurchaseDate}`)
            console.log(`- Order Total: ${completeData.orderDetails.OrderTotal?.Amount} ${completeData.orderDetails.OrderTotal?.CurrencyCode}`)

            if (completeData.orderDetails.BuyerInfo) {
                console.log(`- Buyer Email: ${completeData.orderDetails.BuyerInfo.BuyerEmail || 'N/A'}`)
                console.log(`- Buyer Name: ${completeData.orderDetails.BuyerInfo.BuyerName || 'N/A'}`)
            }
        }

        if (completeData.orderItems && completeData.orderItems.OrderItems) {
            console.log('\nOrder Items:')
            completeData.orderItems.OrderItems.forEach((item, index) => {
                console.log(`- Item ${index + 1}: ${item.Title.substring(0, 50)}${item.Title.length > 50 ? '...' : ''}`)
                console.log(`  SKU: ${item.SellerSKU}, ASIN: ${item.ASIN}, Quantity: ${item.QuantityOrdered}`)

                // Check for Product Info
                if (item.ProductInfo) {
                    const keys = Object.keys(item.ProductInfo)
                    console.log(`  Product Info: ${keys.length} fields - ${keys.join(', ')}`)
                }

                // Check for custom URL
                if (item.ProductInfo?.CustomizedURL) {
                    console.log(`  Customization URL: ${item.ProductInfo.CustomizedURL}`)
                }
            })
        }

        console.log('\nRecommendation:')
        console.log('Check the print_settings field in your database for customization data')
        console.log(`Full details available in ${OUTPUT_FILE}`)

    } catch (error) {
        console.error('Error executing script:', error.message)

        if (error.error) {
            console.error('Error Details:', JSON.stringify(error.error, null, 2))
        }
    }
}

main() 
