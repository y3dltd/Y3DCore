export { }

// Utilities for selecting and updating orders for batch packing-slip generation
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } from 'date-fns'

export async function getCandidateOrderIds({
    window,
    limit,
    includePrinted,
}: {
    window: 'today' | 'tomorrow' | 'remaining'
    limit: number | 'all'
    includePrinted: boolean
}): Promise<number[]> {
    // Build dynamic where clause immutably using standard Prisma types
    const baseWhere: Prisma.OrderWhereInput = {
        order_status: 'awaiting_shipment',
        // Every associated printTask must be completed
        printTasks: { every: { status: 'completed' } },
        ...(window === 'today'
            ? { order_date: { gte: startOfToday(), lte: endOfToday() } }
            : window === 'tomorrow'
                ? { order_date: { gte: startOfTomorrow(), lte: endOfTomorrow() } }
                : {}),
        // Use standard Prisma filter syntax now
        ...(!includePrinted ? { lastPackingSlipAt: { equals: null } } : {}),
    }

    const take = limit === 'all' ? undefined : limit

    // Use standard Prisma query
    const rows = await prisma.order.findMany({
        where: baseWhere,
        select: { id: true },
        orderBy: [
            { order_date: 'asc' },
            { id: 'asc' }, // ensure deterministic ordering when using `take`
        ],
        take,
    });

    return rows.map((r) => r.id);
}

export async function markOrdersPrinted(ids: number[]): Promise<void> {
    if (!ids.length) return
    await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { lastPackingSlipAt: new Date() },
    })
} 
