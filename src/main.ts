import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import App from './App.vue'
import './assets/css/main.css'
import { initSpaceHost } from './lib/spaceHost'

// Expose shared deps as globals BEFORE anything else.
// Space IIFE bundles reference these via window.__CONSTRUCT__['vue'] etc.
initSpaceHost()

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Initialize auth, then project store, then mount
import { useAuthStore } from './stores/auth'
import { useProjectStore } from './stores/project'

const authStore = useAuthStore()
authStore.initialize().then(() => {
  const projectStore = useProjectStore()
  return projectStore.initialize()
}).finally(() => {
  app.mount('#app')
})
