import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { renderDualColourTag } from '../lib/openscad';

// Use direct string literals to match the database schema enum values
const RENDER_STATE = {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed'
} as const;

// Configuration --------------------------
const TARGET_SKU = 'PER-KEY3D-STY3-Y3D';
const MAX_RETRIES = 3;
const CONCURRENCY = Number(process.env.STL_WORKER_CONCURRENCY ?? '2')
const POLL_INTERVAL_MS = Number(process.env.STL_WORKER_POLL_MS ?? '5000')
const prisma = new PrismaClient();

// Paths (Consider making these configurable via environment variables)
const STL_OUTPUT_DIR_ABS = path.join(process.cwd(), 'public', 'stl'); // Absolute path for file system ops
const STL_OUTPUT_DIR_RELATIVE = 'public/stl'; // Relative path for storing in DB/generating URLs

// Define a type for errors potentially coming from exec
interface ExecError extends Error {
    stdout?: string;
    stderr?: string;
    code?: number;
    signal?: string;
}

// Helper Functions -----------------------

/**
 * Creates a filesystem-safe "slug" from a string.
 * Replaces spaces and non-alphanumeric characters with underscores.
 */
function slug(str: string): string {
    return str
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^\w-]+/g, '') // Remove all non-word chars except hyphen
        .replace(/--+/g, '_') // Replace multiple hyphens with single underscore
        .replace(/^-+/, '') // Trim hyphen from start of text
        .replace(/-+$/, ''); // Trim hyphen from end of text
}

// Database Interaction -------------------
async function reserveTask() {
    // Transaction to find and reserve the oldest pending task for the target SKU
    return prisma.$transaction(async tx => {
        // Log the search criteria we're using
        console.log(`[${new Date().toISOString()}] Searching for tasks with stl_render_state='${RENDER_STATE.pending}' and product.sku='${TARGET_SKU}'`);

        const task = await tx.printOrderTask.findFirst({
            where: {
                // Only filter by stl_render_state, not by status
                // since the tasks can have status='completed' but still need STL rendering
                stl_render_state: RENDER_STATE.pending,
                product: { sku: TARGET_SKU },
            },
            orderBy: { created_at: 'asc' },
            select: { id: true, custom_text: true, color_1: true, color_2: true, render_retries: true, status: true }, // Select necessary fields including status
        });

        if (!task) {
            return null;
        }

        // Mark only the STL status as running using raw SQL
        await tx.$executeRaw`
            UPDATE PrintOrderTask 
            SET stl_render_state = 'running'
            WHERE id = ${task.id}
        `;

        console.log(`[${new Date().toISOString()}] Reserved task ${task.id} with status='${task.status}'`);

        return task;
    });
}

// Worker Logic --------------------------
async function processTask(task: { id: number; custom_text: string | null; color_1: string | null; color_2: string | null; render_retries: number }) {
    const taskId = task.id;
    let stlRelativePath = null; // Initialize relative path

    try {
        console.log(`[${new Date().toISOString()}] Processing task ${taskId}...`);

        // 1. Ensure output directory exists
        await fs.mkdir(STL_OUTPUT_DIR_ABS, { recursive: true });
        console.log(`[${new Date().toISOString()}] Ensured output directory exists: ${STL_OUTPUT_DIR_ABS}`);

        // 2. Prepare data for OpenSCAD
        const lines = (task.custom_text ?? '').split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean);
        const [line1, line2, line3] = [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
        const color1 = task.color_1 ?? 'Black'; // Default colors if null
        const color2 = task.color_2 ?? 'White';

        // Create a unique, safe filename
        const safeName = slug(line1 || `task_${taskId}` || 'untitled');
        const outputFilename = `task_${taskId}_${safeName}.stl`;
        const outputFilePathAbs = path.join(STL_OUTPUT_DIR_ABS, outputFilename);
        stlRelativePath = path.join(STL_OUTPUT_DIR_RELATIVE, outputFilename); // Store relative path

        console.log(`[${new Date().toISOString()}] Prepared data for task ${taskId}: Lines=["${line1}", "${line2}", "${line3}"], colors=["${color1}", "${color2}"]`);
        console.log(`[${new Date().toISOString()}] Output STL path: ${outputFilePathAbs}`);

        // 3. Render via OpenSCAD wrapper
        console.log(`[${new Date().toISOString()}] Rendering STL via OpenSCAD wrapper for task ${taskId}...`);

        // Font rendering consistency parameters
        // These values have been carefully tuned to ensure consistent output between
        // Windows and Linux OpenSCAD renderings. Linux tends to render fonts wider,
        // so we compensate with these parameters.
        const fontNarrowWiden = -5.5;    // -5.5 produces better width matching than -5
        const characterSpacing = 0.92;   // Adjust character spacing for consistent look

        console.log(`[${new Date().toISOString()}] Using font parameters: fontNarrowWiden=${fontNarrowWiden}, characterSpacing=${characterSpacing}`);

        const stlPathAbs = await renderDualColourTag(line1, line2, line3, {
            fileName: outputFilename,
            fontNarrowWiden,
            characterSpacing
        });
        console.log(`[${new Date().toISOString()}] STL rendered at ${stlPathAbs}`);

        // 5. Update database on success using raw SQL to bypass Prisma type issues
        await prisma.$executeRaw`
            UPDATE PrintOrderTask 
            SET 
                stl_path = ${stlRelativePath},
                stl_render_state = 'completed',
                annotation = NULL,
                render_retries = 0
            WHERE id = ${taskId}
        `;

        console.log(`✓ STL rendered successfully for task ${taskId} → ${stlRelativePath}`);

    } catch (err: unknown) {
        console.error(`[${new Date().toISOString()}] Error processing task ${taskId}:`, err);
        const nextRetries = task.render_retries + 1;
        const isOutOfRetries = nextRetries >= MAX_RETRIES;

        // Extract error details safely
        let errorMessage = 'Unknown error';
        let commandOutput = '';

        if (err instanceof Error) {
            errorMessage = err.message;
            // Check if it's likely an exec error by looking for stderr/stdout properties
            if (typeof err === 'object' && err !== null && ('stderr' in err || 'stdout' in err)) {
                const execError = err as ExecError;
                commandOutput = execError.stderr || execError.stdout || '';
            } // No else needed here, commandOutput remains '' if not an exec error
        } else {
            errorMessage = String(err);
        }

        const fullError = `Error: ${errorMessage}\nOutput:\n${commandOutput}`.substring(0, 1000); // Limit annotation length

        // Update error state using raw SQL to bypass Prisma type issues
        await prisma.$executeRaw`
            UPDATE PrintOrderTask 
            SET 
                render_retries = ${nextRetries},
                stl_render_state = ${isOutOfRetries ? 'failed' : 'pending'},
                annotation = ${`STL render error (${nextRetries}/${MAX_RETRIES}): ${fullError}`}
            WHERE id = ${taskId}
        `;
        console.error(`✗ Failed to render STL for task ${taskId}. Retry ${nextRetries}/${MAX_RETRIES}. Marked as ${isOutOfRetries ? 'failed' : 'pending'}.`);
    }
}

// Main Loop --------------------------
// Simple version to run and process a single task batch (exported for testing)
export async function runTaskBatch() {
    console.log(`[${new Date().toISOString()}] Checking for tasks to process...`);
    const running: Promise<void>[] = [];

    // Get current running tasks
    const task = await reserveTask();
    if (task) {
        console.log(`[${new Date().toISOString()}] Found task ${task.id} to process`);
        // Process the task and add to running
        running.push(processTask(task));
    } else {
        console.log(`[${new Date().toISOString()}] No pending tasks found`);
        return;
    }

    // Wait for all tasks to complete
    if (running.length > 0) {
        // Wait for all tasks to settle (complete or error)
        const settled = await Promise.allSettled(running);
        console.log(`[${new Date().toISOString()}] ${settled.length} tasks processed`);
    }
}

async function workerLoop() {
    // Track running promises
    const running: Promise<void>[] = [];

    // Function to handle a single iteration
    async function iteration() {
        console.log(`[${new Date().toISOString()}] Checking for pending STL render tasks...`);

        // Clean up completed promises using Promise.allSettled
        if (running.length > 0) {
            const settled = await Promise.allSettled(running);
            // Remove completed promises (both fulfilled and rejected)
            // Promise.allSettled never returns 'pending' status, so we need to check for the opposite
            // and remove those promises that have completed one way or another
            for (let i = running.length - 1; i >= 0; i--) {
                if (settled[i].status === 'fulfilled' || settled[i].status === 'rejected') {
                    running.splice(i, 1);
                }
            }
        }

        // Fill up to CONCURRENCY
        while (running.length < CONCURRENCY) {
            const task = await reserveTask();
            if (!task) {
                console.log(`[${new Date().toISOString()}] No pending tasks found`);
                break; // No more tasks to process
            }
            console.log(`[${new Date().toISOString()}] Found task ${task.id}, spinning up render`);
            const p = processTask(task);
            running.push(p);
        }

        // Log summary after each iteration
        console.log(`[${new Date().toISOString()}] Iteration complete; ${running.length} in-flight tasks`);

    }

    // Run immediately first
    console.log(`[${new Date().toISOString()}] STL Render Worker started with concurrency ${CONCURRENCY}`);
    await iteration().catch(err => {
        console.error('Initial worker run failed:', err);
    });

    // Then set up interval
    setInterval(() => {
        iteration().catch(err => {
            console.error('Worker iteration failed:', err);
        });
    }, POLL_INTERVAL_MS);
}

// Start the worker loop
workerLoop().catch(e => {
    console.error('Worker crashed', e);
    process.exit(1);
});
