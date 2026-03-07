import { appConfig } from '@/utils/config'
import { isTauriEnv } from '@/utils/tauri'
import { info, error as logError } from '@tauri-apps/plugin-log'

const OAUTH_STATE_KEY = 'construct_oauth_state'
const OAUTH_VERIFIER_KEY = 'construct_oauth_verifier'
const OAUTH_STATE_KEY_PERSIST = 'construct_oauth_state_persist'
const OAUTH_VERIFIER_KEY_PERSIST = 'construct_oauth_verifier_persist'

function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getRedirectUri(): string {
  if (isTauriEnv()) {
    return 'construct://oauth/callback'
  }
  return `${window.location.origin}/oauth/callback`
}

/** Close the OAuth login window if it exists */
function closeOAuthWindow() {
  if (!isTauriEnv()) return
  import('@tauri-apps/api/webviewWindow').then(async ({ WebviewWindow }) => {
    const win = await WebviewWindow.getByLabel('oauth-login')
    if (win) win.close()
  }).catch(() => {})
}

export function useConstructAuth() {
  const accountsUrl = appConfig.accountsUrl
  const clientId = appConfig.oauthClientId

  async function startLogin() {
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, codeVerifier)
    localStorage.setItem(OAUTH_STATE_KEY_PERSIST, state)
    localStorage.setItem(OAUTH_VERIFIER_KEY_PERSIST, codeVerifier)

    const redirectUri = getRedirectUri()
    info(`[OAuth] startLogin — redirect_uri: ${redirectUri}, client_id: ${clientId}, state: ${state.slice(0, 8)}...`)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    const authorizeUrl = `${accountsUrl}/oauth/authorize?${params.toString()}`

    if (isTauriEnv()) {
      // Open in system browser — deep link (construct://oauth/callback) brings user back
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(authorizeUrl)
      }).catch(() => {
        window.open(authorizeUrl, '_blank')
      })
    } else {
      window.location.href = authorizeUrl
    }
  }

  function getRegisterUrl(): string {
    return `${accountsUrl}/register`
  }

  function getForgotPasswordUrl(): string {
    return `${accountsUrl}/forgot-password`
  }

  function validateState(state: string): boolean {
    const stored = sessionStorage.getItem(OAUTH_STATE_KEY) || localStorage.getItem(OAUTH_STATE_KEY_PERSIST)
    if (stored === state) {
      sessionStorage.removeItem(OAUTH_STATE_KEY)
      localStorage.removeItem(OAUTH_STATE_KEY_PERSIST)
      return true
    }
    return false
  }

  async function exchangeCode(code: string): Promise<{ access_token: string; oauth_token?: string }> {
    const redirectUri = getRedirectUri()
    const codeVerifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY)
      || localStorage.getItem(OAUTH_VERIFIER_KEY_PERSIST)
      || ''

    info(`[OAuth] exchangeCode — redirect_uri: ${redirectUri}, verifier present: ${!!codeVerifier}, length: ${codeVerifier.length}, client_id: ${clientId}`)
    console.log('[OAuth] exchangeCode — redirect_uri:', redirectUri, 'verifier:', !!codeVerifier, 'length:', codeVerifier.length)

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }

    // Proxy through local API to avoid CORS issues with accounts service
    const { appConfig: cfg } = await import('@/utils/config')
    const proxyUrl = `${cfg.apiBase}/oauth/construct/token`

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': cfg.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text()
      logError(`[OAuth] Token exchange failed: ${response.status} ${errText}`)
      console.error('[OAuth] Token exchange failed:', response.status, errText)
      let parsed: Record<string, string> = {}
      try { parsed = JSON.parse(errText) } catch { /* not JSON */ }
      throw new Error(parsed.error_description || parsed.error || `Token exchange failed (${response.status})`)
    }

    // Only clear verifier after successful exchange
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY)
    localStorage.removeItem(OAUTH_VERIFIER_KEY_PERSIST)

    info('[OAuth] Token exchange successful')
    return response.json()
  }

  async function fetchProfile(accessToken: string): Promise<{
    id: string
    email: string
    username: string
    first_name: string
    last_name: string
    avatar_url?: string
  }> {
    // Proxy through local API to avoid CORS with accounts service
    const { appConfig: cfg } = await import('@/utils/config')
    const proxyUrl = `${cfg.apiBase}/oauth/construct/profile`

    const response = await fetch(proxyUrl, {
      headers: {
        'X-Api-Key': cfg.apiKey,
        'X-Construct-Token': accessToken,
      },
    })

    if (!response.ok) {
      logError(`[OAuth] fetchProfile failed: ${response.status}`)
      throw new Error('Failed to fetch user profile')
    }

    return response.json()
  }

  async function updateProfile(accessToken: string, data: {
    first_name?: string
    last_name?: string
    username?: string
    phone?: string
  }): Promise<Record<string, unknown>> {
    const response = await fetch(`${accountsUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || 'Failed to update profile')
    }

    return response.json()
  }

  return {
    startLogin,
    getRegisterUrl,
    getForgotPasswordUrl,
    validateState,
    exchangeCode,
    fetchProfile,
    updateProfile,
    closeOAuthWindow,
    accountsUrl,
  }
}
