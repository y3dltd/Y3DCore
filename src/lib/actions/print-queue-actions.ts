'use server'

import { prisma } from "@/lib/prisma"
import { PrintTaskStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

/**
 * Finds print tasks that are still pending or in-progress but belong to orders
 * that have already been shipped or cancelled, and updates their status to completed.
 */
export async function cleanShippedOrderTasks() {
    try {
        // Explicitly type the where clause
        const whereClause: Prisma.PrintOrderTaskWhereInput = {
            status: {
                in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress],
            },
            // Filter by related order status using the correct field name 'order_status'
            order: {
                order_status: { // Use the correct field name from schema.prisma
                    // Use string literals for shipped and cancelled statuses
                    in: ["shipped", "cancelled"],
                },
            },
        }

        // Find tasks that are pending or in_progress
        const tasksToUpdate = await prisma.printOrderTask.findMany({
            where: whereClause, // Use the typed where clause
            select: {
                id: true, // Select only the IDs needed for the update
            },
        })

        const taskIds = tasksToUpdate.map((task) => task.id)

        if (taskIds.length > 0) {
            // Update the status of the identified tasks to completed
            const updateResult = await prisma.printOrderTask.updateMany({
                where: {
                    id: {
                        in: taskIds,
                    },
                },
                data: {
                    status: PrintTaskStatus.completed,
                },
            })

            console.log(
                `[cleanShippedOrderTasks] Marked ${updateResult.count} tasks as completed.`
            )

            // Revalidate the print queue page to reflect the changes
            revalidatePath("/print-queue")

            return { success: true, count: updateResult.count }
        } else {
            console.log("[cleanShippedOrderTasks] No tasks needed cleanup.")
            return { success: true, count: 0 }
        }
    } catch (error) {
        console.error("[cleanShippedOrderTasks] Error cleaning up tasks:", error)
        return {
            success: false,
            error: "Failed to clean up shipped/cancelled order tasks.",
        }
    }
} 
