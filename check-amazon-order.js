import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Using a test order number visible in the file test-026-5585200-4785105.json
const AMAZON_ORDER_NUMBER = '026-5585200-4785105'

async function main() {
    try {
        // Find the order with the specified order number (filter for Amazon marketplace)
        const order = await prisma.order.findFirst({
            where: {
                shipstation_order_number: AMAZON_ORDER_NUMBER,
                marketplace: {
                    contains: 'Amazon'
                }
            },
            include: {
                items: {
                    include: {
                        product: true,
                        printTasks: true,
                        amazonCustomizationFiles: true // Include Amazon customization data
                    }
                }
            }
        })

        if (!order) {
            console.log('Amazon order not found')
            return
        }

        console.log('Order ID:', order.id)
        console.log('ShipStation Order Number:', order.shipstation_order_number)
        console.log('Order Date:', order.order_date)
        console.log('Customer:', order.customer_name)
        console.log('Items:')

        for (const item of order.items) {
            console.log(`\nItem ID: ${item.id}, Product: ${item.product.name}`)
            console.log(`Quantity: ${item.quantity}, Unit Price: ${item.unit_price}`)

            // Print the raw print_settings which may contain customization info
            if (item.print_settings) {
                console.log('Print Settings:', JSON.stringify(item.print_settings, null, 2))
            }

            // Print Amazon customization data if available
            if (item.amazonCustomizationFiles) {
                const customData = item.amazonCustomizationFiles
                console.log('Amazon Customization:')
                console.log(`  URL: ${customData.originalUrl}`)
                console.log(`  Custom Text: ${customData.customText || 'None'}`)
                console.log(`  Color 1: ${customData.color1 || 'None'}`)
                console.log(`  Color 2: ${customData.color2 || 'None'}`)
                console.log(`  Status: ${customData.processingStatus}`)

                // If you want to see raw JSON data
                if (customData.rawJsonData) {
                    console.log('  Raw JSON Data:', JSON.stringify(customData.rawJsonData, null, 2))
                }
            }

            // Print the print tasks associated with this item
            console.log('Print Tasks:')
            for (const task of item.printTasks) {
                console.log(`  Task ID: ${task.id}`)
                console.log(`  Text: "${task.custom_text || 'None'}"`)
                console.log(`  Color 1: "${task.color_1 || 'None'}"`)
                console.log(`  Color 2: "${task.color_2 || 'None'}"`)
                console.log(`  Status: ${task.status}`)
                console.log(`  Needs Review: ${task.needs_review ? 'Yes' : 'No'}`)
                if (task.annotation) {
                    console.log(`  Annotation: ${task.annotation}`)
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
