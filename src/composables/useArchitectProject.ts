/**
 * useArchitectProject - Project creation, feature saving, and template detection
 *
 * Extracted from useArchitectEngine to keep the engine focused on
 * question flow + AI calls + keyboard shortcuts.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { useProjectDirectory } from '@/composables/useProjectDirectory'
import { useArchitectKickoff, mapFrontendToTemplate, mapBackendToTemplate } from '@/composables/useArchitectKickoff'
import type { ArchitectPlan, DocumentType } from '@/utils/documentsGenerator'
import type { SpaceType } from '@/types/project'

interface ProjectDeps {
  plan: Ref<ArchitectPlan | null>
  answers: Ref<Record<string, string | string[]>>
  currentProject: ComputedRef<{ id: string; name: string; local_path?: string; spaces?: string[]; description?: string } | null>
  isInsideProject: ComputedRef<boolean>
  onReset: () => void
}

export function useArchitectProject(deps: ProjectDeps) {
  const router = useRouter()
  const toast = useToast()
  const {
    kickoff,
    generateSuggestedTasks,
    getDefaultDocuments,
    isKicking,
    progress: kickoffProgress,
    progressMessage,
  } = useArchitectKickoff()

  // ─── State ───

  const showProjectConfig = ref(false)
  const projectPath = ref('')
  const initGit = ref(true)

  // ─── Template Detection ───

  const isConstructSpace = computed(() => deps.plan.value?.type === 'construct-space' && !!deps.plan.value?.spaceId)

  const detectedTemplate = computed(() => {
    if (!deps.plan.value || isConstructSpace.value) return null
    const d = deps.plan.value.decisions
    const frontend = d?.frontend || d?.platform || d?.framework
    return typeof frontend === 'string' ? mapFrontendToTemplate(frontend) : null
  })

  const detectedBackendTemplate = computed(() => {
    if (!deps.plan.value || isConstructSpace.value) return null
    const d = deps.plan.value.decisions
    const backend = d?.backend || d?.server || d?.api
    return typeof backend === 'string' ? mapBackendToTemplate(backend) : null
  })

  const rawFrontendName = computed(() => {
    if (!deps.plan.value || isConstructSpace.value) return null
    const d = deps.plan.value.decisions
    const v = d?.frontend || d?.platform || d?.framework
    return typeof v === 'string' ? v : null
  })

  const rawBackendName = computed(() => {
    if (!deps.plan.value || isConstructSpace.value) return null
    const d = deps.plan.value.decisions
    const v = d?.backend || d?.server || d?.api
    return typeof v === 'string' ? v : null
  })

  const gitInSpaces = computed(() => {
    if (!deps.plan.value) return false
    const spaces = deps.plan.value.decisions?.spaces
    return Array.isArray(spaces) && spaces.some(s => String(s).toLowerCase() === 'git')
  })

  // ─── Helpers ───

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function normalizeSpaceForKickoff(space: string): string {
    const key = (space || '').trim().toLowerCase()
    if (key === 'tasks') return 'kanban'
    if (key === 'ui') return 'design'
    return key
  }

  function getSelectedSpacesForKickoff(currentPlan: ArchitectPlan): SpaceType[] {
    const raw = currentPlan.decisions?.spaces
    const values = Array.isArray(raw)
      ? raw.map(v => normalizeSpaceForKickoff(String(v))).filter(Boolean) as SpaceType[]
      : []
    return values.length > 0 ? Array.from(new Set(values)) as SpaceType[] : ['code']
  }

  function wantsComprehensiveDocs(currentPlan: ArchitectPlan): boolean {
    const answerText = Object.values(deps.answers.value)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const planText = [
      currentPlan.description || '',
      currentPlan.prd?.overview || '',
      currentPlan.prd?.techRationale || '',
      currentPlan.prd?.designNotes || '',
      ...(currentPlan.prd?.mvpScope || []),
      ...(currentPlan.prd?.futureConsiderations || []),
    ]
      .join(' ')
      .toLowerCase()

    const combined = `${answerText} ${planText}`
    return /\b(designer|design handoff|devops|product owner|full tasks?|task breakdown|delivery checklist|definition of done|milestones?|roadmap|setup guide|architecture doc|full documentation|comprehensive docs|when project ends)\b/i.test(combined)
  }

  function getSelectedDocsForKickoff(currentPlan: ArchitectPlan): DocumentType[] {
    const decisionEntries = Object.entries(deps.answers.value)
    const docsEntry = decisionEntries.find(([id]) => /docs?[_-]?(depth|type|level|scope|detail)/i.test(id))
    const docsDepthRaw = docsEntry?.[1]
    const docsDepth = typeof docsDepthRaw === 'string'
      ? docsDepthRaw.toLowerCase()
      : Array.isArray(docsDepthRaw)
        ? docsDepthRaw.join(' ').toLowerCase()
        : ''

    if (docsDepth.includes('full') || docsDepth.includes('comprehensive') || docsDepth.includes('complete')) {
      return ['prd', 'readme', 'architecture', 'roadmap', 'setup']
    } else if (docsDepth.includes('readme') && !docsDepth.includes('prd') && !docsDepth.includes('standard')) {
      return ['readme']
    }

    const selected = new Set<DocumentType>(['readme', 'prd', ...getDefaultDocuments(currentPlan)])
    if (wantsComprehensiveDocs(currentPlan)) {
      selected.add('architecture')
      selected.add('roadmap')
      selected.add('setup')
    }
    return Array.from(selected)
  }

  // ─── Actions ───

  async function showConfigStep() {
    if (!deps.plan.value || deps.isInsideProject.value || isKicking.value) return
    initGit.value = gitInSpaces.value
    const { getDefaultProjectsRoot } = useProjectDirectory()
    const defaultRoot = await getDefaultProjectsRoot()
    const name = deps.plan.value.name || 'New Project'
    projectPath.value = defaultRoot ? `${defaultRoot}/${slugify(name)}` : ''
    showProjectConfig.value = true
  }

  async function browseProjectDir() {
    const { openFolderDialog } = useProjectDirectory()
    const selected = await openFolderDialog('Select Project Location')
    if (selected) projectPath.value = selected
  }

  async function createProject() {
    if (!deps.plan.value || deps.isInsideProject.value || isKicking.value) return

    const currentPlan = deps.plan.value
    const spaces = getSelectedSpacesForKickoff(currentPlan)
    const documents = getSelectedDocsForKickoff(currentPlan)
    const tasks = generateSuggestedTasks(currentPlan)

    const isSpace = isConstructSpace.value
    const result = await kickoff(currentPlan, {
      name: currentPlan.name || 'New Project',
      description: currentPlan.description || currentPlan.prd?.overview || '',
      spaces,
      tasks,
      documents,
      localPath: projectPath.value || undefined,
      initGit: initGit.value,
      templateId: isSpace ? null : (detectedTemplate.value?.id || null),
      backendTemplateId: isSpace ? null : (detectedBackendTemplate.value?.id || null),
      isConstructSpace: isSpace,
      spaceId: currentPlan.spaceId,
    })

    if (result.success && result.project) {
      showProjectConfig.value = false
      router.push(`/app/projects/${result.project.id}`)
    }
  }

  async function saveFeaturePlan() {
    if (!deps.plan.value || !deps.currentProject.value) return

    try {
      const featureDoc = `# Feature: ${deps.plan.value.name}

## Overview
${deps.plan.value.prd?.overview || deps.plan.value.description}

## Decisions
${Object.entries(deps.plan.value.decisions || {}).map(([k, v]) => `- **${k}**: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}

## Components
${(deps.plan.value.prd?.coreFeatures || []).map(f => `- ${f}`).join('\n')}

## Rationale
${deps.plan.value.prd?.techRationale || 'See interview answers.'}

## MVP Scope
${(deps.plan.value.prd?.mvpScope || []).map(s => `- [ ] ${s}`).join('\n')}

## Future Enhancements
${(deps.plan.value.prd?.futureConsiderations || []).map(f => `- ${f}`).join('\n')}

---
*Generated by Construct Architect*
`
      const projPath = deps.currentProject.value.local_path
      if (projPath) {
        try {
          const tauriFs = await import('@tauri-apps/plugin-fs')
          const docsPath = `${projPath}/docs`
          const exists = await tauriFs.exists(docsPath)
          if (!exists) await tauriFs.mkdir(docsPath, { recursive: true })
          const filename = `feature-${slugify(deps.plan.value.name)}.md`
          await tauriFs.writeTextFile(`${docsPath}/${filename}`, featureDoc)
        } catch (e) {
          console.warn('[Architect] Failed to save feature doc locally:', e)
        }
      }

      toast.add({
        title: 'Feature Plan Saved',
        description: `"${deps.plan.value.name}" doc saved to ${deps.currentProject.value.name}`,
        color: 'success',
      })
      deps.onReset()
    } catch (e) {
      console.error('[Architect] Save feature error:', e)
      toast.add({ title: 'Error', description: 'Failed to save feature plan', color: 'error' })
    }
  }

  function resetProjectState() {
    showProjectConfig.value = false
    projectPath.value = ''
    initGit.value = true
  }

  return {
    // State
    showProjectConfig,
    projectPath,
    initGit,
    isKicking,
    kickoffProgress,
    progressMessage,

    // Template detection
    isConstructSpace,
    detectedTemplate,
    detectedBackendTemplate,
    rawFrontendName,
    rawBackendName,
    gitInSpaces,

    // Actions
    showConfigStep,
    browseProjectDir,
    createProject,
    saveFeaturePlan,
    resetProjectState,
  }
}
