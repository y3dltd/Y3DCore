import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const printTasks = await prisma.printOrderTask.findMany({
      where: {
        orderItem: {
          order: {
            shipstation_order_number: '04-13032-32054'
          }
        }
      },
      include: {
        orderItem: {
          include: {
            product: true,
            order: true
          }
        }
      }
    });
    
    console.log(JSON.stringify(printTasks, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
