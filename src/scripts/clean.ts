#!/usr/bin/env tsx
/**
 * Script: clean.ts
 * Description: Unified cleanup utility for the Y3DHub project
 * Usage: npx tsx src/scripts/clean.ts [options]
 */

import { program } from 'commander';

import { logger } from '@/lib/shared/logging';
import { cleanup, CleanupOptions } from '@/lib/utils/cleanup';

program
  .name('clean')
  .description('Clean up project files and directories')
  .option('-d, --dry-run', 'Show what would be removed without actually removing', false)
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('-b, --browser-caches', 'Include browser caches', false)
  .option('-n, --node-modules', 'Include node_modules directory', false)
  .option('-e, --example-files', 'Include example files', false)
  .option('-l, --no-logs', 'Skip log files', true)
  .option('--dir <directory>', 'Root directory to clean (default: current directory)')
  .option(
    '--legacy',
    'Remove old/legacy code and directories (y3dhub/, src/tests/, *.js, etc.)',
    false
  )
  .parse(process.argv);

const options = program.opts();

async function main(): Promise<void> {
  try {
    logger.info('Starting cleanup process with options:', options);

    const cleanupOptions: CleanupOptions = {
      dryRun: options.dryRun,
      verbose: options.verbose,
      includeBrowserCaches: options.browserCaches,
      includeNodeModules: options.nodeModules,
      includeExampleFiles: options.exampleFiles,
      includeLogFiles: options.logs !== false, // Handle --no-logs option
      rootDir: options.dir,
      includeLegacyCode: options.legacy,
    };

    const result = await cleanup(cleanupOptions);

    if (result.success) {
      logger.info('Cleanup completed successfully');
      if (options.dryRun) {
        logger.info('This was a dry run. No files were actually removed.');
        logger.info('Run without --dry-run to perform the actual cleanup.');
      }
    } else {
      logger.warn(`Cleanup completed with ${result.errors.length} errors`);
      if (options.verbose) {
        logger.error('Errors:', { errors: result.errors });
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error('Unhandled error during cleanup:', error as unknown as Record<string, unknown>);
    process.exit(1);
  }
}

main();
