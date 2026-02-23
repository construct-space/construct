/**
 * Project commands composable — resolve and run project commands (dev, build, install, test, start).
 * Priority: .construct/project.json → package.json scripts → type-based fallback.
 */
import { invoke } from '@tauri-apps/api/core'
import type { ConstructProjectConfig } from '../templates.config'
import type { PackageInfo } from './useProjectConfig'
import { buildStaticHtmlServeCommand } from './useStaticHtmlServer'

export type CommandType = 'dev' | 'build' | 'install' | 'start' | 'test'
type ResolvedCommandSource = 'construct' | 'script' | 'fallback'

export interface ResolvedCommand {
  command: string
  args: string[]
  label: string
  source: ResolvedCommandSource
}

const scriptPriority: Record<CommandType, string[]> = {
  dev: ['dev', 'start', 'serve'],
  build: ['build'],
  install: [],
  start: ['start', 'preview'],
  test: ['test'],
}

const fallbackScriptName: Record<Exclude<CommandType, 'install'>, string> = {
  dev: 'dev',
  build: 'build',
  start: 'start',
  test: 'test',
}

export const commandTypeLabels: Record<CommandType, string> = {
  dev: 'Run',
  build: 'Build',
  install: 'Install',
  start: 'Start',
  test: 'Test',
}

interface CodeEditorState {
  rootPath: string
}

export function useProjectCommands(
  editorState: CodeEditorState,
  constructConfig: Ref<ConstructProjectConfig | null>,
  packageInfo: Ref<PackageInfo | null>,
  detectedProjectType: ComputedRef<string>,
  toast: ReturnType<typeof useToast>,
) {
  const resolveProjectCommand = (type: CommandType): ResolvedCommand | null => {
    // 1) Explicit project command from .construct/project.json
    const configured = constructConfig.value?.commands?.[type]
    if (configured && configured.length > 0 && configured[0]) {
      return {
        command: configured[0],
        args: configured.slice(1),
        label: commandTypeLabels[type],
        source: 'construct',
      }
    }

    // 2) package.json script resolution
    const pm = packageInfo.value?.packageManager || 'npm'
    const scripts = packageInfo.value?.scripts || {}

    if (type === 'install' && (packageInfo.value || ['nuxt', 'bun', 'node'].includes(detectedProjectType.value))) {
      return {
        command: pm,
        args: ['install'],
        label: 'Install',
        source: 'script',
      }
    }

    const preferredScript = scriptPriority[type].find(script => Boolean(scripts[script]))
    if (preferredScript) {
      return {
        command: pm,
        args: ['run', preferredScript],
        label: commandTypeLabels[type],
        source: 'script',
      }
    }

    // 3) Type-based fallback for non-script projects
    switch (detectedProjectType.value) {
      case 'flutter': {
        if (type === 'install') return { command: 'flutter', args: ['pub', 'get'], label: 'Flutter Install', source: 'fallback' }
        if (type === 'build') return { command: 'flutter', args: ['build', 'apk'], label: 'Flutter Build', source: 'fallback' }
        if (type === 'dev' || type === 'start') return { command: 'flutter', args: ['run'], label: 'Flutter Run', source: 'fallback' }
        if (type === 'test') return { command: 'flutter', args: ['test'], label: 'Flutter Test', source: 'fallback' }
        break
      }
      case 'python': {
        if (type === 'install') return { command: 'pip', args: ['install', '-r', 'requirements.txt'], label: 'Python Install', source: 'fallback' }
        if (type === 'dev' || type === 'start') return { command: 'python', args: ['main.py'], label: 'Python Run', source: 'fallback' }
        if (type === 'test') return { command: 'pytest', args: [], label: 'Python Test', source: 'fallback' }
        break
      }
      case 'rust': {
        if (type === 'build') return { command: 'cargo', args: ['build'], label: 'Cargo Build', source: 'fallback' }
        if (type === 'dev' || type === 'start') return { command: 'cargo', args: ['run'], label: 'Cargo Run', source: 'fallback' }
        if (type === 'test') return { command: 'cargo', args: ['test'], label: 'Cargo Test', source: 'fallback' }
        break
      }
      case 'go': {
        if (type === 'install') return { command: 'go', args: ['mod', 'tidy'], label: 'Go Mod Tidy', source: 'fallback' }
        if (type === 'build') return { command: 'go', args: ['build', '.'], label: 'Go Build', source: 'fallback' }
        if (type === 'dev' || type === 'start') return { command: 'go', args: ['run', '.'], label: 'Go Run', source: 'fallback' }
        if (type === 'test') return { command: 'go', args: ['test', './...'], label: 'Go Test', source: 'fallback' }
        break
      }
      case 'html': {
        if (type === 'dev' || type === 'start') {
          const [command, ...args] = buildStaticHtmlServeCommand()
          return {
            command: command || 'sh',
            args,
            label: 'HTML Server',
            source: 'fallback',
          }
        }
        break
      }
      default:
        break
    }

    // 4) Last-resort script command
    if (type !== 'install' && (packageInfo.value || ['nuxt', 'bun', 'node'].includes(detectedProjectType.value))) {
      const fallbackScript = fallbackScriptName[type]
      return {
        command: pm,
        args: ['run', fallbackScript],
        label: commandTypeLabels[type],
        source: 'fallback',
      }
    }

    return null
  }

  const runCommand = async (
    type: Exclude<CommandType, 'dev'>,
    successMsg?: string,
    quickCommandOutput?: Ref<string>,
    showTerminalPanel?: Ref<boolean>,
    activeTab?: Ref<string>,
  ) => {
    if (!editorState.rootPath) return

    const resolved = resolveProjectCommand(type)
    if (!resolved) {
      toast.add({
        title: `No ${type} command found`,
        description: `Add a "${type}" command in .construct/project.json or package.json scripts.`,
        color: 'warning',
      })
      return
    }

    if (showTerminalPanel) showTerminalPanel.value = true
    if (activeTab) activeTab.value = 'output'
    if (quickCommandOutput) quickCommandOutput.value = `Running ${resolved.command} ${resolved.args.join(' ')}...\n`

    try {
      const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
        command: resolved.command,
        args: resolved.args,
        cwd: editorState.rootPath,
      })

      if (quickCommandOutput) {
        quickCommandOutput.value += result.stdout || ''
        if (result.stderr) quickCommandOutput.value += `\n${result.stderr}`
      }

      if (result.success) {
        if (successMsg) {
          toast.add({ title: successMsg, color: 'success' })
        }
      } else {
        toast.add({
          title: `${commandTypeLabels[type]} failed`,
          description: result.stderr?.slice(0, 100) || 'Unknown error',
          color: 'error',
        })
      }
    } catch (e) {
      if (quickCommandOutput) quickCommandOutput.value += `\nError: ${e}`
      toast.add({
        title: `${commandTypeLabels[type]} failed`,
        description: String(e),
        color: 'error',
      })
    }
  }

  const runBuild = (quickCommandOutput?: Ref<string>, showTerminalPanel?: Ref<boolean>, activeTab?: Ref<string>) =>
    runCommand('build', 'Build complete', quickCommandOutput, showTerminalPanel, activeTab)

  const runInstall = (quickCommandOutput?: Ref<string>, showTerminalPanel?: Ref<boolean>, activeTab?: Ref<string>) =>
    runCommand('install', 'Install complete', quickCommandOutput, showTerminalPanel, activeTab)

  return {
    resolveProjectCommand,
    runCommand,
    runBuild,
    runInstall,
  }
}
