import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from './routes'
import { authGuard } from './guards'

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(authGuard)
