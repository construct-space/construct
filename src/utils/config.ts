/**
 * App configuration — replaces Nuxt's useRuntimeConfig()
 * All composables that previously used useRuntimeConfig() now import this.
 */
export const appConfig = {
  apiBase: import.meta.env.VITE_API_BASE || (
    import.meta.env.DEV
      ? 'http://localhost:8000/api'
      : 'https://api.construct.ninja/api'
  ),
  apiKey: import.meta.env.VITE_API_KEY || 'api',
  freepikApiKey: import.meta.env.VITE_FREEPIK_API_KEY || '',
}
