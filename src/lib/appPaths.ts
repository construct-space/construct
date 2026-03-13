const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

export const IS_DEV_INSTANCE = import.meta.env.VITE_CONSTRUCT_DEV_MODE === 'true'
export const APP_DIR_NAME = IS_DEV_INSTANCE ? '.construct-dev' : '.construct'
export const APP_DISPLAY_NAME = IS_DEV_INSTANCE ? 'Construct DEV' : 'Construct'
export const APP_DEEP_LINK_SCHEME = IS_DEV_INSTANCE ? 'construct-dev' : 'construct'
export const SHOULD_USE_DEV_BEHAVIOR = import.meta.env.DEV || IS_DEV_INSTANCE

export function getSpacesDir(): string {
  return `/${APP_DIR_NAME}/spaces`
}

export function getSpacesDirPath(home: string): string {
  return `${trimTrailingSlash(home)}${getSpacesDir()}`
}

export function getSpaceDirPath(home: string, spaceId: string): string {
  return `${getSpacesDirPath(home)}/${spaceId}`
}

export function getSpaceManifestPath(home: string, spaceId: string): string {
  return `${getSpaceDirPath(home, spaceId)}/manifest.json`
}

export function getDeepLinkUrl(action: string, path = ''): string {
  const normalizedPath = path.replace(/^\/+/, '')
  return `${APP_DEEP_LINK_SCHEME}://${action}${normalizedPath ? `/${normalizedPath}` : ''}`
}
