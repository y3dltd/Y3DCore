#!/usr/bin/env tsx
/**
 * Script: clean-unused-files.ts
 * Description: Removes unused files identified by knip
 * Usage: npx tsx src/scripts/clean-unused-files.ts
 */

import { readFileSync, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, relative } from 'path';

import { logger } from '@/lib/shared/logging';

// Get the project root directory
const projectRoot = process.cwd();

// Read the list of unused files
const unusedFilesPath = '/tmp/unused-files/unused-files.txt';
const unusedFilesContent = readFileSync(unusedFilesPath, 'utf-8');
const unusedFiles = unusedFilesContent
  .split('\n')
  .filter(line => line.trim() && !line.startsWith('#'))
  .map(file => join(projectRoot, file.trim()));

// Remove the unused files
async function removeUnusedFiles() {
  logger.info(`Found ${unusedFiles.length} unused files to remove`);
  
  let removedCount = 0;
  let errorCount = 0;
  let notFoundCount = 0;
  
  for (const file of unusedFiles) {
    try {
      if (existsSync(file)) {
        await unlink(file);
        logger.info(`Removed: ${relative(projectRoot, file)}`);
        removedCount++;
      } else {
        logger.warn(`File not found: ${relative(projectRoot, file)}`);
        notFoundCount++;
      }
    } catch (error) {
      logger.error(`Error removing ${relative(projectRoot, file)}:`, error as Record<string, unknown>);
      errorCount++;
    }
  }
  
  logger.info(`Removed ${removedCount} unused files`);
  if (notFoundCount > 0) {
    logger.warn(`${notFoundCount} files were not found`);
  }
  if (errorCount > 0) {
    logger.warn(`Encountered ${errorCount} errors during removal`);
  }
}

removeUnusedFiles().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
