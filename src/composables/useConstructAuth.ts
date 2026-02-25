import { appConfig } from '@/utils/config'
import { isTauriEnv } from '@/utils/tauri'

const OAUTH_STATE_KEY = 'construct_oauth_state'

function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

function getRedirectUri(): string {
  if (isTauriEnv()) {
    return 'construct://oauth/callback'
  }
  return `${window.location.origin}/oauth/callback`
}

export function useConstructAuth() {
  const accountsUrl = appConfig.accountsUrl
  const clientId = appConfig.oauthClientId

  function startLogin() {
    const state = generateState()
    sessionStorage.setItem(OAUTH_STATE_KEY, state)

    const redirectUri = getRedirectUri()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'openid profile email',
    })

    const authorizeUrl = `${accountsUrl}/oauth/authorize?${params.toString()}`

    if (isTauriEnv()) {
      // Open in system browser
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

    const response = await fetch(`${accountsUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error_description || err.error || 'Token exchange failed')
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

  return {
    startLogin,
    getRegisterUrl,
    getForgotPasswordUrl,
    validateState,
    exchangeCode,
    fetchProfile,
    accountsUrl,
  }
}
