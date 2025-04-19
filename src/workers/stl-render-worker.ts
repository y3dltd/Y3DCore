import { renderDualColourTag, slug } from '@/lib/openscad'
import { PrismaClient, StlRenderState } from '@prisma/client'

// Configuration --------------------------
const TARGET_SKU = 'PER-KEY3D-STY3-Y3D'
const CONCURRENCY = Number(process.env.STL_WORKER_CONCURRENCY ?? '2')
const POLL_INTERVAL_MS = Number(process.env.STL_WORKER_POLL_MS ?? '5000')
const MAX_RETRIES = 3

// ----------------------------------------
const prisma = new PrismaClient()

async function reserveTask() {
    // Grab a single pending task and atomically mark it running
    return prisma.$transaction(async tx => {
        const task = await tx.printOrderTask.findFirst({
            where: {
                stl_render_state: StlRenderState.pending,
                product: { sku: TARGET_SKU },
            },
            orderBy: { created_at: 'asc' },
            include: { product: true },
        })

        if (!task) return null

        await tx.printOrderTask.update({
            where: { id: task.id },
            data: { stl_render_state: StlRenderState.running },
        })

        return task
    })
}

async function processTask(task: { id: number; custom_text: string | null; color_1: string | null; color_2: string | null; render_retries: number }) {
    try {
        // Split custom text into up to 3 lines (simple heuristic)
        const lines = (task.custom_text ?? '').split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean)
        const [line1, line2, line3] = [lines[0] ?? '', lines[1] ?? '', lines[2] ?? '']

        const safeName = slug(line1 || 'tag')
        const stlPath = await renderDualColourTag(line1, line2, line3, { fileName: `${safeName}_DualColour.stl` })

        await prisma.printOrderTask.update({
            where: { id: task.id },
            data: {
                stl_render_state: StlRenderState.success,
                stl_path: stlPath,
            },
        })

        console.log(`✓ STL rendered for task ${task.id} → ${stlPath}`)
    } catch (err) {
        console.error(`✗ STL render failed for task ${task.id}:`, err)
        const nextRetries = task.render_retries + 1
        await prisma.printOrderTask.update({
            where: { id: task.id },
            data: {
                render_retries: nextRetries,
                stl_render_state: nextRetries >= MAX_RETRIES ? StlRenderState.failed : StlRenderState.pending,
                annotation: `STL render error (${nextRetries}/${MAX_RETRIES}): ${err instanceof Error ? err.message : String(err)}`,
            },
        })
    }
}

async function workerLoop() {
    const running: Promise<void>[] = []

    setInterval(async () => {
        // Clean finished promises
        for (let i = running.length - 1; i >= 0; i--) if ((await Promise.race([running[i], Promise.resolve('done')])) === undefined) running.splice(i, 1)

        while (running.length < CONCURRENCY) {
            const task = await reserveTask()
            if (!task) break
            running.push(processTask(task))
        }
    }, POLL_INTERVAL_MS)
}

workerLoop().catch(e => {
    console.error('Worker crashed', e)
    process.exit(1)
}) 
