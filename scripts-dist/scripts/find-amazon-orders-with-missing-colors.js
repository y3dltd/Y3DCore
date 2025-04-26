"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/find-amazon-orders-with-missing-colors.ts
const fs = __importStar(require("fs/promises"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // Find Amazon orders with CustomizedURL but missing color information
    const orders = (await prisma.order.findMany({
        where: {
            marketplace: { contains: 'Amazon' },
            // Check all active states
            internal_status: {
                in: [client_1.InternalOrderStatus.new, client_1.InternalOrderStatus.processing, client_1.InternalOrderStatus.printing],
            },
            items: {
                some: {
                    // Use JsonFilter for print_settings
                    print_settings: { not: client_1.Prisma.JsonNull },
                    // Use the correct relation name (lowercase first letter as per Prisma convention)
                    printTasks: {
                        some: {
                            // Has a task with null color(s)
                            OR: [{ color_1: null }, { color_2: null }],
                        },
                    },
                },
            },
        },
        include: {
            items: {
                include: {
                    product: true,
                    // Use the correct relation name
                    printTasks: true,
                },
            },
        },
    })); // Cast to our defined type
    console.log(`Found ${orders.length} Amazon orders with potentially missing color information`);
    // Save results to a file for reference
    const results = orders.map(order => ({
        orderId: order.id,
        orderNumber: order.shipstation_order_number,
        itemsWithMissingColors: order.items
            .filter(item => item.printTasks.some(task => task.color_1 === null || task.color_2 === null))
            .map(item => ({
            itemId: item.id,
            productName: item.product?.name,
            tasks: item.printTasks.map(task => ({
                taskId: task.id,
                color1: task.color_1,
                color2: task.color_2,
            })),
        })),
    }));
    await fs.writeFile('amazon-orders-missing-colors.json', JSON.stringify(results, null, 2));
    return results;
}
main()
    .then(results => {
    console.log(`Results saved to amazon-orders-missing-colors.json`);
    console.log(`${results.length} orders may need reprocessing`);
})
    .catch(e => {
    console.error('Script error:', e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
