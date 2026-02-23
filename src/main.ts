import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import App from './App.vue'
import './assets/css/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Initialize auth before mount
import { useAuthStore } from './stores/auth'
const authStore = useAuthStore()
authStore.initialize().finally(() => {
  app.mount('#app')
})
