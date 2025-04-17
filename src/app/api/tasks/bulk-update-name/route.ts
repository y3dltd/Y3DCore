import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

interface RequestBody {
  identifier: { sku: string } | { name: string };
  newName: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch /* istanbul ignore next */ {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { identifier, newName } = body;

  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    return NextResponse.json({ error: 'Invalid or missing newName' }, { status: 400 });
  }

  let whereClause = {};
  if ('sku' in identifier && identifier.sku) {
    whereClause = { sku: identifier.sku };
  } else if ('name' in identifier && identifier.name) {
    whereClause = { sku: null, product_name: identifier.name };
  } else {
    return NextResponse.json({ error: 'Invalid identifier provided' }, { status: 400 });
  }

  try {
    const result = await prisma.printOrderTask.updateMany({
      where: whereClause,
      data: {
        updated_at: new Date(),
      },
    });

    console.log(
      `Bulk name update: Condition ${JSON.stringify(whereClause)} to "${newName.trim()}". Count: ${result.count}`
    );

    return NextResponse.json({
      message: `Successfully updated ${result.count} tasks.`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error during bulk name update:', error);
    return NextResponse.json({ error: 'Failed to perform bulk name update' }, { status: 500 });
  }
}
