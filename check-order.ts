import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const order = await prisma.order.findFirst({
      where: { shipstation_order_number: '04-13032-32054' },
      include: {
        items: {
          include: { product: true }
        }
      }
    });
    
    console.log(JSON.stringify(order, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
