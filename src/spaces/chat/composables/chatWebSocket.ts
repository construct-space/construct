export type ChatWebSocketMode = 'generic' | 'legacy'

export interface ChatWebSocketUser {
  id: number
  firstName?: string
  lastName?: string
  email?: string
}

export interface ChatWebSocketCandidate {
  mode: ChatWebSocketMode
  url: string
}

interface BuildChatWebSocketCandidatesParams {
  apiBase: string
  roomId: number
  token: string
  user: ChatWebSocketUser
  preferredMode?: ChatWebSocketMode
}

interface ConnectChatWebSocketParams extends BuildChatWebSocketCandidatesParams {
  timeoutMs?: number
}

function getWebSocketBase(apiBase: string): string {
  if (apiBase.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  const base = apiBase.replace(/\/api\/?$/, '')
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`
  return base.replace(/^http/, 'ws')
}

export function buildChatWebSocketCandidates({
  apiBase,
  roomId,
  token,
  user,
  preferredMode = 'generic',
}: BuildChatWebSocketCandidatesParams): ChatWebSocketCandidate[] {
  const wsBase = getWebSocketBase(apiBase)
  const nickname = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User'

  // Include both generic room fields and legacy chat fields for backend compatibility.
  const params = new URLSearchParams({
    room: `chat:${roomId}`,
    id: String(user.id),
    nickname,
    token,
    room_id: String(roomId),
    user_id: String(user.id),
    first_name: user.firstName || '',
    last_name: user.lastName || '',
  })

  const genericUrl = `${wsBase}/api/ws?${params}`
  const legacyUrl = `${wsBase}/api/chat/ws?${params}`
  const orderedModes: ChatWebSocketMode[] = preferredMode === 'generic'
    ? ['generic', 'legacy']
    : ['legacy', 'generic']

  return orderedModes.map(mode => ({
    mode,
    url: mode === 'generic' ? genericUrl : legacyUrl,
  }))
}

export function tryOpenWebSocket(url: string, timeoutMs = 4000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.close()
      reject(new Error('timeout'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeout)
      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
    }

    socket.onopen = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(socket)
    }

    socket.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      socket.close()
      reject(new Error('error'))
    }

    socket.onclose = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('closed'))
    }
  })
}

export async function connectChatWebSocketWithFallback({
  timeoutMs = 4000,
  ...params
}: ConnectChatWebSocketParams): Promise<{ socket: WebSocket; mode: ChatWebSocketMode }> {
  const candidates = buildChatWebSocketCandidates(params)
  let lastError: Error | null = null
  for (const candidate of candidates) {
    try {
      const socket = await tryOpenWebSocket(candidate.url, timeoutMs)
      return { socket, mode: candidate.mode }
    } catch (error) {
      lastError = error as Error
    }
  }
  throw lastError || new Error('No WebSocket endpoints available')
}
