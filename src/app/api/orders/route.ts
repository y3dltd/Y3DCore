import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma'; // Import the reusable Prisma client
import { getSearchParamsFromRequest } from '@/lib/utils';

/**
 * Handles GET requests to fetch orders.
 * Supports optional pagination via query parameters `page` and `limit`.
 */
export async function GET(request: Request) {
  const searchParams = getSearchParamsFromRequest(request);
  if (!searchParams) {
    return new NextResponse('Invalid request URL', { status: 400 });
  }
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  // Basic validation for page and limit
  const pageNumber = Math.max(1, page);
  const limitNumber = Math.max(1, Math.min(100, limit)); // Limit max 100 per page
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const [orders, totalOrders] = await prisma.$transaction([
      prisma.order.findMany({
        skip: skip,
        take: limitNumber,
        orderBy: {
          created_at: 'desc', // Default sort by newest
        },
        // Include related data if needed in the future
        // include: {
        //   customer: true,
        //   items: true,
        // },
      }),
      prisma.order.count(),
    ]);

    const totalPages = Math.ceil(totalOrders / limitNumber);

    return NextResponse.json({
      data: orders,
      pagination: {
        currentPage: pageNumber,
        totalPages: totalPages,
        totalItems: totalOrders,
        itemsPerPage: limitNumber,
      },
    });
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return handleApiError(error);
  }
}

// Placeholder for POST request to create orders (implement later)
// export async function POST(request: Request) {
//   // ... implementation ...
//   return NextResponse.json({ message: 'Order created successfully' }, { status: 201 });
// }
