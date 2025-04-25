import { Prisma, PrismaClient } from '@prisma/client'; // Import Prisma namespace
import * as fs from 'fs/promises';
import * as path from 'path';
// Import new functions
import { renderCableClip, renderDualColourFromConfig, renderDualColourTagNew, renderRegKey } from '../lib/openscad';

// Use direct string literals to match the database schema enum values
const RENDER_STATE = {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed'
} as const;

// Configuration --------------------------
const MAX_RETRIES = 10;
const CONCURRENCY = Number(process.env.STL_WORKER_CONCURRENCY ?? '10')
const POLL_INTERVAL_MS = Number(process.env.STL_WORKER_POLL_MS ?? '5000')
const prisma = new PrismaClient();
const _FORCE = process.argv.includes('--force');
// New flag to control skipping existing files (defaults to false - overwrite by default)
const SKIP_IF_EXISTS = process.argv.includes('--skip-if-exists');

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
        // Keep original case but sanitise for filesystem
        .replace(/\s+/g, '_')               // spaces → underscore
        .replace(/[^A-Za-z0-9_-]/g, '')       // allow hyphen, only alphanum _ -
        .replace(/_+/g, '_')                 // collapse repeating underscores
        .slice(0, 60) || 'Tag';              // fallback
}

// Maps SKU to a human-readable product folder name used in the output path
function getProductFolder(sku: string): string {
    if (sku === 'PER-KEY3D-STY3-Y3D') return 'dual-colours';
    if (sku === 'Y3D-NKC-002') return 'style3-tag';
    if (sku === 'N9-93VU-76VK') return 'new3-tag';
    if (sku === 'Y3D-REGKEY-STL1') return 'reg-keys';
    if (sku.startsWith('PER-2PER-')) return 'cable-clip';
    return 'other';
}

// First-character directory (A-Z or # for non-letters)
function getAlphaFolder(name: string): string {
    const ch = name.charAt(0).toUpperCase();
    return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

// Database Interaction -------------------
async function reserveTask() {
    // Transaction to find and reserve the oldest pending task for any supported SKU
    return prisma.$transaction(async tx => {
        // Updated to search for multiple SKUs and patterns
        const supportedStaticSKUs = ['PER-KEY3D-STY3-Y3D', 'Y3D-NKC-002', 'N9-93VU-76VK', 'Y3D-REGKEY-STL1'];
        const supportedPrefix = 'PER-2PER-';
        console.log(`[${new Date().toISOString()}] Searching for tasks with stl_render_state='${RENDER_STATE.pending}' and supported SKUs/Prefixes`);

        // Find the ID of the oldest pending task first for any supported SKU or prefix
        const taskToReserve = await tx.printOrderTask.findFirst({
            where: {
                stl_render_state: RENDER_STATE.pending,
                OR: [
                    { product: { sku: { in: supportedStaticSKUs } } },
                    { product: { sku: { startsWith: supportedPrefix } } }
                ]
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

        // If update succeeded, fetch the necessary task details including product sku
        const reservedTask = await tx.printOrderTask.findUnique({
            where: { id: taskToReserve.id },
            select: { id: true, custom_text: true, color_1: true, color_2: true, render_retries: true, status: true, product: { select: { sku: true } } }, // Select product sku
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

        console.log(`[${new Date().toISOString()}] Reserved task ${reservedTask.id} with status='${reservedTask.status}' and SKU '${reservedTask.product.sku}'`);
        return reservedTask as TaskWithProduct; // Return the full task details needed by processTask

    }, {
        maxWait: 100000, // Optional: Adjust transaction timeouts if needed
        timeout: 200000
    });
}

// Common type for task records used by processTask
type TaskWithProduct = {
    id: number;
    custom_text: string | null;
    color_1: string | null;
    color_2: string | null;
    render_retries: number;
    product: { sku: string };
};

// Worker Logic --------------------------
async function processTask(task: TaskWithProduct) {
    const taskId = task.id;
    const taskSku = task.product.sku;
    const customText = task.custom_text ?? '';
    let stlRelativePath: string | null = null; // Initialize relative path for the primary file
    let stlPathAbs: string | null = null; // Absolute path for the primary file
    let stlPathAbsSecondary: string | null = null; // Absolute path for the secondary file (cable clips)

    // Helper to mark DB completed without rendering (captures taskId)
    const completeWithoutRender = async (relativePath: string) => {
        console.log(`[${new Date().toISOString()}] STL already exists for task ${taskId} → ${relativePath}. Skipping render.`);
        await prisma.$executeRaw`
            UPDATE PrintOrderTask
            SET stl_path = ${relativePath}, stl_render_state = 'completed', annotation = NULL, render_retries = 0
            WHERE id = ${taskId}
        `;
    };

    try {
        console.log(`[${new Date().toISOString()}] Processing task ${taskId} for SKU ${taskSku}...`);

        // 1. Determine structured output directory (product / A-Z)
        const productFolder = getProductFolder(taskSku);
        const alphaFolder = getAlphaFolder(slug(customText.split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean)[0] || `Tag${taskId}`));
        const relativeDir = path.join(STL_OUTPUT_DIR_RELATIVE, productFolder, alphaFolder);
        const absDir = path.join(STL_OUTPUT_DIR_ABS, productFolder, alphaFolder);

        await fs.mkdir(absDir, { recursive: true });
        console.log(`[${new Date().toISOString()}] Ensured output directory exists: ${absDir}`);

        // Create a unique, safe filename base
        const safeName = slug(customText.split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean)[0] || `Tag${taskId}`);
        // Append UC suffix for all-uppercase names to avoid Windows case-insensitive collisions
        const isAllUpper = safeName === safeName.toUpperCase() && /[A-Z]/.test(safeName);
        const baseOutputFilename = `${safeName}${isAllUpper ? '_UC' : ''}`; // Append _UC if uppercase

        console.log(`[${new Date().toISOString()}] Prepared data for task ${taskId}: Custom Text="${customText}"`);

        // 3. Render via OpenSCAD wrapper based on SKU
        console.log(`[${new Date().toISOString()}] Rendering STL via OpenSCAD wrapper for task ${taskId} (SKU: ${taskSku})...`);

        if (taskSku === 'PER-KEY3D-STY3-Y3D') {
            // Existing logic for the old SKU
            const outputFilename = `${baseOutputFilename}.stl`;
            stlRelativePath = path.join(relativeDir, outputFilename);

            // Check if file exists and handle based on SKIP_IF_EXISTS flag
            const existingPath = path.join(absDir, outputFilename);
            let fileExists = false;
            try { await fs.access(existingPath); fileExists = true; } catch { }
            if (fileExists) {
                if (SKIP_IF_EXISTS) {
                    await completeWithoutRender(stlRelativePath);
                    return;
                } else {
                    console.log(`[${new Date().toISOString()}] Overwriting existing file ${existingPath}`);
                    await fs.unlink(existingPath);
                }
            }

            let lines = customText.split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean);
            if (lines.length === 1 && lines[0].includes(' ') && !lines[1]) {
                const nameParts = lines[0].split(' ');
                if (nameParts.length === 2) {
                    lines = [nameParts[0], nameParts[1]];
                    console.log(`[${new Date().toISOString()}] Split full name "${lines[0]} ${lines[1]}" across two lines`);
                } else if (nameParts.length > 2) {
                    const firstName = nameParts.slice(0, -1).join(' ');
                    const surname = nameParts[nameParts.length - 1];
                    lines = [firstName, surname];
                    console.log(`[${new Date().toISOString()}] Split multi-part name "${firstName} ${surname}" across two lines`);
                }
            }
            const [line1, line2, line3] = [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
            stlPathAbs = await renderDualColourTagNew(line1, line2, line3, {
                fileName: outputFilename,
                outputDir: absDir,
            });

        } else if (taskSku === 'Y3D-NKC-002') {
            // Existing logic for Y3D-NKC-002 using Style3 config
            const outputFilename = `${baseOutputFilename}.stl`;
            stlRelativePath = path.join(relativeDir, outputFilename);

            // Check if file exists and handle based on SKIP_IF_EXISTS flag
            const existingPath = path.join(absDir, outputFilename);
            let fileExists = false;
            try { await fs.access(existingPath); fileExists = true; } catch { }
            if (fileExists) {
                if (SKIP_IF_EXISTS) {
                    await completeWithoutRender(stlRelativePath);
                    return;
                } else {
                    console.log(`[${new Date().toISOString()}] Overwriting existing file ${existingPath}`);
                    await fs.unlink(existingPath);
                }
            }

            stlPathAbs = await renderDualColourFromConfig(
                'openscad/render_settings.json',
                'Style3',
                customText,
                { fileName: outputFilename, outputDir: absDir }
            );
        } else if (taskSku === 'N9-93VU-76VK') {
            // Existing logic for N9-93VU-76VK using New3 config
            const outputFilename = `${baseOutputFilename}.stl`;
            stlRelativePath = path.join(relativeDir, outputFilename);

            // Check if file exists and handle based on SKIP_IF_EXISTS flag
            const existingPath = path.join(absDir, outputFilename);
            let fileExists = false;
            try { await fs.access(existingPath); fileExists = true; } catch { }
            if (fileExists) {
                if (SKIP_IF_EXISTS) {
                    await completeWithoutRender(stlRelativePath);
                    return;
                } else {
                    console.log(`[${new Date().toISOString()}] Overwriting existing file ${existingPath}`);
                    await fs.unlink(existingPath);
                }
            }

            stlPathAbs = await renderDualColourFromConfig(
                'openscad/render_settings.json',
                'New3',
                customText,
                { fileName: outputFilename, outputDir: absDir }
            );
        } else if (taskSku === 'Y3D-REGKEY-STL1') {
            // New logic for RegKey
            const outputFilename = `${baseOutputFilename}.stl`;
            stlRelativePath = path.join(relativeDir, outputFilename);

            // Check if file exists and handle based on SKIP_IF_EXISTS flag
            const existingPath = path.join(absDir, outputFilename);
            let fileExists = false;
            try { await fs.access(existingPath); fileExists = true; } catch { }
            if (fileExists) {
                if (SKIP_IF_EXISTS) {
                    await completeWithoutRender(stlRelativePath);
                    return;
                } else {
                    console.log(`[${new Date().toISOString()}] Overwriting existing file ${existingPath}`);
                    await fs.unlink(existingPath);
                }
            }

            stlPathAbs = await renderRegKey(customText, {
                fileName: outputFilename,
                outputDir: absDir
            });
        } else if (taskSku.startsWith('PER-2PER-')) {
            // New logic for Cable Clips (generate two files)
            const line1 = customText.split(/\r?\n|\\|\//).map(t => t.trim()).filter(Boolean)[0] ?? ''; // Use only first line
            const outputFilename35 = `${baseOutputFilename}_35mm.stl`;
            const outputFilename40 = `${baseOutputFilename}_40mm.stl`;

            stlRelativePath = path.join(relativeDir, outputFilename35); // Store 3.5mm path in DB

            // If both 3.5 and 4.0 already exist, handle based on SKIP_IF_EXISTS flag
            const abs35 = path.join(absDir, outputFilename35);
            const abs40 = path.join(absDir, outputFilename40);
            let exist35 = false, exist40 = false;
            try { await fs.access(abs35); exist35 = true; } catch { }
            try { await fs.access(abs40); exist40 = true; } catch { }
            if (exist35 && exist40) {
                if (SKIP_IF_EXISTS) {
                    await completeWithoutRender(stlRelativePath);
                    return;
                } else {
                    console.log(`[${new Date().toISOString()}] Overwriting existing files ${abs35} and ${abs40}`);
                    await fs.unlink(abs35);
                    await fs.unlink(abs40);
                }
            }

            // Render 3.5mm version
            console.log(`[${new Date().toISOString()}] Rendering Cable Clip 3.5mm for task ${taskId}...`);
            stlPathAbs = await renderCableClip(line1, 3.5, { fileName: outputFilename35, outputDir: absDir });

            // Render 4.0mm version
            console.log(`[${new Date().toISOString()}] Rendering Cable Clip 4.0mm for task ${taskId}...`);
            stlPathAbsSecondary = await renderCableClip(line1, 4.0, { fileName: outputFilename40, outputDir: absDir });
            const stlRelativePathSecondary = path.join(relativeDir, outputFilename40);
            console.log(`[${new Date().toISOString()}] Secondary Cable Clip (4.0mm) rendered for task ${taskId} -> ${stlRelativePathSecondary}`);

        } else {
            throw new Error(`Unsupported SKU for STL rendering: ${taskSku}`);
        }

        console.log(`[${new Date().toISOString()}] Primary STL rendered at ${stlPathAbs}`);
        if (stlPathAbsSecondary) {
            console.log(`[${new Date().toISOString()}] Secondary STL rendered at ${stlPathAbsSecondary}`);
        }

        // 5. Update database on success using raw SQL to bypass Prisma type issues
        // For cable clips, success means *both* renders completed. stlRelativePath holds the 3.5mm path.
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
        if (stlPathAbsSecondary) {
            console.log(`✓ Secondary STL path (not stored in DB): ${path.join(STL_OUTPUT_DIR_RELATIVE, path.basename(stlPathAbsSecondary))}`);
        }

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
        console.log(`✗ Failed to render STL for task ${taskId}. Retry ${nextRetries}/${MAX_RETRIES}. Marked as ${isOutOfRetries ? 'failed' : 'pending'}`);
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

// Track active in-flight tasks to respect the configured concurrency
let activeTasks = 0;

async function workerLoop() {

    // Function to handle a single iteration of the worker loop
    async function iteration() {
        console.log(`[${new Date().toISOString()}] Checking for pending STL render tasks...`);

        // Fix any invalid stl_render_state values at the start of each iteration
        await fixInvalidStlRenderStates();

        // Start new tasks until we hit the global concurrency limit
        while (activeTasks < CONCURRENCY) {
            const task = await reserveTask();
            if (!task) break;
            console.log(`[${new Date().toISOString()}] Found and reserved task ${task.id}, spinning up render (active ${activeTasks + 1}/${CONCURRENCY})`);
            activeTasks++;
            processTask(task)
                .catch(err => console.error(`[${new Date().toISOString()}] Uncaught error from processTask for task ${task.id}:`, err))
                .finally(() => { activeTasks--; });
        }
        console.log(`[${new Date().toISOString()}] Active tasks: ${activeTasks}/${CONCURRENCY}`);
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

/** Manual render of a specific task when script is run with --task=<ID> */
async function runManualTask(taskId: number) {
    console.log(`[${new Date().toISOString()}] Manual mode: rendering task ${taskId}`);
    const task = await prisma.printOrderTask.findUnique({
        where: { id: taskId },
        include: { product: true },
    });
    if (!task) {
        console.error(`[${new Date().toISOString()}] Task ${taskId} not found.`);
        process.exit(1);
    }

    try {
        await processTask(task as TaskWithProduct);
        console.log(`[${new Date().toISOString()}] Manual task ${taskId} completed.`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Manual task ${taskId} failed:`, err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// -------------------- Entry point --------------------
const manualFlag = process.argv.find(arg => arg.startsWith('--task='));
if (manualFlag) {
    const id = Number(manualFlag.split('=')[1]);
    if (Number.isNaN(id)) {
        console.error('Invalid --task value. Use --task=<numericId>');
        process.exit(1);
    }
    // Fire and forget (runManualTask handles process exit)
    runManualTask(id);
} else {
    // Start the continuous worker loop
    workerLoop().catch(e => {
        console.error(`[${new Date().toISOString()}] Worker loop failed during initial setup:`, e);
        process.exit(1);
    });
}
