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
    // Build dynamic where clause immutably to keep strict typing intact
    const baseWhere: Prisma.OrderWhereInput = {
        order_status: 'awaiting_shipment',
        // Every associated printTask must be completed
        printTasks: { every: { status: 'completed' } },
        ...(window === 'today'
            ? { order_date: { gte: startOfToday(), lte: endOfToday() } }
            : window === 'tomorrow'
                ? { order_date: { gte: startOfTomorrow(), lte: endOfTomorrow() } }
                : {}),
        // TODO: Temporarily removed direct lastPackingSlipAt filter due to Prisma client validation error
        // Field exists in DB but not recognized by Prisma
        // ...(!includePrinted ? { lastPackingSlipAt: { equals: null } } : {}),
    }

    const take = limit === 'all' ? undefined : limit

    // If we need to filter by lastPackingSlipAt being null
    if (!includePrinted) {
        // Use Prisma with a raw SQL WHERE condition 
        const rawCondition = `${baseWhere.order_status === 'awaiting_shipment' ? '1=1' : "order_status = 'awaiting_shipment'"} 
            AND (SELECT COUNT(*) FROM PrintOrderTask WHERE PrintOrderTask.orderId = \`Order\`.id AND status <> 'completed') = 0 
            AND ${window === 'today'
                ? 'order_date >= DATE(NOW()) AND order_date < DATE_ADD(DATE(NOW()), INTERVAL 1 DAY)'
                : window === 'tomorrow'
                    ? 'order_date >= DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) AND order_date < DATE_ADD(DATE(NOW()), INTERVAL 2 DAY)'
                    : '1=1'
            } 
            AND lastPackingSlipAt IS NULL`;

        const rows = await prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM \`Order\` 
            WHERE ${Prisma.raw(rawCondition)}
            ORDER BY order_date ASC, id ASC
            ${limit === 'all' ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
        `;

        return rows.map(r => r.id);
    } else {
        // Use standard Prisma query if we don't need to filter by lastPackingSlipAt
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
}

export async function markOrdersPrinted(ids: number[]): Promise<void> {
    if (!ids.length) return
    await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { lastPackingSlipAt: new Date() },
    })
} 
