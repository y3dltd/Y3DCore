import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma'; 

interface RequestBody {
  identifier: { sku?: string; name?: string }; 
  newName: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { identifier, newName } = body;

  if (!identifier || (typeof identifier.sku !== 'string' && typeof identifier.name !== 'string')) {
    return NextResponse.json({ error: 'Invalid or missing identifier (sku or name required)' }, { status: 400 });
  }

  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    return NextResponse.json({ error: 'Invalid or missing newName' }, { status: 400 });
  }

  const trimmedNewName = newName.trim();

  let productWhereClause = {};
  if (identifier.sku) {
    productWhereClause = { sku: identifier.sku };
  } else if (identifier.name) {
    productWhereClause = { name: identifier.name }; 
  } else {
    return NextResponse.json({ error: 'Identifier must contain SKU or name' }, { status: 400 });
  }

  try {
    const result = await prisma.product.updateMany({
      where: productWhereClause,
      data: {
        name: trimmedNewName,
        updatedAt: new Date(), 
      },
    });

    console.log(
      `Bulk product name update: Condition ${JSON.stringify(
        productWhereClause
      )} to "${trimmedNewName}". Products updated: ${result.count}`
    );

    return NextResponse.json({
      message: `Successfully updated product name for ${result.count} product(s). Associated tasks will reflect this change.`,
      count: result.count, 
    });
  } catch (error) {
    console.error('Error during bulk product name update:', error);
    return NextResponse.json({ error: 'Failed to perform bulk product name update' }, { status: 500 });
  }
}
