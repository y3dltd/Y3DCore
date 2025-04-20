import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function deleteSty3Tasks() {
  console.log('Deleting print tasks for PER-KEY3D-STY3-Y3D SKU...');
  
  try {
    // First, find the product ID
    const product = await prisma.product.findFirst({
      where: {
        sku: 'PER-KEY3D-STY3-Y3D'
      }
    });
    
    if (!product) {
      console.error('Product with SKU PER-KEY3D-STY3-Y3D not found!');
      return;
    }
    
    console.log(`Found product: ${product.name} (ID: ${product.id})`);
    
    // Count tasks before deletion
    const taskCountBefore = await prisma.printOrderTask.count({
      where: {
        productId: product.id
      }
    });
    
    console.log(`Found ${taskCountBefore} tasks to delete`);
    
    // Delete the tasks
    const result = await prisma.printOrderTask.deleteMany({
      where: {
        productId: product.id
      }
    });
    
    console.log(`Successfully deleted ${result.count} print tasks for PER-KEY3D-STY3-Y3D`);
  } catch (error) {
    console.error('Error deleting tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the function
deleteSty3Tasks();
