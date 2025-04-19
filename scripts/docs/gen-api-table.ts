#!/usr/bin/env tsx
/**
 * gen-api-table.ts
 * Generates a markdown table listing API route handlers and injects it into
 * docs/reference/api.md between special comment tags.
 */

import glob from 'fast-glob'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const API_DIR = path.join(ROOT, 'src', 'app', 'api')
const DOC_PATH = path.join(ROOT, 'docs', 'reference', 'api.md')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface Row {
  route: string
  methods: string
  file: string
}

const METHOD_RE = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\s*\(/g

function extractMethods(source: string): string[] {
  const methods = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = METHOD_RE.exec(source))) methods.add(m[1])
  return [...methods]
}

function normaliseRoute(absFile: string): string {
  // strip api dir and /route.ts suffix
  const rel = path.relative(API_DIR, absFile).replace(/\\/g, '/').replace(/\/route\.ts$/, '')
  const parts = rel.split('/')
  const transformed = parts.map((seg) => {
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const name = seg.slice(1, -1)
      return name.startsWith('...') ? `*${name.slice(3)}` : `:${name}`
    }
    return seg
  })
  return '/' + transformed.join('/')
}

function buildSkeleton(): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    '---',
    'title: API Reference',
    `last-reviewed: ${today}`,
    'maintainer: TBD',
    '---',
    '',
    '# REST API Reference',
    '',
    '> **Auto‑generated** – run `npm run docs:gen-api` to refresh this table.',
    '',
    '<!-- auto-table:start -->',
    '<!-- auto-table:end -->',
    ''
  ].join('\n')
}

async function ensureDocFile(): Promise<void> {
  try {
    await fs.access(DOC_PATH)
  } catch {
    await fs.mkdir(path.dirname(DOC_PATH), { recursive: true })
    await fs.writeFile(DOC_PATH, buildSkeleton())
  }
}

async function main(): Promise<void> {
  await ensureDocFile()
  const files = await glob('**/route.ts', { cwd: API_DIR, absolute: true })
  const rows: Row[] = []

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8')
    const methods = extractMethods(source)
    if (methods.length === 0) continue
    rows.push({
      route: normaliseRoute(file),
      methods: methods.join(', '),
      file: path.relative(ROOT, file)
    })
  }

  rows.sort((a, b) => a.route.localeCompare(b.route))

  const header = '| Path | Methods | File |\n| ---- | ------- | ---- |'
  const body = rows.map((r) => `| \`${r.route}\` | ${r.methods} | ${r.file} |`).join('\n')
  const table = `${header}\n${body}`

  const doc = await fs.readFile(DOC_PATH, 'utf8')
  const updated = doc.replace(
    /<!-- auto-table:start -->[\s\S]*?<!-- auto-table:end -->/m,
    `<!-- auto-table:start -->\n${table}\n<!-- auto-table:end -->`
  )

  await fs.writeFile(DOC_PATH, updated)
  console.log('API table generated ✓')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
}) 
