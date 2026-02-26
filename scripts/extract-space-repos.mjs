#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const repoRoot = process.cwd()
const configPath = path.join(repoRoot, 'space-repos.json')
const spacesRoot = path.resolve(repoRoot, 'src/spaces')
const ignoredNames = new Set(['.git', 'node_modules', 'dist', '.DS_Store'])

function assertSafeSource(sourceAbs) {
  if (!sourceAbs.startsWith(spacesRoot + path.sep)) {
    throw new Error(`Refusing to read outside src/spaces: ${sourceAbs}`)
  }
}

function copyDirectory(sourceAbs, targetAbs) {
  fs.cpSync(sourceAbs, targetAbs, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !ignoredNames.has(path.basename(sourcePath)),
  })
}

function ensureGitRepo(dir) {
  const gitDir = path.join(dir, '.git')
  if (fs.existsSync(gitDir)) return
  execSync('git init', { cwd: dir, stdio: 'ignore' })
}

if (!fs.existsSync(configPath)) {
  console.error(`[spaces:extract] Missing config: ${configPath}`)
  process.exit(1)
}

const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const spaces = Array.isArray(parsed.spaces) ? parsed.spaces : []

if (spaces.length === 0) {
  console.log('[spaces:extract] No spaces configured')
  process.exit(0)
}

for (const space of spaces) {
  const name = space.name
  const repoPath = space.repoPath
  const targetPath = space.target
  const sourceSubdir = typeof space.sourceSubdir === 'string' ? space.sourceSubdir : 'space'

  if (!name || !repoPath || !targetPath) {
    console.error(`[spaces:extract] Invalid space entry: ${JSON.stringify(space)}`)
    process.exit(1)
  }

  const sourceAbs = path.resolve(repoRoot, targetPath)
  const repoAbs = path.resolve(repoRoot, repoPath)
  const repoSourceAbs = path.join(repoAbs, sourceSubdir)

  if (!fs.existsSync(sourceAbs)) {
    console.warn(`[spaces:extract] Skipping ${name}, missing source: ${sourceAbs}`)
    continue
  }

  assertSafeSource(sourceAbs)
  fs.mkdirSync(repoAbs, { recursive: true })
  ensureGitRepo(repoAbs)

  for (const entry of fs.readdirSync(repoAbs)) {
    if (entry === '.git') continue
    fs.rmSync(path.join(repoAbs, entry), { recursive: true, force: true })
  }

  fs.mkdirSync(repoSourceAbs, { recursive: true })
  copyDirectory(sourceAbs, repoSourceAbs)

  const readmePath = path.join(repoAbs, 'README.md')
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# ${name} Space\n\nSource of truth for the \`${name}\` space used by Construct apps.\n`,
      'utf8',
    )
  }

  const gitignorePath = path.join(repoAbs, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'node_modules\ndist\n.DS_Store\n', 'utf8')
  }

  console.log(`[spaces:extract] ${name} -> ${path.relative(repoRoot, repoAbs)}`)
}

console.log('[spaces:extract] Done')
