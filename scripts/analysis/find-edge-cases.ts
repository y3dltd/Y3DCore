import { prisma } from '../../src/lib/prisma';

async function findEdgeCases() {
  try {
    console.log('Looking for orders with emojis or special characters...');
    const emojiOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: '😊' } },
          { customer_notes: { contains: '🙏' } },
          { customer_notes: { contains: '❤' } },
          { customer_notes: { contains: '♥' } },
          { customer_notes: { contains: '★' } },
          { customer_notes: { contains: '✓' } },
        ]
      },
      include: {
        items: true
      },
      take: 5
    });

    console.log(`Found ${emojiOrders.length} orders with emojis or special characters`);
    for (const order of emojiOrders) {
      console.log(`\n--- Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
    }

    console.log('\nLooking for orders with non-English characters...');
    const nonEnglishOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: 'é' } },
          { customer_notes: { contains: 'ü' } },
          { customer_notes: { contains: 'ñ' } },
          { customer_notes: { contains: 'ö' } },
          { customer_notes: { contains: 'ç' } },
          { customer_notes: { contains: 'ø' } },
        ]
      },
      include: {
        items: true
      },
      take: 5
    });

    console.log(`Found ${nonEnglishOrders.length} orders with non-English characters`);
    for (const order of nonEnglishOrders) {
      console.log(`\n--- Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
    }

    console.log('\nLooking for orders with unusual color specifications...');
    const unusualColorOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: 'color:' } },
          { customer_notes: { contains: 'colour:' } },
          { customer_notes: { contains: 'random' } },
          { customer_notes: { contains: 'any color' } },
          { customer_notes: { contains: 'any colour' } },
          { customer_notes: { contains: 'your choice' } },
        ]
      },
      include: {
        items: true
      },
      take: 5
    });

    console.log(`Found ${unusualColorOrders.length} orders with unusual color specifications`);
    for (const order of unusualColorOrders) {
      console.log(`\n--- Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
    }

    console.log('\nLooking for orders with unusual formatting...');
    const unusualFormattingOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: '|' } },
          { customer_notes: { contains: '/' } },
          { customer_notes: { contains: '+' } },
          { customer_notes: { contains: '=' } },
          { customer_notes: { contains: '_' } },
          { customer_notes: { contains: '~' } },
        ]
      },
      include: {
        items: true
      },
      take: 5
    });

    console.log(`Found ${unusualFormattingOrders.length} orders with unusual formatting`);
    for (const order of unusualFormattingOrders) {
      console.log(`\n--- Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
    }

    console.log('\nLooking for orders with potential errors or issues...');
    const potentialIssueOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: 'error' } },
          { customer_notes: { contains: 'mistake' } },
          { customer_notes: { contains: 'wrong' } },
          { customer_notes: { contains: 'incorrect' } },
          { customer_notes: { contains: 'typo' } },
          { customer_notes: { contains: 'sorry' } },
        ]
      },
      include: {
        items: true
      },
      take: 5
    });

    console.log(`Found ${potentialIssueOrders.length} orders with potential errors or issues`);
    for (const order of potentialIssueOrders) {
      console.log(`\n--- Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
    }

  } catch (error) {
    console.error('Error finding edge cases:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findEdgeCases();
