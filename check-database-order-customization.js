import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ORDER_NUMBER = '026-5585200-4785105'
const OUTPUT_FILE = 'amazon-order-database-data.json'
import fs from 'fs'

async function main() {
    try {
        console.log(`Looking for order with number: ${ORDER_NUMBER}`)

        // Find the order by shipstation_order_number
        const order = await prisma.order.findFirst({
            where: {
                shipstation_order_number: ORDER_NUMBER
            },
            include: {
                items: {
                    include: {
                        product: true,
                        printTasks: true,
                        amazonCustomizationFiles: true
                    }
                }
            }
        })

        if (!order) {
            console.log('Order not found in database')
            return
        }

        console.log(`Found order ID: ${order.id} in database`)

        // Format and save the complete data
        const completeData = {
            id: order.id,
            shipstation_order_number: order.shipstation_order_number,
            marketplace: order.marketplace,
            customer_name: order.customer_name,
            items: order.items.map(item => ({
                id: item.id,
                productId: item.productId,
                productName: item.product?.name || 'Unknown',
                quantity: item.quantity,
                unit_price: item.unit_price,
                print_settings: item.print_settings,
                amazonCustomizationFile: item.amazonCustomizationFiles
                    ? {
                        id: item.amazonCustomizationFiles.id,
                        originalUrl: item.amazonCustomizationFiles.originalUrl,
                        customText: item.amazonCustomizationFiles.customText,
                        color1: item.amazonCustomizationFiles.color1,
                        color2: item.amazonCustomizationFiles.color2,
                        processingStatus: item.amazonCustomizationFiles.processingStatus
                    }
                    : null,
                printTasks: item.printTasks.map(task => ({
                    id: task.id,
                    custom_text: task.custom_text,
                    color_1: task.color_1,
                    color_2: task.color_2,
                    status: task.status,
                    needs_review: task.needs_review,
                    review_reason: task.review_reason,
                    annotation: task.annotation
                }))
            }))
        }

        // Save data to file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(completeData, null, 2))
        console.log(`Database order data saved to ${OUTPUT_FILE}`)

        // Display a summary of the order
        console.log('\n=== Order Summary ===')
        console.log(`Order ID: ${order.id}`)
        console.log(`ShipStation Order Number: ${order.shipstation_order_number}`)
        console.log(`Marketplace: ${order.marketplace}`)
        console.log(`Customer: ${order.customer_name}`)
        console.log(`Total Items: ${order.items.length}`)

        // Display each item with its print settings and customization
        console.log('\n=== Order Items ===')
        for (const item of order.items) {
            console.log(`\nItem ID: ${item.id}, Product: ${item.product?.name || 'Unknown'}`)
            console.log(`Quantity: ${item.quantity}, Unit Price: ${item.unit_price}`)

            // Print the raw print_settings which may contain customization info
            if (item.print_settings) {
                console.log('Print Settings:')
                console.log(JSON.stringify(item.print_settings, null, 2))
            } else {
                console.log('No print settings available')
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
            } else {
                console.log('No Amazon customization data available')
            }

            // Print the print tasks associated with this item
            if (item.printTasks && item.printTasks.length > 0) {
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
            } else {
                console.log('No print tasks available')
            }
        }

    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main() 
