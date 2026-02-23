/**
 * Project configuration composable — loads .construct/project.json and package.json,
 * detects package manager.
 */
import { invoke } from '@tauri-apps/api/core'
import type { ConstructProjectConfig } from '../templates.config'

interface CodeEditorState {
  rootPath: string
}

export interface PackageInfo {
  name?: string
  scripts?: Record<string, string>
  packageManager?: 'bun' | 'npm' | 'yarn' | 'pnpm'
}

export function detectPackageManager(pkg: Record<string, unknown>): 'bun' | 'npm' | 'yarn' | 'pnpm' {
  if (pkg.packageManager) {
    const pm = String(pkg.packageManager)
    if (pm.startsWith('bun')) return 'bun'
    if (pm.startsWith('yarn')) return 'yarn'
    if (pm.startsWith('pnpm')) return 'pnpm'
  }
  return 'npm'
}

export function useProjectConfig(editorState: CodeEditorState) {
  const constructConfig = ref<ConstructProjectConfig | null>(null)
  const packageInfo = ref<PackageInfo | null>(null)

  const detectedPackageManager = computed(() => {
    return packageInfo.value?.packageManager || 'npm'
  })

  watch(() => editorState.rootPath, async (rootPath) => {
    if (!rootPath) {
      constructConfig.value = null
      packageInfo.value = null
      return
    }

    // Load .construct/project.json
    try {
      const configResult = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'cat',
        args: [`${rootPath}/.construct/project.json`],
        cwd: rootPath,
      })

      if (configResult.success && configResult.stdout) {
        constructConfig.value = JSON.parse(configResult.stdout)
        console.log('[Editor] Loaded .construct/project.json:', constructConfig.value)
      }
    } catch {
      console.log('[Editor] No .construct/project.json found, will use package.json fallback')
      constructConfig.value = null
    }

    // Load package.json
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'cat',
        args: [`${rootPath}/package.json`],
        cwd: rootPath,
      })

      if (result.success && result.stdout) {
        const pkg = JSON.parse(result.stdout)
        const scripts = pkg.scripts || {}
        const hasScripts = Object.keys(scripts).length > 0
        packageInfo.value = {
          name: pkg.name,
          scripts: hasScripts ? scripts : undefined,
          packageManager: detectPackageManager(pkg),
        }
      } else {
        console.log('[Editor] No package.json found')
        packageInfo.value = null
      }
    } catch {
      console.log('[Editor] Error reading package.json')
      packageInfo.value = null
    }
  }, { immediate: true })

  return {
    constructConfig,
    packageInfo,
    detectedPackageManager,
  }
}
