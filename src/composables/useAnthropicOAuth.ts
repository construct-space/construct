/**
 * useAnthropicOAuth - Anthropic OAuth authentication flow
 * For Claude Pro/Max authentication via PKCE OAuth
 * Token exchange happens via context service to avoid CORS issues
 */
import { invoke } from '@tauri-apps/api/core'

// Registered OAuth client ID with Anthropic
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'

interface PKCECodes {
  verifier: string
  challenge: string
}

/**
 * Generate PKCE codes for OAuth flow
 */
async function generatePKCE(): Promise<PKCECodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map(b => chars[b % chars.length])
    .join('')
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function useAnthropicOAuth() {
  const isAuthenticated = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const expiresAt = ref<number | null>(null)
  const pendingVerifier = ref<string | null>(null)

  // Check isTauri
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

  /**
   * Check authentication status from context service
   */
  const checkStatus = async () => {
    console.log('[AnthropicOAuth] checkStatus called, isTauri:', isTauri)
    if (!isTauri) {
      console.log('[AnthropicOAuth] Not in Tauri, skipping status check')
      return
    }

    try {
      console.log('[AnthropicOAuth] Calling send_context_request with auth.anthropic.status...')
      const result = await invoke<{ authenticated?: boolean, expires_at?: number, error?: string, source?: string }>('send_context_request', {
        requestType: 'auth.anthropic.status',
        payload: {},
      })

      console.log('[AnthropicOAuth] Status check raw result:', result)
      console.log('[AnthropicOAuth] Status check result:', JSON.stringify(result))
      console.log('[AnthropicOAuth] authenticated:', result?.authenticated, 'error:', result?.error, 'source:', result?.source)

      // Context service returns { authenticated: true/false, expires_at?: number }
      if (result && typeof result.authenticated === 'boolean') {
        isAuthenticated.value = result.authenticated
        expiresAt.value = result.expires_at || null
        if (result.error) {
          console.warn('[AnthropicOAuth] Auth error from backend:', result.error)
          error.value = result.error
        }
      }
    } catch (e) {
      console.error('[AnthropicOAuth] Status check failed:', e)
      console.error('[AnthropicOAuth] Error details:', JSON.stringify(e))
    }
  }

  /**
   * Start OAuth authorization flow
   * Returns URL to open in browser and stores verifier for later
   */
  const startAuth = async (mode: 'max' | 'console' = 'max'): Promise<string> => {
    error.value = null
    isLoading.value = true

    try {
      const pkce = await generatePKCE()
      pendingVerifier.value = pkce.verifier

      // Store verifier in sessionStorage for callback
      sessionStorage.setItem('anthropic_oauth_verifier', pkce.verifier)

      const baseUrl = mode === 'console'
        ? 'https://console.anthropic.com/oauth/authorize'
        : 'https://claude.ai/oauth/authorize'

      const url = new URL(baseUrl)
      url.searchParams.set('code', 'true')
      url.searchParams.set('client_id', ANTHROPIC_CLIENT_ID)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', ANTHROPIC_REDIRECT_URI)
      url.searchParams.set('scope', 'org:create_api_key user:profile user:inference')
      url.searchParams.set('code_challenge', pkce.challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', pkce.verifier)

      return url.toString()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to start OAuth'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Exchange authorization code for tokens via context service
   * Accepts: full callback URL, "code#state", or just code
   */
  const exchangeCode = async (input: string): Promise<boolean> => {
    console.log('[AnthropicOAuth] exchangeCode called, isTauri:', isTauri)

    if (!isTauri) {
      error.value = 'OAuth exchange requires Tauri'
      console.error('[AnthropicOAuth] Not in Tauri environment')
      return false
    }

    error.value = null
    isLoading.value = true

    try {
      // Get stored verifier
      const verifier = sessionStorage.getItem('anthropic_oauth_verifier') || pendingVerifier.value
      console.log('[AnthropicOAuth] Verifier from storage:', verifier ? verifier.substring(0, 10) + '...' : 'null')

      if (!verifier) {
        throw new Error('No pending OAuth verifier found. Please start the auth flow again.')
      }

      let code: string
      let state: string | undefined

      // Parse input - handle full URL, code#state, or just code
      const trimmed = input.trim()
      console.log('[AnthropicOAuth] Input length:', trimmed.length, 'starts with:', trimmed.substring(0, 20))

      if (trimmed.includes('?code=')) {
        // Full callback URL: extract code and state from query params
        const url = new URL(trimmed)
        code = url.searchParams.get('code') || ''
        state = url.searchParams.get('state') || undefined
        console.log('[AnthropicOAuth] Parsed from URL - code length:', code.length, 'state length:', state?.length)
      } else if (trimmed.includes('#')) {
        // code#state format
        const parts = trimmed.split('#')
        code = parts[0] || ''
        state = parts[1]
        console.log('[AnthropicOAuth] Parsed from code#state - code length:', code.length, 'state length:', state?.length)
      } else {
        // Just the code
        code = trimmed
        console.log('[AnthropicOAuth] Using raw code, length:', code.length)
      }

      if (!code) {
        throw new Error('Invalid authorization code')
      }

      console.log('[AnthropicOAuth] Exchanging code:', code.substring(0, 10) + '...', 'state:', state?.substring(0, 10) + '...', 'verifier:', verifier.substring(0, 10) + '...')

      // Exchange via context service (to avoid CORS)
      console.log('[AnthropicOAuth] Calling send_context_request with auth.anthropic.exchange...')
      const result = await invoke<{ success: boolean, error?: string }>('send_context_request', {
        requestType: 'auth.anthropic.exchange',
        payload: {
          code,
          state: state || verifier,
          verifier,
        },
      })

      console.log('[AnthropicOAuth] Result:', JSON.stringify(result))

      // Context service returns { authenticated: true } on success, or { success: false, error: '...' } on failure
      const res = result as { success?: boolean, authenticated?: boolean, error?: string }
      if (res.success === false) {
        throw new Error(res.error || 'Token exchange failed')
      }
      if (!res.authenticated && !res.success) {
        throw new Error('Unexpected response from auth service')
      }

      // Clear verifier
      sessionStorage.removeItem('anthropic_oauth_verifier')
      pendingVerifier.value = null

      // Update status
      isAuthenticated.value = true
      await checkStatus()

      return true
    } catch (e) {
      console.error('[AnthropicOAuth] Exception caught:', e)
      console.error('[AnthropicOAuth] Exception type:', typeof e)
      console.error('[AnthropicOAuth] Is Error:', e instanceof Error)
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Failed to exchange code')
      error.value = msg
      console.error('[AnthropicOAuth] Exchange failed:', msg)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Logout - clear tokens via context service
   */
  const logout = async () => {
    if (!isTauri) return

    try {
      await invoke('send_context_request', {
        requestType: 'auth.anthropic.clear',
        payload: {},
      })
    } catch (e) {
      console.error('[AnthropicOAuth] Logout failed:', e)
    }

    isAuthenticated.value = false
    expiresAt.value = null
    error.value = null
  }

  // Check status on init (if in Tauri)
  if (isTauri) {
    checkStatus()
  }

  return {
    isAuthenticated,
    isLoading: readonly(isLoading),
    error: readonly(error),
    expiresAt: readonly(expiresAt),
    startAuth,
    exchangeCode,
    checkStatus,
    logout,
  }
}
