#!/usr/bin/env node
import { rm } from 'fs/promises';
import { join } from 'path';
import { globby } from 'globby';

async function cleanup() {
  const rootDir = process.cwd();
  
  const patternsToRemove = [
    // Temp files
    'tmp',
    'temp',
    '*.tmp',
    '*.temp',
    
    // Caches
    '.turbo',
    '.swc',
    '.ruff_cache',
    '.mypy_cache',
    '.pytest_cache',
    '__pycache__',
    
    // Build artifacts
    '.next',
    'storybook-static',
    '*.tsbuildinfo',
    
    // Logs
    'logs',
    '*.log',
    
    // IDE (except .vscode)
    '.idea',
    '*.sublime-*',
    '.qodo'
  ];

  const files = await globby(patternsToRemove, {
    cwd: rootDir,
    dot: true,
    onlyFiles: false,
    absolute: true
  });

  for (const file of files) {
    try {
      await rm(file, { recursive: true, force: true });
      console.log(`Removed: ${file}`);
    } catch (error) {
      console.error(`Failed to remove ${file}:`, error);
    }
  }
}

cleanup().catch(console.error);
