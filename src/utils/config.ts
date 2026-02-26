/**
 * App configuration — replaces Nuxt's useRuntimeConfig()
 * All composables that previously used useRuntimeConfig() now import this.
 */
export const appConfig = {
  apiBase: import.meta.env.VITE_API_BASE || 'https://api.construct.ninja/api',
  apiKey: import.meta.env.VITE_API_KEY || 'api',
  freepikApiKey: import.meta.env.VITE_FREEPIK_API_KEY || '',
  spacesRegistryUrl: import.meta.env.VITE_SPACES_REGISTRY_URL || 'https://spaces.construct.ninja',
  spacesIndexUrl: import.meta.env.VITE_SPACES_INDEX_URL || 'https://raw.githubusercontent.com/construct-base/space-releases/main/index.json',
  accountsUrl: import.meta.env.VITE_ACCOUNTS_URL || 'https://accounts.construct.ninja',
  oauthClientId: import.meta.env.VITE_OAUTH_CLIENT_ID || 'construct_app',
}
