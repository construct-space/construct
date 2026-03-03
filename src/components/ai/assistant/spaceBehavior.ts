export interface AgentRoutingInput {
  spaceContext: string
  userMessage: string
  hasImage: boolean
  designReferenceCount: number
}

export function isLikelyDesignIntent(text: string): boolean {
  const content = text.toLowerCase().trim()
  if (!content) return false
  const keywords = [
    'mobile version', 'desktop version', 'portrait', 'landscape',
    'screen', 'layout', 'ui', 'ux', 'redesign', 'wireframe',
    'convert to ui', 'create ui', 'make mobile', 'design'
  ]
  return keywords.some(k => content.includes(k))
}

export function resolveAssistantAgentId(input: AgentRoutingInput): string {
  const { spaceContext, userMessage, hasImage, designReferenceCount } = input
  const normalizedSpace = spaceContext.toLowerCase()
  const looksLikeDesignCommand = /\b(create|make|add|update|edit|style|color|layout|screen|button|icon|image|typography|spacing|align|canvas)\b/.test(userMessage.toLowerCase())

  const shouldUseDesignAgent = (
    designReferenceCount > 0
    || hasImage
    || isLikelyDesignIntent(userMessage)
    || ((normalizedSpace === 'design' || normalizedSpace === 'ui') && looksLikeDesignCommand)
  )

  switch (normalizedSpace) {
    // Code and terminal → code-assistant (has file/run tools)
    case 'code':
    case 'terminal':
      return 'code-assistant'

    // Design/UI → always use design agent (canvas context, design tools)
    case 'design':
    case 'ui':
      return 'design'

    // Project management
    case 'kanban':
      return 'kanban'

    // Version control
    case 'git':
      return 'git'

    // Documentation and notes both use docs agent
    case 'docs':
    case 'notes':
      return 'docs'

    // Calendar / scheduling
    case 'calendar':
      return 'calendar'

    // AI space and general chat → conductor (orchestrates everything)
    case 'ai':
    case 'chat':
      return 'conductor'

    // Architecture / planning space
    case 'architect':
      return 'planner'

    default:
      // Cross-space intent detection: design intent anywhere routes to design agent
      if (shouldUseDesignAgent) return 'design'
      // For any space with a custom agent, use the space name as agent ID
      if (normalizedSpace) return normalizedSpace
      // No space context: general-purpose chat agent
      return 'chat'
  }
}

export function detectCodeFramework(filePaths: string[]): string {
  const normalized = filePaths.map(p => p.toLowerCase())

  if (normalized.some(p => p.endsWith('/nuxt.config.ts') || p.endsWith('/nuxt.config.js') || p.includes('nuxt.config.'))) {
    return 'nuxt'
  }
  if (normalized.some(p => p.endsWith('/next.config.js') || p.endsWith('/next.config.mjs') || p.endsWith('/next.config.ts'))) {
    return 'next'
  }
  if (normalized.some(p => p.endsWith('/vite.config.ts') || p.endsWith('/vite.config.js'))) {
    return 'vite'
  }
  if (normalized.some(p => p.endsWith('/angular.json'))) {
    return 'angular'
  }
  if (normalized.some(p => p.endsWith('/pubspec.yaml'))) {
    return 'flutter'
  }
  if (normalized.some(p => p.endsWith('/go.mod'))) {
    return 'go'
  }
  if (normalized.some(p => p.endsWith('/cargo.toml'))) {
    return 'rust'
  }
  if (normalized.some(p => p.endsWith('/package.json'))) {
    return 'node'
  }

  return 'unknown'
}

export function buildCodeDesignImplementationMessage(
  userMessage: string,
  spaceContext: string,
  designReferenceCount: number,
  frameworkHint: string,
): string {
  if (spaceContext.toLowerCase() !== 'code' || designReferenceCount <= 0) {
    return userMessage
  }

  return `${userMessage}

[CODE IMPLEMENTATION MODE]
Implement the referenced @design directly in the current codebase.
Use existing project stack/framework (detected: ${frameworkHint}).
Create/modify real project files now; do not switch to canvas design actions.`
}
