import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findOrdersWithoutPrintTasks(): Promise<void> {
    console.log('Searching for awaiting_shipment orders without print tasks...');

    try {
        const orders = await prisma.order.findMany({
            where: {
                order_status: 'awaiting_shipment',
            },
            include: {
                printTasks: true, // Include related print tasks
                items: { // Include related order items
                    include: {
                        product: true, // Include product details for each item
                    },
                },
            },
        });

        console.log(`Found ${orders.length} orders with status 'awaiting_shipment'. Checking each for print tasks...`);

        // Debug: Log details for each order before filtering
        orders.forEach(order => {
            console.log(`  - Checking Order ID: ${order.id}, ShipStation Order Number: ${order.shipstation_order_number || 'N/A'}, Print Tasks Count: ${order.printTasks.length}`);
        });

        const ordersWithoutTasks = orders.filter(order => order.printTasks.length === 0);

        if (ordersWithoutTasks.length > 0) {
            console.log(`\nFound ${ordersWithoutTasks.length} awaiting_shipment orders with NO print tasks:`);
            ordersWithoutTasks.forEach(order => {
                console.log(`\n--- Order ID: ${order.id}, ShipStation Order Number: ${order.shipstation_order_number || 'N/A'} ---`);
                if (order.items.length > 0) {
                    console.log("  Items:");
                    order.items.forEach(item => {
                        console.log(`  - Qty: ${item.quantity}, Product: ${item.product.name} (SKU: ${item.product.sku || 'N/A'})`);
                    });
                } else {
                    console.log("  - No items found for this order.");
                }
            });
        } else {
            console.log('\nAll awaiting_shipment orders currently have associated print tasks.');
        }

    } catch (error) {
        console.error('Error finding orders without print tasks:', error);
    } finally {
        await prisma.$disconnect();
        console.log('\nScript finished.');
    }
}

findOrdersWithoutPrintTasks();
