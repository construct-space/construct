import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from './routes'
import { authGuard } from './guards'
import { useTelemetry } from '@/composables/useTelemetry'

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(authGuard)

router.afterEach((to) => {
  if (!to.path.startsWith('/app')) return
  const telemetry = useTelemetry()
  const spaceId = to.params.spaceName as string | undefined
  const routeName = (to.name as string) ?? to.path
  telemetry.trackScreenView(routeName, spaceId)
})
