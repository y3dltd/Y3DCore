import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        // Find all Amazon orders with customization information
        const amazonOrders = await prisma.order.findMany({
            where: {
                marketplace: {
                    contains: 'Amazon'
                }
            },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            take: 10 // Limit to 10 orders
        })

        console.log(`Found ${amazonOrders.length} Amazon orders`)

        let orderCount = 0

        for (const order of amazonOrders) {
            orderCount++
            console.log(`\n=== Order #${orderCount}: ${order.shipstation_order_number} ===`)
            console.log(`Customer: ${order.customer_name}`)
            console.log(`Status: ${order.order_status}`)
            console.log(`Internal Status: ${order.internal_status}`)
            console.log(`Order Date: ${order.order_date}`)

            console.log('\nItems:')
            for (const item of order.items) {
                console.log(`\n  Item ID: ${item.id}, Product: ${item.product.name}`)
                console.log(`  Quantity: ${item.quantity}, Price: ${item.unit_price}`)

                // This is the key part - examining the raw print_settings from the API
                if (item.print_settings) {
                    console.log('\n  Raw Print Settings:')
                    console.log(JSON.stringify(item.print_settings, null, 2))

                    // Try to extract customization information
                    console.log('\n  Extracted Customization Info:')

                    // Look for customization options in various formats
                    if (Array.isArray(item.print_settings)) {
                        // If it's an array of options
                        for (const setting of item.print_settings) {
                            if (setting.name && setting.value) {
                                console.log(`    ${setting.name}: ${setting.value}`)
                            }
                        }
                    } else if (typeof item.print_settings === 'object') {
                        // If it's an object with properties
                        const settings = item.print_settings

                        // Check for common Amazon customization fields
                        if (settings.CustomizedURL) {
                            console.log(`    CustomizedURL: ${settings.CustomizedURL}`)
                        }

                        if (settings.customText) {
                            console.log(`    Custom Text: ${settings.customText}`)
                        }

                        if (settings.customization || settings.Customization) {
                            const customData = settings.customization || settings.Customization
                            console.log(`    Customization Data: ${JSON.stringify(customData)}`)
                        }

                        // Print all other fields that might contain customization data
                        for (const [key, value] of Object.entries(settings)) {
                            if (!['CustomizedURL', 'customText', 'customization', 'Customization'].includes(key)) {
                                console.log(`    ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
                            }
                        }
                    }
                } else {
                    console.log('  No print settings available')
                }
            }
        }
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main() 
