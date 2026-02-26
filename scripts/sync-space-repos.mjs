#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const configPath = path.join(repoRoot, 'space-repos.json')
const spacesRoot = path.resolve(repoRoot, 'src/spaces')

const ignoredNames = new Set(['.git', 'node_modules', 'dist', '.DS_Store'])

function assertSafeTarget(targetAbs) {
  if (!targetAbs.startsWith(spacesRoot + path.sep)) {
    throw new Error(`Refusing to write outside src/spaces: ${targetAbs}`)
  }
}

function copyDirectory(sourceAbs, targetAbs) {
  fs.cpSync(sourceAbs, targetAbs, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !ignoredNames.has(path.basename(sourcePath)),
  })
}

if (!fs.existsSync(configPath)) {
  console.error(`[spaces:sync] Missing config: ${configPath}`)
  process.exit(1)
}

const raw = fs.readFileSync(configPath, 'utf8')
const parsed = JSON.parse(raw)
const spaces = Array.isArray(parsed.spaces) ? parsed.spaces : []

if (spaces.length === 0) {
  console.log('[spaces:sync] No spaces configured')
  process.exit(0)
}

const warnings = []
const errors = []
let synced = 0

for (const space of spaces) {
  const name = space.name
  const repoPath = space.repoPath
  const targetPath = space.target
  const sourceSubdir = typeof space.sourceSubdir === 'string' ? space.sourceSubdir : '.'

  if (!name || !repoPath || !targetPath) {
    errors.push(`[spaces:sync] Invalid space entry: ${JSON.stringify(space)}`)
    continue
  }

  const sourceAbs = path.resolve(repoRoot, repoPath, sourceSubdir)
  const targetAbs = path.resolve(repoRoot, targetPath)

  if (!fs.existsSync(sourceAbs)) {
    warnings.push(`[spaces:sync] Skipping "${name}": repo not found at ${sourceAbs}`)
    continue
  }

  assertSafeTarget(targetAbs)

  fs.rmSync(targetAbs, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true })
  copyDirectory(sourceAbs, targetAbs)
  console.log(`[spaces:sync] ${name} <- ${path.relative(repoRoot, sourceAbs)}`)
  synced++
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error(err)
  }
  process.exit(1)
}

for (const warn of warnings) {
  console.warn(warn)
}

if (synced === 0 && warnings.length > 0) {
  console.log('[spaces:sync] No spaces synced (repos not found). App will run without spaces.')
} else {
  console.log(`[spaces:sync] Done (${synced}/${spaces.length} spaces synced)`)
}
