import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

import { globby } from 'globby';

import { logger } from '@/lib/shared/logging';

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  dryRun?: boolean;
  verbose?: boolean;
  includeBrowserCaches?: boolean;
  includeNodeModules?: boolean;
  includeExampleFiles?: boolean;
  includeLogFiles?: boolean;
  rootDir?: string;
  includeLegacyCode?: boolean;
}

/**
 * Result of cleanup operations
 */
export interface CleanupResult {
  success: boolean;
  filesRemoved: number;
  directoriesRemoved: number;
  errors: Array<{ path: string; error: Error }>;
}

/**
 * Main cleanup function that removes temporary files and build artifacts
 */
export async function cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
  const {
    dryRun = false,
    verbose = false,
    includeBrowserCaches = false,
    includeNodeModules = false,
    includeExampleFiles = false,
    includeLogFiles = true,
    rootDir = process.cwd(),
    includeLegacyCode = false,
  } = options;

  logger.info('Starting cleanup process...', { options });

  const result: CleanupResult = {
    success: true,
    filesRemoved: 0,
    directoriesRemoved: 0,
    errors: [],
  };

  // Define patterns to remove
  let patternsToRemove = [
    // Temp files
    'tmp',
    'temp',
    '*.tmp',
    '*.temp',
    '*.bak',
    '*.old',

    // Caches
    '.turbo',
    '.swc',
    '.ruff_cache',
    '.mypy_cache',
    '.pytest_cache',
    '__pycache__',
    '.qodo',

    // Build artifacts
    '.next',
    'build',
    'storybook-static',
    '*.tsbuildinfo',

    // IDE (except .vscode)
    '.idea',
    '*.sublime-*',
  ];

  // Conditionally add log files
  if (includeLogFiles) {
    patternsToRemove = [...patternsToRemove, 'logs', '*.log'];
  }

  // Conditionally add example files
  if (includeExampleFiles) {
    patternsToRemove = [...patternsToRemove, 'example*.jpg', 'example*.png', 'example*.json'];
  }

  // NEW: Conditionally add legacy code patterns
  if (includeLegacyCode) {
    patternsToRemove = [
      ...patternsToRemove,
      'y3dhub',
      'src/tests',
      'src/scripts/*.js',
      '!src/scripts/clean.ts',
      '!src/scripts/order-sync.ts',
      '!src/scripts/print-tasks.ts',
      '!src/scripts/utils.ts',
      'src/lib/*.js',
      '!src/lib/index.js',
      'src/components/*.js',
      '*.js', // project root .js files
    ];
  }

  // Find files matching patterns
  const files = await globby(patternsToRemove, {
    cwd: rootDir,
    dot: true,
    onlyFiles: false,
    absolute: true,
    ignore: ['node_modules/**'], // Always ignore node_modules content unless explicitly removing it
  });

  // Process browser caches if requested
  if (includeBrowserCaches) {
    const homeDirectory = homedir();
    const browserCachePaths = [
      join(homeDirectory, '.cache/ms-playwright'),
      join(homeDirectory, '.cache/puppeteer'),
      join(rootDir, '.playwright'),
      join(rootDir, 'playwright-report'),
      join(rootDir, 'test-results'),
    ];

    // Add existing browser cache paths to the files list
    for (const cachePath of browserCachePaths) {
      if (existsSync(cachePath)) {
        files.push(cachePath);
      }
    }
  }

  // Add node_modules if requested
  if (includeNodeModules && existsSync(join(rootDir, 'node_modules'))) {
    files.push(join(rootDir, 'node_modules'));
  }

  // Log what will be removed
  if (verbose || dryRun) {
    logger.info(`Found ${files.length} items to remove`);
    if (files.length > 0 && verbose) {
      logger.info('Items to remove:', { files });
    }
  }

  // Remove files
  for (const file of files) {
    try {
      if (!dryRun) {
        await rm(file, { recursive: true, force: true });

        // Determine if it's a file or directory for reporting
        if (file.includes('.') && !file.endsWith('/')) {
          result.filesRemoved++;
        } else {
          result.directoriesRemoved++;
        }
      }

      if (verbose) {
        logger.info(`${dryRun ? 'Would remove' : 'Removed'}: ${file}`);
      }
    } catch (error) {
      logger.error(`Failed to remove ${file}:`, error as unknown as Record<string, unknown>);
      result.errors.push({ path: file, error: error as Error });
      result.success = false;
    }
  }

  // Log summary
  const totalRemoved = result.filesRemoved + result.directoriesRemoved;
  logger.info(
    `Cleanup ${dryRun ? 'dry run' : 'completed'}: ${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} items ` +
      `(${result.filesRemoved} files, ${result.directoriesRemoved} directories)`
  );

  if (result.errors.length > 0) {
    logger.warn(`Encountered ${result.errors.length} errors during cleanup`);
  }

  return result;
}
