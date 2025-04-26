"use strict";
// src/scripts/populate-print-queue-v2.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const commander_1 = require("commander");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../lib/order-processing-v2/logger");
const orchestrator_1 = require("../lib/order-processing-v2/orchestrator");
// Import a function to fix potential DB issues if needed, like in the original script
// import { fixInvalidStlRenderStatus } from '../lib/order-processing'; // Example path
// Load environment variables
dotenv_1.default.config();
const SCRIPT_NAME = 'populate-print-queue-v2';
async function main() {
    let prisma = null;
    let scriptRunSuccess = true;
    try {
        // --- Argument Parsing ---
        const program = new commander_1.Command();
        program
            .name(SCRIPT_NAME)
            .description('V2: Fetches orders, processes personalization via Amazon URL/AI, and creates print tasks.')
            .option('-o, --order-id <id>', 'Process specific order by DB ID, ShipStation Order Number, or ShipStation Order ID', String)
            .option('-l, --limit <number>', 'Limit number of orders fetched', val => parseInt(val, 10))
            .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
            .option('--openai-model <model>', 'OpenAI model', process.env.OPENAI_MODEL || 'gpt-4.1-mini') // Default model
            .option('--debug', 'Enable debug logging (overrides --log-level)', false)
            .option('--verbose', 'Alias for --debug', false) // Common alias
            .option('--log-level <level>', 'Set log level (debug, info, warn, error)', 'info')
            .option('-f, --force-recreate', 'Delete existing tasks for targeted orders first', false)
            .option('--create-placeholder', 'Create placeholder task on AI fail/no data', true)
            .option('-y, --confirm', 'Skip confirmation prompts (e.g., for --clear-all)', false)
            .option('--clear-all', 'Delete ALL tasks first (requires confirm)', false)
            .option('--dry-run', 'Simulate without making DB or ShipStation changes', false)
            .option('--preserve-text', 'Keep existing custom text/names when recreating tasks', false)
            .option('--shipstation-sync-only', 'Only sync existing DB tasks to ShipStation (Not fully implemented in V2 orchestrator yet)', // Mark as potentially not ready
        false)
            .option('--debug-file <path>', 'Path for detailed debug log file (requires --order-id)');
        // Manually handle potential --option=value format if commander struggles
        let directOrderId = undefined;
        for (let i = 0; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg.startsWith('--order-id=')) {
                directOrderId = arg.split('=')[1];
                break;
            }
            else if ((arg === '--order-id' || arg === '-o') && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
                directOrderId = process.argv[i + 1];
                break;
            }
        }
        program.parse(process.argv); // Use process.argv directly
        const cmdOptions = program.opts();
        // Apply manually extracted orderId if commander missed it
        if (!cmdOptions.orderId && directOrderId) {
            console.log(`Manually extracted --order-id: ${directOrderId}`);
            cmdOptions.orderId = directOrderId;
        }
        // Handle verbose alias
        if (cmdOptions.verbose) {
            cmdOptions.debug = true;
        }
        // --- Logger Initialization ---
        // Initialize logger early
        const loggerOptions = {
            logLevel: cmdOptions.debug ? 'debug' : cmdOptions.logLevel,
            verbose: cmdOptions.debug, // Pass debug flag as verbose
        };
        const logger = await (0, logger_1.initializeLogger)(loggerOptions, SCRIPT_NAME);
        logger.info(`--- Script Start: ${SCRIPT_NAME} ---`);
        logger.info('Parsed Options:', { ...cmdOptions, openaiApiKey: cmdOptions.openaiApiKey ? '***' : 'Not Set' });
        if (cmdOptions.dryRun)
            logger.warn('--- DRY RUN MODE ENABLED ---');
        // --- Validate Options ---
        if (!cmdOptions.openaiApiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or use --openai-api-key option.');
        }
        if (cmdOptions.debugFile && !cmdOptions.orderId) {
            logger.warn('--debug-file requires --order-id to be specified. Disabling file debug.');
            cmdOptions.debugFile = undefined;
        }
        if (cmdOptions.shipstationSyncOnly) {
            // TODO: Implement dedicated logic for shipstationSyncOnly mode if needed,
            // or remove the option if the main flow handles it sufficiently.
            logger.warn('--shipstation-sync-only mode is not fully implemented in the V2 orchestrator yet.');
            // For now, let it proceed, but the orchestrator might not behave as expected for this flag.
        }
        // --- Prisma Client Initialization ---
        logger.info('Connecting to database...');
        prisma = new client_1.PrismaClient();
        await prisma.$connect();
        logger.info('Database connected.');
        // --- Pre-run Operations (Optional) ---
        // Example: Fix invalid statuses before processing
        // try {
        //   const fixedCount = await fixInvalidStlRenderStatus(prisma);
        //   if (fixedCount > 0) {
        //     logger.info(`Fixed ${fixedCount} PrintOrderTask records with invalid stl_render_state values`);
        //   }
        // } catch (fixError) {
        //   logger.warn(`Unable to fix invalid StlRenderStatus values: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
        // }
        // TODO: Implement --clear-all logic if needed
        if (cmdOptions.clearAll) {
            logger.warn('--clear-all functionality not yet implemented in V2 script.');
            // Implement confirmation and deletion logic here if required
            // if (!cmdOptions.confirm && !(await confirmExecution(...))) { process.exit(0); }
            // if (cmdOptions.dryRun) { logger.info('[Dry Run] Would clear all tasks...'); }
            // else { await prisma.printOrderTask.deleteMany({}); logger.info('Cleared all tasks.'); }
        }
        // TODO: Implement --force-recreate logic if needed (likely within getOrdersToProcessV2 or orchestrator)
        if (cmdOptions.forceRecreate) {
            logger.warn('--force-recreate functionality needs careful implementation within the order fetching or processing logic.');
            // This might involve deleting tasks *before* calling runOrderProcessingV2
            // or passing the flag down and handling deletion within the transaction (carefully).
        }
        // --- Run Main Processing Logic ---
        // Cast cmdOptions to the specific type expected by the orchestrator
        const processingOptions = {
            // Spread all options parsed by commander
            ...cmdOptions,
            // Explicitly ensure required fields are present and correctly typed
            openaiApiKey: cmdOptions.openaiApiKey,
            openaiModel: cmdOptions.openaiModel,
            debug: !!cmdOptions.debug,
            verbose: !!cmdOptions.verbose,
            logLevel: cmdOptions.logLevel,
            createPlaceholder: cmdOptions.createPlaceholder !== false,
            // Prompts will be loaded within the orchestrator, pass placeholders
            systemPrompt: '',
            userPromptTemplate: '',
            // Optional fields are handled by the spread ...cmdOptions
        };
        await (0, orchestrator_1.runOrderProcessingV2)(processingOptions, prisma);
    }
    catch (error) {
        scriptRunSuccess = false;
        const logger = (0, logger_1.getLogger)(); // Get logger even if initialization failed partially
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[${SCRIPT_NAME}] CRITICAL ERROR: ${errorMsg}`, error);
        // Ensure final message reflects failure
    }
    finally {
        const logger = (0, logger_1.getLogger)(); // Get logger instance
        logger.info(`--- Script End: ${SCRIPT_NAME} ---`);
        if (prisma) {
            try {
                await prisma.$disconnect();
                logger.info('Database disconnected.');
            }
            catch (e) {
                logger.error('Error disconnecting database:', e);
            }
        }
        (0, logger_1.closeLogStream)(); // Close the file stream
        process.exit(scriptRunSuccess ? 0 : 1);
    }
}
// Execute main function
main().catch((error) => {
    // Catch unhandled promise rejections from main
    console.error(`[${SCRIPT_NAME}] Unhandled rejection in main:`, error);
    (0, logger_1.closeLogStream)(); // Attempt to close logs even on unhandled rejection
    process.exit(1);
});
