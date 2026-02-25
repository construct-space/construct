import { onOpenUrl, getCurrent } from '@tauri-apps/plugin-deep-link'
import { useRouter } from 'vue-router'
import { useSpaceMarketplace } from './useSpaceMarketplace'
import { isTauriEnv } from '@/utils/tauri'

export function useDeepLink() {
  if (!isTauriEnv()) return

  const router = useRouter()
  const marketplace = useSpaceMarketplace()

  function handleUrl(url: string) {
    const parsed = new URL(url)
    const segments = parsed.pathname.replace(/^\/+/, '').split('/')
    const action = parsed.host
    const type = segments[0]
    const id = segments[1]

    if (action === 'install' && type === 'spaces' && id) {
      marketplace.install(id)
      router.push(`/app/${id}`)
    } else if (action === 'open' && type === 'spaces' && id) {
      router.push(`/app/${id}`)
    } else if (action === 'marketplace') {
      router.push('/app/marketplace')
    }
  }

  // Check if app was launched via deep link
  getCurrent().then(urls => {
    if (urls?.length) handleUrl(urls[0])
  })

  // Listen for deep links while app is running
  onOpenUrl(urls => {
    if (urls.length) handleUrl(urls[0])
  })
}
