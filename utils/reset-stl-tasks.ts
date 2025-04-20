import { PrismaClient } from '@prisma/client';

// Set the DATABASE_URL directly in the script for testing
// This is only for local testing and should not be committed
process.env.DATABASE_URL = "mysql://admin:ADslRFcGhpWMqY1Nhayp@database-dev.cl00e6mmqt74.eu-west-2.rds.amazonaws.com:3306/y3dhub_testing2";

const prisma = new PrismaClient();

async function resetSTLTasks() {
  try {
    // Get product ID for the target SKU
    const product = await prisma.product.findFirst({
      where: { sku: 'PER-KEY3D-STY3-Y3D' },
      select: { id: true }
    });

    if (!product) {
      console.error('Product with SKU PER-KEY3D-STY3-Y3D not found');
      return;
    }

    // Update tasks
    const result = await prisma.printOrderTask.updateMany({
      where: {
        productId: product.id,
        status: { in: ['pending', 'in_progress'] }
      },
      data: {
        stl_render_state: 'pending',
        render_retries: 0,
        stl_path: null
      }
    });

    console.log(`Reset ${result.count} STL tasks to pending state`);
  } catch (error) {
    console.error('Error resetting STL tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetSTLTasks();
