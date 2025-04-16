// src/scripts/find-amazon-orders-with-missing-colors.ts
import { PrismaClient, InternalOrderStatus, Prisma, Order, OrderItem, PrintOrderTask, Product } from '@prisma/client';
import * as fs from 'fs/promises';

const prisma = new PrismaClient();

// Define the type for order results with included relations
type OrderWithRelations = Order & {
    items: (OrderItem & {
        product: Product | null;
        printTasks: PrintOrderTask[];
    })[];
};

// Define the type for our output results
interface OrderResult {
    orderId: number;
    orderNumber: string | null;
    itemsWithMissingColors: {
        itemId: number;
        productName: string | undefined;
        tasks: {
            taskId: number;
            color1: string | null;
            color2: string | null;
        }[];
    }[];
}

async function main(): Promise<OrderResult[]> {
    // Find Amazon orders with CustomizedURL but missing color information
    const orders = await prisma.order.findMany({
        where: {
            marketplace: { contains: 'Amazon' },
            // Check all active states
            internal_status: {
                in: [
                    InternalOrderStatus.new,
                    InternalOrderStatus.processing,
                    InternalOrderStatus.printing
                ]
            },
            items: {
                some: {
                    // Use JsonFilter for print_settings
                    print_settings: { not: Prisma.JsonNull },
                    // Use the correct relation name (lowercase first letter as per Prisma convention)
                    printTasks: {
                        some: {
                            // Has a task with null color(s)
                            OR: [
                                { color_1: null },
                                { color_2: null }
                            ]
                        }
                    }
                }
            }
        },
        include: {
            items: {
                include: {
                    product: true,
                    // Use the correct relation name
                    printTasks: true
                }
            }
        }
    }) as unknown as OrderWithRelations[]; // Cast to our defined type

    console.log(`Found ${orders.length} Amazon orders with potentially missing color information`);

    // Save results to a file for reference
    const results: OrderResult[] = orders.map((order) => ({
        orderId: order.id,
        orderNumber: order.shipstation_order_number,
        itemsWithMissingColors: order.items
            .filter((item) => item.printTasks.some((task) => task.color_1 === null || task.color_2 === null))
            .map((item) => ({
                itemId: item.id,
                productName: item.product?.name,
                tasks: item.printTasks.map((task) => ({
                    taskId: task.id,
                    color1: task.color_1,
                    color2: task.color_2
                }))
            }))
    }));

    await fs.writeFile(
        'amazon-orders-missing-colors.json',
        JSON.stringify(results, null, 2)
    );

    return results;
}

main()
    .then((results) => {
        console.log(`Results saved to amazon-orders-missing-colors.json`);
        console.log(`${results.length} orders may need reprocessing`);
    })
    .catch((e) => {
        console.error('Script error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
