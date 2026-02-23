import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { commandTypeLabels, useProjectCommands } from '../useProjectCommands'
import type { PackageInfo } from '../useProjectConfig'

// Helper to create a minimal composable instance for testing resolveProjectCommand
function createCommands(opts: {
  constructCommands?: Record<string, string[]>
  scripts?: Record<string, string>
  packageManager?: PackageInfo['packageManager']
  projectType?: string
  hasPackageInfo?: boolean
}) {
  const editorState = { rootPath: '/project' }

  const constructConfig = ref(
    opts.constructCommands
      ? { version: 1 as const, created: '', commands: opts.constructCommands }
      : null,
  )

  const packageInfo = ref<PackageInfo | null>(
    opts.hasPackageInfo !== false
      ? {
          name: 'test',
          scripts: opts.scripts || {},
          packageManager: opts.packageManager || 'npm',
        }
      : null,
  )

  const detectedProjectType = computed(() => opts.projectType || 'node')
  const toast = { add: () => {} } as unknown as Parameters<typeof useProjectCommands>[4]

  const { resolveProjectCommand } = useProjectCommands(
    editorState,
    constructConfig,
    packageInfo,
    detectedProjectType,
    toast,
  )

  return { resolveProjectCommand }
}

describe('commandTypeLabels', () => {
  it('has all 5 command types', () => {
    expect(Object.keys(commandTypeLabels)).toHaveLength(5)
    expect(commandTypeLabels.dev).toBe('Run')
    expect(commandTypeLabels.build).toBe('Build')
    expect(commandTypeLabels.install).toBe('Install')
    expect(commandTypeLabels.start).toBe('Start')
    expect(commandTypeLabels.test).toBe('Test')
  })
})

describe('resolveProjectCommand', () => {
  describe('Priority 1: construct config', () => {
    it('uses construct config command when available', () => {
      const { resolveProjectCommand } = createCommands({
        constructCommands: { dev: ['bun', 'run', 'dev'] },
        scripts: { dev: 'vite' },
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('bun')
      expect(cmd!.args).toEqual(['run', 'dev'])
      expect(cmd!.source).toBe('construct')
    })

    it('ignores empty construct config command', () => {
      const { resolveProjectCommand } = createCommands({
        constructCommands: { dev: [] },
        scripts: { dev: 'vite' },
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.source).not.toBe('construct')
    })
  })

  describe('Priority 2: package.json scripts', () => {
    it('finds dev script by name', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { dev: 'vite' },
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('npm')
      expect(cmd!.args).toEqual(['run', 'dev'])
      expect(cmd!.source).toBe('script')
    })

    it('falls back to start when dev not present', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { start: 'node index.js' },
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.args).toEqual(['run', 'start'])
    })

    it('falls back to serve when dev and start not present', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { serve: 'vue-cli serve' },
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.args).toEqual(['run', 'serve'])
    })

    it('uses correct package manager', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { dev: 'vite' },
        packageManager: 'bun',
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.command).toBe('bun')
    })

    it('finds build script', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { build: 'vite build' },
      })

      const cmd = resolveProjectCommand('build')
      expect(cmd!.args).toEqual(['run', 'build'])
    })

    it('finds test script', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: { test: 'vitest' },
      })

      const cmd = resolveProjectCommand('test')
      expect(cmd!.args).toEqual(['run', 'test'])
    })
  })

  describe('Priority 2: install command', () => {
    it('returns pm install for node projects', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: {},
        packageManager: 'bun',
      })

      const cmd = resolveProjectCommand('install')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('bun')
      expect(cmd!.args).toEqual(['install'])
    })

    it('returns pm install when packageInfo exists', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: {},
        packageManager: 'npm',
      })

      const cmd = resolveProjectCommand('install')
      expect(cmd!.command).toBe('npm')
      expect(cmd!.args).toEqual(['install'])
    })
  })

  describe('Priority 3: type-based fallback', () => {
    it('flutter dev → flutter run', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'flutter',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('flutter')
      expect(cmd!.args).toEqual(['run'])
      expect(cmd!.source).toBe('fallback')
    })

    it('flutter install → flutter pub get', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'flutter',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('install')
      expect(cmd!.command).toBe('flutter')
      expect(cmd!.args).toEqual(['pub', 'get'])
    })

    it('python dev → python main.py', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'python',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.command).toBe('python')
      expect(cmd!.args).toEqual(['main.py'])
    })

    it('rust dev → cargo run', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'rust',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.command).toBe('cargo')
      expect(cmd!.args).toEqual(['run'])
    })

    it('go dev → go run .', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'go',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd!.command).toBe('go')
      expect(cmd!.args).toEqual(['run', '.'])
    })

    it('html dev → sh -c serve script', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'html',
        hasPackageInfo: false,
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('sh')
      expect(cmd!.args[0]).toBe('-c')
      expect(cmd!.source).toBe('fallback')
    })
  })

  describe('Priority 4: last-resort fallback', () => {
    it('falls back to npm run dev when no script matches for node project', () => {
      const { resolveProjectCommand } = createCommands({
        scripts: {},
        projectType: 'node',
      })

      const cmd = resolveProjectCommand('dev')
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('npm')
      expect(cmd!.args).toEqual(['run', 'dev'])
      expect(cmd!.source).toBe('fallback')
    })
  })

  describe('null return', () => {
    it('returns null for unknown project type with no scripts and no packageInfo', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'unknown-type',
        hasPackageInfo: false,
      })

      expect(resolveProjectCommand('dev')).toBeNull()
    })

    it('returns null for build on unknown type with no packageInfo', () => {
      const { resolveProjectCommand } = createCommands({
        projectType: 'unknown-type',
        hasPackageInfo: false,
      })

      expect(resolveProjectCommand('build')).toBeNull()
    })
  })
})
