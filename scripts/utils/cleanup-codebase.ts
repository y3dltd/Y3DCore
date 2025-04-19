#!/usr/bin/env tsx
/**
 * cleanup-codebase.ts
 * Helps clean up and reorganize the codebase by removing duplicates
 * and moving files to their proper locations.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

// Files to be removed (relative to project root)
const REMOVE_FILES = [
    'src/scripts/sync-orders.ts', // Duplicate of order-sync.ts
    'src/scripts/print-tasks.ts', // Replaced by populate-print-queue.ts
    'src/scripts/users.ts', // Consolidated into seed-test-user.ts
    'src/lib/utils.ts', // Moved to src/lib/utils/index.ts
    'src/scripts/manualprompt2.txt',
    'src/scripts/prompt-system-optimized.txt',
    'src/scripts/prompt-user-template-optimized.txt'
]

// Files to be moved (from -> to, relative to project root)
const MOVE_FILES = [
    {
        from: 'src/lib/order-utils.ts',
        to: 'src/lib/orders/utils.ts'
    },
    {
        from: 'src/lib/order-processing.ts',
        to: 'src/lib/orders/processing.ts'
    },
    {
        from: 'src/lib/auth.ts',
        to: 'src/lib/auth/index.ts'
    }
]

// Directories to be created
const CREATE_DIRS = [
    'src/lib/ai/prompts',
    'src/lib/orders/utils',
    'src/lib/orders/processing'
]

interface Args {
    dryRun: boolean
    verbose: boolean
}

const argv = yargs(hideBin(process.argv))
    .option('dry-run', {
        alias: 'd',
        type: 'boolean',
        description: 'Show what would be done without making changes',
        default: false
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Show detailed output',
        default: false
    })
    .help()
    .parseSync() as Args

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

async function run() {
    // Create directories
    for (const dir of CREATE_DIRS) {
        const dirPath = path.join(ROOT, dir)
        if (argv.verbose) {
            console.log(`Creating directory: ${dir}`)
        }
        if (!argv.dryRun) {
            await fs.mkdir(dirPath, { recursive: true })
        }
    }

    // Remove files
    for (const file of REMOVE_FILES) {
        const filePath = path.join(ROOT, file)
        if (await fileExists(filePath)) {
            if (argv.verbose || argv.dryRun) {
                console.log(`${argv.dryRun ? '[DRY RUN] Would remove' : 'Removing'}: ${file}`)
            }
            if (!argv.dryRun) {
                await fs.unlink(filePath)
            }
        } else if (argv.verbose) {
            console.log(`File already removed: ${file}`)
        }
    }

    // Move files
    for (const { from, to } of MOVE_FILES) {
        const fromPath = path.join(ROOT, from)
        const toPath = path.join(ROOT, to)

        if (await fileExists(fromPath)) {
            if (argv.verbose || argv.dryRun) {
                console.log(`${argv.dryRun ? '[DRY RUN] Would move' : 'Moving'}: ${from} -> ${to}`)
            }
            if (!argv.dryRun) {
                await fs.mkdir(path.dirname(toPath), { recursive: true })
                await fs.rename(fromPath, toPath)
            }
        } else if (argv.verbose) {
            console.log(`Source file not found: ${from}`)
        }
    }

    console.log('\nCleanup complete!')
    if (argv.dryRun) {
        console.log('This was a dry run. No changes were made.')
    }
}

run().catch(error => {
    console.error('Error during cleanup:', error)
    process.exit(1)
}) 
