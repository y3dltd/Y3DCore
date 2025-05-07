import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';
import { getSearchParamsFromRequest } from '@/lib/utils';

/**
 * GET /api/print-tasks/bulk-details?ids=1,2,3
 * Fetches basic product details (name, sku) for a list of PrintOrderTask IDs.
 */
export async function GET(request: NextRequest) {
    const searchParams = getSearchParamsFromRequest(request);

    if (!searchParams) {
        return NextResponse.json({ success: false, error: 'Invalid request URL or search parameters' }, { status: 400 });
    }
    
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
        return NextResponse.json({ success: false, error: 'Missing task IDs' }, { status: 400 });
    }

    // Parse and validate IDs
    const ids = idsParam.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id));

    if (ids.length === 0) {
        return NextResponse.json({
            success: false,
            error: 'No valid numeric task IDs provided',
        }, { status: 400 });
    }

    try {
        console.log(`[API bulk-details] Fetching details for ${ids.length} task IDs: ${ids.join(',')}`);
        
        // Using the correct Prisma query structure based on our schema
        const tasksWithDetails = await prisma.printOrderTask.findMany({
            where: {
                id: {
                    in: ids,
                },
            },
            select: {
                id: true,
                shorthandProductName: true, // Get the shorthand product name directly if available
                product: {
                    select: {
                        name: true,
                        sku: true,
                    },
                },
                orderItem: {
                    select: {
                        // Only select fields that exist in the OrderItem model
                        productId: true,
                        product: {
                            select: {
                                name: true,
                                sku: true
                            }
                        }
                    }
                }
            },
        });

        // Transform into the desired map format: Record<string, { productName, sku }>
        const detailsMap: Record<string, { productName: string | null; sku: string | null }> = {};
        
        // Log data for debugging
        console.log(`[API bulk-details] Found ${tasksWithDetails.length} tasks`);
        
        // Debug the raw response
        console.log(`[API bulk-details] Task details sample:`, 
            tasksWithDetails.length > 0 ? JSON.stringify(tasksWithDetails[0], null, 2) : 'No tasks found');
            
        tasksWithDetails.forEach(task => {
            // Find the best product name using multiple fallback sources
            const productName = 
                task.shorthandProductName || // Try direct shorthand name first
                task.product?.name || 
                task.orderItem?.product?.name || 
                `Product (${task.product?.sku || task.orderItem?.product?.sku || 'Unknown SKU'})`;
                
            // Get the best SKU using multiple fallback sources
            const sku = task.product?.sku || task.orderItem?.product?.sku || null;
            
            detailsMap[String(task.id)] = {
                productName: productName,
                sku: sku,
            };
            
            // Log product name resolution for debugging
            console.log(`[API bulk-details] Task ${task.id} product name: ${productName}`);
            console.log(`[API bulk-details] Task sources:`, {
                shorthandName: task.shorthandProductName,
                productName: task.product?.name,
                orderItemProductName: task.orderItem?.product?.name
            });
        });

        return NextResponse.json({ success: true, details: detailsMap });
    } catch (error) {
        console.error('[API bulk-details] Error fetching task details:', error);
        return handleApiError(error); // Use centralized error handler
    }
}

// Ensure the route is revalidated on every request
export const dynamic = 'force-dynamic'; 
