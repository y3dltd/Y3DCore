import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to extract personalization data from eBay customer notes
function extractEbayPersonalizationData(
  customerNotes: string | null,
  productSku: string
): {
  customText: string | null;
  color1: string | null;
  color2: string | null;
} {
  if (!customerNotes) return { customText: null, color1: null, color2: null };

  console.log(`Processing eBay order with customer notes: ${customerNotes}`);
  console.log(`Product SKU: ${productSku}`);

  // Default return values
  let customText: string | null = null;
  let color1: string | null = null;
  let color2: string | null = null;

  // Extract product ID and variant from SKU
  const productId = productSku.split('_')[1] || ''; // Extract ID part from SKU like wi_395107128418_6
  const productVariant = productSku.split('_')[2] || ''; // Extract variant part from SKU like wi_395107128418_6

  console.log(`Product ID: ${productId}, Variant: ${productVariant}`);

  // Parse the notes to extract personalization data
  // For eBay, we need to match the variant number with the color in the notes

  // First, let's extract all personalization blocks
  const personalizationBlocks: Array<{ itemId: string, color: string, text: string }> = [];

  // Parse customer notes for eBay format
  const lines = customerNotes.split('\n');
  let currentItemId = '';
  let currentColor = '';
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    console.log(`Processing line: "${line}"`);

    if (line.startsWith('Item ID:')) {
      // If we already have data from a previous block, save it
      if (currentItemId && currentText) {
        personalizationBlocks.push({
          itemId: currentItemId,
          color: currentColor,
          text: currentText
        });
        console.log(`Added block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
      }

      // Start a new block
      const itemIdMatch = line.match(/Item ID: (\d+)/);
      const colorMatch = line.match(/Color=([^,\n]+)/);

      currentItemId = itemIdMatch ? itemIdMatch[1] : '';
      currentColor = colorMatch ? colorMatch[1].trim() : '';
      currentText = '';

      console.log(`New block: ID=${currentItemId}, Color=${currentColor}`);
    }
    else if (line.startsWith('Text:')) {
      // The text value is on this line after "Text:"
      currentText = line.substring(5).trim();
      console.log(`Found Text: "${currentText}"`);
    }
  }

  // Add the last block if it exists
  if (currentItemId && currentText) {
    personalizationBlocks.push({
      itemId: currentItemId,
      color: currentColor,
      text: currentText
    });
    console.log(`Added final block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
  }

  console.log(`Extracted ${personalizationBlocks.length} personalization blocks`);

  // Now find the matching block for this product
  for (const block of personalizationBlocks) {
    console.log(`Checking block: ID=${block.itemId}, Color=${block.color}, Text=${block.text}`);

    // Check if this block matches our product
    const idMatches = productId === block.itemId;
    const colorMatches =
      (productVariant === '6' && block.color === 'Light Blue') ||
      (productVariant === '15' && block.color === 'Rose Gold');

    console.log(`Matching: ID=${idMatches}, Color=${colorMatches}, Product ID=${productId}, Variant=${productVariant}`);

    if (idMatches && colorMatches) {
      customText = block.text;
      color1 = block.color;
      console.log(`MATCH FOUND! Setting customText="${customText}", color1="${color1}"`);
      break;
    }
  }

  console.log(`Final result: customText="${customText}", color1="${color1}", color2="${color2}"`);
  return { customText, color1, color2 };
}

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

    if (!order) {
      console.log('Order not found');
      return;
    }

    console.log(`Order found: ${order.id}, Marketplace: ${order.marketplace}`);
    console.log(`Customer Notes: ${order.customer_notes}`);

    // Process each item
    for (const item of order.items) {
      console.log(`\nProcessing Item: ${item.id}, Product: ${item.product?.sku}`);

      // Extract personalization data
      const result = extractEbayPersonalizationData(
        order.customer_notes,
        item.product?.sku || ''
      );

      console.log(`Extraction result for ${item.product?.sku}: ${JSON.stringify(result, null, 2)}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
