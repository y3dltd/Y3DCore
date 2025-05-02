import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Consider renaming this function/file as it now finds orders WITHOUT pending tasks
async function findOrdersWithoutPendingTasks() {
    try {
        const orders = await prisma.order.findMany({
            where: {
                order_status: 'awaiting_shipment',
                // Filter for orders where NONE of the associated print tasks have status 'pending'
                printTasks: {
                    none: { // Reverted from some back to none
                        status: 'pending'
                    }
                }
            },
            select: {
                shipstation_order_number: true,
            },
        });

        const orderNumbers = orders.map(order => order.shipstation_order_number)
            .filter((num): num is string => typeof num === 'string' && num !== '');

        console.log(orderNumbers.join(';'));

    } catch (error) {
        console.error("Error finding orders:", error);
    } finally {
        await prisma.$disconnect();
    }
}

findOrdersWithoutPendingTasks(); 
