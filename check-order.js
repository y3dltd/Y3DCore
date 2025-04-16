import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const order = await prisma.order.findFirst({
            where: {
                shipstation_order_number: '202-7013581-4597156'
            },
            include: {
                items: {
                    include: {
                        product: true,
                        printTasks: true
                    }
                }
            }
        })

        if (!order) {
            console.log('Order not found')
            return
        }

        console.log('Order ID:', order.id)
        console.log('ShipStation Order Number:', order.shipstation_order_number)
        console.log('Items:')

        for (const item of order.items) {
            console.log(`  Item ID: ${item.id}, Product: ${item.product.name}`)
            console.log('  Print Tasks:')

            for (const task of item.printTasks) {
                console.log(`    Task ID: ${task.id}, Text: "${task.custom_text}", Color1: "${task.color_1}", Color2: "${task.color_2}"`)
            }
        }
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main() 
