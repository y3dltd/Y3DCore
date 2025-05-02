#!/usr/bin/env tsx
"use strict";
/**
 * Script: clean.ts
 * Description: Unified cleanup utility for the Y3DHub project
 * Usage: npx tsx src/scripts/clean.ts [options]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const logging_1 = require("@/lib/shared/logging");
const cleanup_1 = require("@/lib/utils/cleanup");
commander_1.program
    .name('clean')
    .description('Clean up project files and directories')
    .option('-d, --dry-run', 'Show what would be removed without actually removing', false)
    .option('-v, --verbose', 'Show detailed logs', false)
    .option('-b, --browser-caches', 'Include browser caches', false)
    .option('-n, --node-modules', 'Include node_modules directory', false)
    .option('-e, --example-files', 'Include example files', false)
    .option('-l, --no-logs', 'Skip log files', true)
    .option('--dir <directory>', 'Root directory to clean (default: current directory)')
    .option('--legacy', 'Remove old/legacy code and directories (y3dhub/, src/tests/, *.js, etc.)', false)
    .parse(process.argv);
const options = commander_1.program.opts();
async function main() {
    try {
        logging_1.logger.info('Starting cleanup process with options:', options);
        const cleanupOptions = {
            dryRun: options.dryRun,
            verbose: options.verbose,
            includeBrowserCaches: options.browserCaches,
            includeNodeModules: options.nodeModules,
            includeExampleFiles: options.exampleFiles,
            includeLogFiles: options.logs !== false,
            rootDir: options.dir,
            includeLegacyCode: options.legacy,
        };
        const result = await (0, cleanup_1.cleanup)(cleanupOptions);
        if (result.success) {
            logging_1.logger.info('Cleanup completed successfully');
            if (options.dryRun) {
                logging_1.logger.info('This was a dry run. No files were actually removed.');
                logging_1.logger.info('Run without --dry-run to perform the actual cleanup.');
            }
        }
        else {
            logging_1.logger.warn(`Cleanup completed with ${result.errors.length} errors`);
            if (options.verbose) {
                logging_1.logger.error('Errors:', { errors: result.errors });
            }
        }
        process.exit(result.success ? 0 : 1);
    }
    catch (error) {
        logging_1.logger.error('Unhandled error during cleanup:', error);
        process.exit(1);
    }
}
main();
