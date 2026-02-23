import { buildCodeDesignImplementationMessage, detectCodeFramework } from './spaceBehavior'

export interface CodeAssistantPayloadInput {
  userMessage: string
  designReferenceCount: number
  projectFilePaths: string[]
}

export interface CodeAssistantPayload {
  agentId: 'code-assistant'
  userMessage: string
  localDataPatch: {
    project_framework: string
  }
}

export function buildCodeAssistantPayload(input: CodeAssistantPayloadInput): CodeAssistantPayload {
  const framework = detectCodeFramework(input.projectFilePaths)
  const userMessage = buildCodeDesignImplementationMessage(
    input.userMessage,
    'code',
    input.designReferenceCount,
    framework,
  )

  return {
    agentId: 'code-assistant',
    userMessage,
    localDataPatch: {
      project_framework: framework,
    },
  }
}

export function isCodeRoute(path: string): boolean {
  return /\/app\/projects\/[^/]+\/code(?:\/|$)/.test(path)
}
