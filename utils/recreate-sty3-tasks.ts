import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function recreateSty3Tasks() {
  console.log('Recreating print tasks for PER-KEY3D-STY3-Y3D SKU...');
  
  try {
    // Find the product
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
    
    // Find order items containing this product
    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId: product.id
      },
      include: {
        order: true
      }
    });
    
    console.log(`Found ${orderItems.length} order items with this product`);
    
    if (orderItems.length === 0) {
      console.log('No order items found to create tasks for.');
      return;
    }
    
    // Create tasks for each order item
    const tasks = [];
    for (const item of orderItems) {
      // Get customer name from the order to use as the custom text
      // In a real scenario, you might extract this from personalization data
      let customText = `Task for order ${item.order.shipstation_order_number || item.order.id}`;
      
      // Add random colors
      const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Black', 'White'];
      const color1 = colors[Math.floor(Math.random() * colors.length)];
      const color2 = colors[Math.floor(Math.random() * colors.length)];
      
      tasks.push(
        prisma.printOrderTask.create({
          data: {
            orderId: item.orderId,
            orderItemId: item.id,
            productId: product.id,
            taskIndex: 0, // You might need a more sophisticated way to determine this
            custom_text: customText,
            color_1: color1,
            color_2: color2,
            quantity: 1,
            status: 'pending',
            stl_render_state: 'pending',
            shorthandProductName: '2-Colour Keyring'
          }
        })
      );
    }
    
    // Create all tasks
    const result = await Promise.all(tasks);
    console.log(`Successfully created ${result.length} print tasks for PER-KEY3D-STY3-Y3D`);
    
  } catch (error) {
    console.error('Error creating tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the function
recreateSty3Tasks();
