"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanup = void 0;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const globby_1 = require("globby");
const logging_1 = require("@/lib/shared/logging");
/**
 * Main cleanup function that removes temporary files and build artifacts
 */
async function cleanup(options = {}) {
    const { dryRun = false, verbose = false, includeBrowserCaches = false, includeNodeModules = false, includeExampleFiles = false, includeLogFiles = true, rootDir = process.cwd(), includeLegacyCode = false, } = options;
    logging_1.logger.info('Starting cleanup process...', { options });
    const result = {
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
    const files = await (0, globby_1.globby)(patternsToRemove, {
        cwd: rootDir,
        dot: true,
        onlyFiles: false,
        absolute: true,
        ignore: ['node_modules/**'], // Always ignore node_modules content unless explicitly removing it
    });
    // Process browser caches if requested
    if (includeBrowserCaches) {
        const homeDirectory = (0, os_1.homedir)();
        const browserCachePaths = [
            (0, path_1.join)(homeDirectory, '.cache/ms-playwright'),
            (0, path_1.join)(homeDirectory, '.cache/puppeteer'),
            (0, path_1.join)(rootDir, '.playwright'),
            (0, path_1.join)(rootDir, 'playwright-report'),
            (0, path_1.join)(rootDir, 'test-results'),
        ];
        // Add existing browser cache paths to the files list
        for (const cachePath of browserCachePaths) {
            if ((0, fs_1.existsSync)(cachePath)) {
                files.push(cachePath);
            }
        }
    }
    // Add node_modules if requested
    if (includeNodeModules && (0, fs_1.existsSync)((0, path_1.join)(rootDir, 'node_modules'))) {
        files.push((0, path_1.join)(rootDir, 'node_modules'));
    }
    // Log what will be removed
    if (verbose || dryRun) {
        logging_1.logger.info(`Found ${files.length} items to remove`);
        if (files.length > 0 && verbose) {
            logging_1.logger.info('Items to remove:', { files });
        }
    }
    // Remove files
    for (const file of files) {
        try {
            if (!dryRun) {
                await (0, promises_1.rm)(file, { recursive: true, force: true });
                // Determine if it's a file or directory for reporting
                if (file.includes('.') && !file.endsWith('/')) {
                    result.filesRemoved++;
                }
                else {
                    result.directoriesRemoved++;
                }
            }
            if (verbose) {
                logging_1.logger.info(`${dryRun ? 'Would remove' : 'Removed'}: ${file}`);
            }
        }
        catch (error) {
            logging_1.logger.error(`Failed to remove ${file}:`, error);
            result.errors.push({ path: file, error: error });
            result.success = false;
        }
    }
    // Log summary
    const totalRemoved = result.filesRemoved + result.directoriesRemoved;
    logging_1.logger.info(`Cleanup ${dryRun ? 'dry run' : 'completed'}: ${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} items ` +
        `(${result.filesRemoved} files, ${result.directoriesRemoved} directories)`);
    if (result.errors.length > 0) {
        logging_1.logger.warn(`Encountered ${result.errors.length} errors during cleanup`);
    }
    return result;
}
exports.cleanup = cleanup;
