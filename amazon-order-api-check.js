import { SellingPartner } from 'amazon-sp-api'
import dotenv from 'dotenv'

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
                debug_log: true // Enable logs for debugging purposes
            }
        })

        console.log('Looking up Amazon order:', AMAZON_ORDER_ID)

        // Get order details
        const orderResult = await spClient.callAPI({
            operation: 'getOrder',
            endpoint: 'orders',
            path: {
                orderId: AMAZON_ORDER_ID
            },
            options: {
                version: 'v0' // Using v0 for orders API
            }
        })

        console.log('\n=== Order Details ===')
        console.log(JSON.stringify(orderResult, null, 2))

        // Get order items
        const orderItemsResult = await spClient.callAPI({
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: {
                orderId: AMAZON_ORDER_ID
            },
            options: {
                version: 'v0' // Using v0 for orders API
            }
        })

        console.log('\n=== Order Items ===')
        console.log(JSON.stringify(orderItemsResult, null, 2))

        // Optional: Check for buyer customization info in order items
        if (orderItemsResult.OrderItems && orderItemsResult.OrderItems.length > 0) {
            console.log('\n=== Order Customization Details ===')

            for (const item of orderItemsResult.OrderItems) {
                console.log(`\n--- Product: ${item.Title || 'Unknown'} ---`)

                // Print customization info if available
                if (item.ProductInfo) {
                    console.log('Product Info:', JSON.stringify(item.ProductInfo, null, 2))
                }

                // BuyerInfo might contain customization data
                if (item.BuyerInfo) {
                    console.log('Buyer Info:', JSON.stringify(item.BuyerInfo, null, 2))
                }

                // Check for CustomizedURL in ProductInfo
                if (item.ProductInfo && item.ProductInfo.CustomizedURL) {
                    console.log('Customization URL:', item.ProductInfo.CustomizedURL)
                }

                // Check for printOptions or customization settings
                if (item.BuyerInfo && item.BuyerInfo.BuyerCustomizedInfo) {
                    console.log('Buyer Customized Info:', JSON.stringify(item.BuyerInfo.BuyerCustomizedInfo, null, 2))
                }

                // Check for printOptions or customization settings
                if (item.ProductInfo && item.ProductInfo.printOptions) {
                    console.log('Print Options:', JSON.stringify(item.ProductInfo.printOptions, null, 2))
                }

                // Print all item properties to find customization data
                console.log('All Item Properties:')
                for (const key in item) {
                    if (key !== 'Title' && key !== 'ASIN' && key !== 'SellerSKU' &&
                        key !== 'OrderItemId' && key !== 'ProductInfo' && key !== 'BuyerInfo') {
                        console.log(`${key}:`, JSON.stringify(item[key], null, 2))
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error calling Amazon API:', error.message)

        if (error.error) {
            console.error('Error Details:', JSON.stringify(error.error, null, 2))
        }
    }
}

main() 
