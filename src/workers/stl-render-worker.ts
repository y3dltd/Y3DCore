import { Prisma, PrismaClient } from '@prisma/client'; // Import Prisma namespace
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
        console.log(`[${new Date().toISOString()}] Searching for tasks with stl_render_state='${RENDER_STATE.pending}' and product.sku='${TARGET_SKU}'`);

        // Find the ID of the oldest pending task first
        const taskToReserve = await tx.printOrderTask.findFirst({
            where: {
                stl_render_state: RENDER_STATE.pending,
                product: { sku: TARGET_SKU },
            },
            orderBy: { created_at: 'asc' },
            select: { id: true }, // Only need the ID initially
        });

        if (!taskToReserve) {
            return null; // No pending tasks found
        }

        // Attempt to update the specific task found, ensuring it's still pending
        const updateResult = await tx.printOrderTask.updateMany({
            where: {
                id: taskToReserve.id,
                stl_render_state: RENDER_STATE.pending, // Crucial: Ensure it's still pending
            },
            data: {
                stl_render_state: RENDER_STATE.running,
            },
        });

        // Check if the update actually modified a row
        if (updateResult.count === 0) {
            // The task was likely picked up by another worker between the findFirst and updateMany
            console.log(`[${new Date().toISOString()}] Task ${taskToReserve.id} was already reserved by another process. Skipping.`);
            return null; // Indicate that reservation failed
        }

        // If update succeeded, fetch the necessary task details
        const reservedTask = await tx.printOrderTask.findUnique({
            where: { id: taskToReserve.id },
            select: { id: true, custom_text: true, color_1: true, color_2: true, render_retries: true, status: true },
        });

        // This should ideally not happen if updateResult.count was > 0, but check just in case
        if (!reservedTask) {
            console.error(`[${new Date().toISOString()}] CRITICAL: Failed to fetch details for task ${taskToReserve.id} immediately after successful reservation update.`);
            // Attempt to revert the state back to pending to avoid losing the task
            await tx.printOrderTask.update({
                where: { id: taskToReserve.id },
                data: { stl_render_state: RENDER_STATE.pending }
            });
            return null;
        }


        console.log(`[${new Date().toISOString()}] Reserved task ${reservedTask.id} with status='${reservedTask.status}'`);
        return reservedTask; // Return the full task details needed by processTask

    }, {
        maxWait: 10000, // Optional: Adjust transaction timeouts if needed
        timeout: 20000
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
        let lines = (task.custom_text ?? '').split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean);

        // Check if we have only one line and it contains a space (likely a full name)
        // Only apply this logic if line2 is empty - don't override existing multiline input
        if (lines.length === 1 && lines[0].includes(' ') && !lines[1]) {
            const nameParts = lines[0].split(' ');
            // If we have exactly two parts, use them as first name and surname
            if (nameParts.length === 2) {
                lines = [nameParts[0], nameParts[1]];
                console.log(`[${new Date().toISOString()}] Split full name "${lines[0]} ${lines[1]}" across two lines`);
            }
            // If we have more than two parts, try to intelligently split into first name(s) and surname
            else if (nameParts.length > 2) {
                // Use all but the last part as the first name(s) and the last part as the surname
                const firstName = nameParts.slice(0, -1).join(' ');
                const surname = nameParts[nameParts.length - 1];
                lines = [firstName, surname];
                console.log(`[${new Date().toISOString()}] Split multi-part name "${firstName} ${surname}" across two lines`);
            }
        }

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

// Helper to fix invalid stl_render_state values 
async function fixInvalidStlRenderStates() {
    try {
        // Find and update records whose state is not one of the known valid states,
        // but ONLY if they haven't already been successfully rendered (i.e., stl_path is not set).
        // This prevents resetting completed tasks even if their state was somehow corrupted later.
        const validStates = [RENDER_STATE.pending, RENDER_STATE.running, RENDER_STATE.completed, RENDER_STATE.failed];
        const count = await prisma.$executeRaw`
            UPDATE PrintOrderTask
            SET stl_render_state = ${RENDER_STATE.pending}
            WHERE stl_render_state NOT IN (${Prisma.join(validStates)})
              AND (stl_path = '' OR stl_path IS NULL)
        `;
        // Note: Using $executeRaw instead of $executeRawUnsafe for better type safety with Prisma.join

        if (count > 0) {
            console.log(`[${new Date().toISOString()}] Fixed ${count} records with invalid stl_render_state values`);
        }
        return count;
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Error fixing invalid stl_render_state values:`, err);
        return 0;
    }
}

// Main Loop --------------------------
// Simple version to run and process a single task batch (exported for testing)
export async function runTaskBatch() {
    console.log(`[${new Date().toISOString()}] Checking for tasks to process...`);

    // First, fix any invalid stl_render_state values
    await fixInvalidStlRenderStates();

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

    // Function to handle a single iteration of the worker loop
    async function iteration() {
        console.log(`[${new Date().toISOString()}] Checking for pending STL render tasks...`);
        let tasksStartedThisIteration = 0;

        // Fix any invalid stl_render_state values at the start of each iteration
        await fixInvalidStlRenderStates();

        // Try to fill up available concurrency slots for *this iteration*
        // We don't need to track promises across iterations anymore,
        // the database lock handles the actual concurrency.
        // We just limit how many tasks *this specific check* tries to start.
        for (let i = 0; i < CONCURRENCY; i++) {
            const task = await reserveTask();
            if (!task) {
                // console.log(`[${new Date().toISOString()}] No more pending tasks found this iteration.`);
                break; // No more tasks found to reserve in this loop
            }
            // If reserveTask succeeded, it returns the task details
            console.log(`[${new Date().toISOString()}] Found and reserved task ${task.id}, spinning up render`);
            tasksStartedThisIteration++;
            // Start processing the task, but don't wait for it here (fire and forget within the loop)
            // Error handling is inside processTask
            processTask(task).catch(err => {
                // Log unexpected errors from processTask promise itself, though it should handle its own errors
                console.error(`[${new Date().toISOString()}] Uncaught error from processTask for task ${task.id}:`, err);
            });
        }

        // Log summary for this iteration's attempt
        console.log(`[${new Date().toISOString()}] Iteration check complete; attempted to start ${tasksStartedThisIteration} tasks.`);
    } // End of iteration function

    // Function to schedule the next iteration using setTimeout
    const scheduleNextIteration = () => {
        // console.log(`[${new Date().toISOString()}] Scheduling next iteration in ${POLL_INTERVAL_MS}ms`);
        setTimeout(() => {
            iterationWrapper(); // Call the wrapper which includes error handling and rescheduling
        }, POLL_INTERVAL_MS);
    };

    // Wrapper around iteration to handle errors and ensure rescheduling
    const iterationWrapper = async () => {
        try {
            await iteration();
        } catch (err) {
            console.error(`[${new Date().toISOString()}] Error during worker iteration execution:`, err);
            // Log error but continue scheduling next iteration
        } finally {
            // Always schedule the next run
            scheduleNextIteration();
        }
    };

    // --- Worker Start ---
    console.log(`[${new Date().toISOString()}] STL Render Worker starting with concurrency ${CONCURRENCY}`);
    // Start the first iteration immediately
    iterationWrapper();

} // End of workerLoop function

// Start the worker loop
workerLoop().catch(e => {
    // This catch is primarily for errors during the initial setup of workerLoop itself,
    // before the first iteration starts. Iteration errors are caught inside iterationWrapper.
    console.error(`[${new Date().toISOString()}] Worker loop failed during initial setup:`, e);
    process.exit(1); // Exit if the loop setup itself fails critically
});
