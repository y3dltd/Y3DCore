#!/usr/bin/env tsx
/**
 * gen-commands-table.ts
 * -------------------------------------------------------------
 * Scans `src/scripts/*.ts` for CLI definitions and injects a
 * markdown table into docs/reference/commands.md between
 * `<!-- auto-table:start -->` and `<!-- auto-table:end -->`.
 *
 * Heuristic parsing – looks for either:
 *   program.description('...') (commander)
 *   .option or .command lines after yargs() builder
 */

import glob from 'fast-glob'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCRIPTS_DIR = path.join(ROOT, 'src', 'scripts')
const DOC_FILE = path.join(ROOT, 'docs', 'reference', 'commands.md')

interface Row { cmd: string; desc: string; file: string }

function extractInfo(content: string, file: string): Row | null {
    // commander: program.description('text')
    const descMatch = content.match(/\.description\((['"`])([\s\S]*?)\1\)/)
    const yargsCmdMatch = content.match(/\.command\((['"`])(.*?)\1[\s,]*([\s\S]*?)\)/)

    // Determine command alias (npm script if present)
    const cmd = `npx tsx ${path.relative(ROOT, file).replace(/\\/g, '/')}`

    let desc = ''
    if (yargsCmdMatch) {
        // description could be second arg or within builder
        const maybeDesc = yargsCmdMatch[3].trim()
        if (maybeDesc && maybeDesc.length < 120) desc = maybeDesc.replace(/^[,\s]+|[\s]+$/g, '')
    }
    if (!desc && descMatch) desc = descMatch[2].trim()

    if (!desc) return null
    return { cmd, desc, file: path.relative(ROOT, file) }
}

async function main() {
    const files = await glob('*.ts', { cwd: SCRIPTS_DIR, absolute: true })
    const rows: Row[] = []
    for (const f of files) {
        const content = await fs.readFile(f, 'utf8')
        const info = extractInfo(content, f)
        if (info) rows.push(info)
    }

    // Build markdown table
    const header = '| Command | Description | Script Path |\n| --- | --- | --- |'
    const body = rows
        .sort((a, b) => a.cmd.localeCompare(b.cmd))
        .map((r) => `| \`${r.cmd}\` | ${r.desc} | ${r.file} |`)
        .join('\n')
    const table = `${header}\n${body}`

    // Inject into doc
    const doc = await fs.readFile(DOC_FILE, 'utf8')
    const updated = doc.replace(
        /<!-- auto-table:start -->([\s\S]*?)<!-- auto-table:end -->/m,
        `<!-- auto-table:start -->\n${table}\n<!-- auto-table:end -->`
    )

    await fs.writeFile(DOC_FILE, updated)
    console.log('Commands table generated ✓')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
}) 
