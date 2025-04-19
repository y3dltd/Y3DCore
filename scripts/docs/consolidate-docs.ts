#!/usr/bin/env tsx
/**
 * consolidate-docs.ts
 * -------------------------------------------------------------
 * One‑time migration helper that refactors the legacy Markdown /
 * text documentation hierarchy into the new structure proposed
 * in docs/ (guides/, reference/, integrations/, planning/, ops/).
 *
 * Usage:
 *   npx tsx scripts/docs/consolidate-docs.ts [--dry]
 *
 * ‑ Calculates a destination path for every *.md|*.txt file
 *   (except node_modules, .git, generated artefacts).
 * ‑ Moves content into the target path, creating directories.
 * ‑ Prepends standard YAML front‑matter if missing.
 * ‑ Leaves a short stub in the old location pointing to the
 *   new file (to preserve git history & backlinks).
 *
 * Safe to re‑run: skipped if a file already contains the
 *   `moved-to:` marker.
 */
import glob from 'fast-glob'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

//-------------------------------------------------------------
// CLI args
//-------------------------------------------------------------
const { argv } = yargs(hideBin(process.argv)).options({
    dry: { type: 'boolean', default: false, desc: 'Dry‑run: no writes' }
})

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

//-------------------------------------------------------------
// Helpers
//-------------------------------------------------------------
const FRONT_MATTER = (title: string) => `---\ntitle: ${title}\nlast-reviewed: ${new Date().toISOString().slice(0, 10)}\nmaintainer: TBD\n---\n\n`
const MOVED_MARKER = (to: string) => `<!-- moved-to: ${to} on ${new Date().toISOString().slice(0, 10)} -->\n`

const MANUAL_MAP: Record<string, string> = {
    // top‑level
    'README.md': 'docs/index.md',
    // guides
    'docs/DEVELOPMENT.md': 'docs/guides/development.md',
    'docs/TROUBLESHOOTING.md': 'docs/guides/troubleshooting.md',
    'docs/TESTING.md': 'docs/guides/testing.md',
    // reference
    'docs/API_REFERENCE.md': 'docs/reference/api.md',
    'docs/DATABASE.md': 'docs/reference/database.md',
    'docs/COMMAND_REFERENCE.md': 'docs/reference/commands.md',
    'docs/CODE_STRUCTURE.md': 'docs/reference/code-structure.md',
    'docs/linting-guide.md': 'docs/reference/linting.md',
    // integrations
    'docs/SHIPSTATION_SYNC.md': 'docs/integrations/shipstation.md',
    'docs/AMAZON-COLOR-PROCESSING.md': 'docs/integrations/amazon.md',
    'docs/EBAY.md': 'docs/integrations/ebay.md',
    // planning
    'docs/FUTURE_IMPROVEMENTS.md': 'docs/planning/roadmap.md',
    'docs/TODO.md': 'docs/planning/roadmap.md',
    'docs/recommendations.md': 'docs/planning/recommendations.md',
    // ops
    'docs/scripts/crontab.md': 'docs/ops/cron.md',
    '.netlify/edge-functions/___netlify-edge-handler-src-middleware/edge-runtime/README.md':
        'docs/ops/edge-runtime.md',
    '.vscode/README.md': 'docs/ops/vscode.md'
}

function autoPath(rel: string): string {
    // Fallback heuristic: unknown guides go to docs/guides/
    const base = path.basename(rel)
    return `docs/guides/${base}`
}

//-------------------------------------------------------------
// Main
//-------------------------------------------------------------
async function run(): Promise<void> {
    const patterns = ['**/*.md', '**/*.txt']
    const ignore = [
        'node_modules/**',
        '.git/**',
        'dist/**',
        '.next/**',
        'docs/**' // existing new docs stay put
    ]
    const entries = await glob(patterns, { cwd: ROOT, ignore, dot: true })

    for (const rel of entries) {
        const abs = path.join(ROOT, rel)

        // Skip if already migrated
        const content = await fs.readFile(abs, 'utf8')
        if (/moved-to:/i.test(content.split('\n')[0])) continue

        const destRel = MANUAL_MAP[rel] ?? autoPath(rel)
        const destAbs = path.join(ROOT, destRel)
        const destDir = path.dirname(destAbs)

        if (argv.dry) {
            console.log(`[dry] ${rel} -> ${destRel}`)
            continue
        }

        // Ensure destination dir exists
        await fs.mkdir(destDir, { recursive: true })

        // Ensure front‑matter exists at destination
        let newContent = content
        if (!content.trimStart().startsWith('---')) {
            const title = path.basename(destRel).replace(/\.[^.]+$/, '').replace(/-/g, ' ')
            newContent = FRONT_MATTER(title) + content
        }

        // If dest exists, append content (simple concat for now)
        let finalContent = newContent
        if (await fileExists(destAbs)) {
            const existing = await fs.readFile(destAbs, 'utf8')
            finalContent = mergeDocs(existing, newContent)
        }

        await fs.writeFile(destAbs, finalContent)

        // Write stub to original file
        await fs.writeFile(abs, MOVED_MARKER(destRel) + '\nThis page has moved. Please see the updated documentation.\n')

        console.log(`✔ moved ${rel} -> ${destRel}`)
    }
}

//-------------------------------------------------------------
// Utilities
//-------------------------------------------------------------
async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

function mergeDocs(existing: string, incoming: string): string {
    // Naïve merge: if incoming already present, skip; else append under HR
    if (existing.includes(incoming.trim())) return existing
    return existing.trimEnd() + '\n\n---\n<!-- merged -->\n\n' + incoming
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
}) 
