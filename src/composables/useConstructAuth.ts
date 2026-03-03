import { appConfig } from '@/utils/config'
import { isTauriEnv } from '@/utils/tauri'

const OAUTH_STATE_KEY = 'construct_oauth_state'
const OAUTH_VERIFIER_KEY = 'construct_oauth_verifier'

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

    const redirectUri = getRedirectUri()
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
    const stored = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    return stored === state
  }

  async function exchangeCode(code: string): Promise<{ access_token: string }> {
    const redirectUri = getRedirectUri()
    const codeVerifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY) || ''
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY)

    console.log('[OAuth] exchangeCode — redirect_uri:', redirectUri)
    console.log('[OAuth] exchangeCode — code_verifier present:', !!codeVerifier, 'length:', codeVerifier.length)
    console.log('[OAuth] exchangeCode — client_id:', clientId)

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }

    const response = await fetch(`${accountsUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[OAuth] Token exchange failed:', response.status, errText)
      let parsed: Record<string, string> = {}
      try { parsed = JSON.parse(errText) } catch { /* not JSON */ }
      throw new Error(parsed.error_description || parsed.error || `Token exchange failed (${response.status})`)
    }

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
    const response = await fetch(`${accountsUrl}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
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
