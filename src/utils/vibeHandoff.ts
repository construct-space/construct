import type { ArchitectPlan } from '@/utils/documentsGenerator'

export interface VibeHandoffDecision {
  id: string
  label: string
  value: string | string[]
}

export interface VibeHandoff {
  id: string
  source: 'architect' | 'project' | 'dashboard' | 'manual'
  description: string
  plan?: ArchitectPlan | null
  decisions?: VibeHandoffDecision[]
  projectId?: string
  createdAt: string
}

const VIBE_HANDOFF_PREFIX = 'construct:vibe:handoff:'

export function storeVibeHandoff(input: Omit<VibeHandoff, 'id' | 'createdAt'>): string {
  const handoff: VibeHandoff = {
    ...input,
    id: `vibe-handoff-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }

  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem(VIBE_HANDOFF_PREFIX + handoff.id, JSON.stringify(handoff))
  }

  return handoff.id
}

export function loadVibeHandoff(id: string | null | undefined): VibeHandoff | null {
  if (!id || typeof window === 'undefined' || !window.sessionStorage) return null

  const raw = window.sessionStorage.getItem(VIBE_HANDOFF_PREFIX + id)
  if (!raw) return null

  try {
    return JSON.parse(raw) as VibeHandoff
  } catch {
    return null
  }
}

export function summarizeVibeHandoff(handoff: VibeHandoff | null): string {
  if (!handoff) return ''

  const lines: string[] = []
  lines.push(`Vibe handoff source: ${handoff.source}`)
  lines.push(`Project brief: ${handoff.description}`)

  if (handoff.plan?.name) {
    lines.push(`Planned project: ${handoff.plan.name}`)
  }
  if (handoff.plan?.description) {
    lines.push(`Plan summary: ${handoff.plan.description}`)
  }
  const prd = handoff.plan?.docs?.prd || handoff.plan?.prd
  if (prd?.coreFeatures?.length) {
    lines.push(`Core features: ${prd.coreFeatures.slice(0, 8).join(', ')}`)
  }
  if (prd?.mvpScope?.length) {
    lines.push(`MVP scope: ${prd.mvpScope.slice(0, 8).join(', ')}`)
  }
  if (handoff.decisions?.length) {
    lines.push('Decisions:')
    for (const decision of handoff.decisions.slice(0, 12)) {
      const value = Array.isArray(decision.value) ? decision.value.join(', ') : decision.value
      lines.push(`- ${decision.label}: ${value}`)
    }
  }

  return lines.join('\n')
}

export function deriveVibeGoal(handoff: VibeHandoff | null, fallbackGoal = ''): string {
  if (handoff?.plan?.name) return `Build ${handoff.plan.name}`
  if (handoff?.description?.trim()) return handoff.description.trim()
  return fallbackGoal.trim()
}
