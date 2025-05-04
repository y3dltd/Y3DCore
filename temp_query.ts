import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findMissingOrders() {
    const missingIds = [
        "3672803745",
        "3672841299",
        "3666514836",
        "3666534878",
        "3666588548"
    ];

    console.log(`Searching for ${missingIds.length} missing order identifiers...`);

    try {
        const orders = await prisma.order.findMany({
            where: {
                OR: [
                    { shipstation_order_number: { in: missingIds } },
                    { id: { in: missingIds.map(id => parseInt(id, 10)).filter(num => !isNaN(num)) } },
                    { shipstation_order_id: { in: missingIds } },
                    { order_key: { in: missingIds } }
                ]
            },
            select: {
                id: true,
                shipstation_order_number: true,
                shipstation_order_id: true,
                order_key: true,
                order_status: true,
                marketplace: true,
                created_at: true
            }
        });

        if (orders.length > 0) {
            console.log(`Found ${orders.length} matching orders in the database:`);
            console.log(JSON.stringify(orders, null, 2));
        } else {
            console.log('None of the specified identifiers were found in shipstation_order_number, shipstation_order_id, order_key, or id fields.');
        }
    } catch (e) {
        console.error('Error querying database:', e);
    } finally {
        await prisma.$disconnect();
        console.log('Prisma disconnected.');
    }
}

findMissingOrders(); 
