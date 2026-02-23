/**
 * ImageRenderer — DesignNode(image) → PixiJS Sprite inside Container
 *
 * We use a Container with a Sprite child and a Graphics mask
 * to support crop/clip within the node bounds.
 */
import { Container, Sprite, Graphics, Assets, Texture } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyCommonProps } from './shared'

// Cache to avoid reloading textures
const textureCache = new Map<string, Texture>()

export function createImage(node: DesignNode): Container {
  const container = new Container()
  container.label = node.id

  // Placeholder graphics while image loads
  const placeholder = new Graphics()
  placeholder.rect(0, 0, node.width, node.height)
  placeholder.fill({ color: 0xeeeeee })
  placeholder.label = '__placeholder'
  container.addChild(placeholder)

  // Clip mask
  const mask = new Graphics()
  mask.rect(0, 0, node.width, node.height)
  mask.fill({ color: 0xffffff })
  mask.label = '__mask'
  container.addChild(mask)
  container.mask = mask

  // Load image async
  if (node.imageUrl) {
    loadImageTexture(node.imageUrl).then((texture) => {
      if (!texture) return
      const sprite = new Sprite(texture)
      sprite.label = '__sprite'
      fitSpriteToNode(sprite, node, texture)
      container.addChild(sprite)

      // Remove placeholder
      const ph = container.getChildByLabel('__placeholder')
      if (ph) container.removeChild(ph)
    })
  }

  applyCommonProps(container, node)
  return container
}

export function updateImage(container: Container, node: DesignNode): void {
  // Update mask
  const mask = container.getChildByLabel('__mask') as Graphics | null
  if (mask) {
    mask.clear()
    mask.rect(0, 0, node.width, node.height)
    mask.fill({ color: 0xffffff })
  }

  // Update sprite fit
  const sprite = container.getChildByLabel('__sprite') as Sprite | null
  if (sprite && sprite.texture) {
    fitSpriteToNode(sprite, node, sprite.texture)
  }

  // If imageUrl changed, reload
  const currentUrl = (container as any).__imageUrl
  if (node.imageUrl && node.imageUrl !== currentUrl) {
    ; (container as any).__imageUrl = node.imageUrl
    loadImageTexture(node.imageUrl).then((texture) => {
      if (!texture) return
      const existingSprite = container.getChildByLabel('__sprite') as Sprite | null
      if (existingSprite) {
        existingSprite.texture = texture
        fitSpriteToNode(existingSprite, node, texture)
      } else {
        const newSprite = new Sprite(texture)
        newSprite.label = '__sprite'
        fitSpriteToNode(newSprite, node, texture)
        container.addChild(newSprite)
      }
    })
  }

  applyCommonProps(container, node)
}

function fitSpriteToNode(sprite: Sprite, node: DesignNode, texture: Texture): void {
  const fit = node.objectFit || 'cover'
  const tw = texture.width
  const th = texture.height
  const nw = node.width
  const nh = node.height

  if (fit === 'fill') {
    sprite.width = nw
    sprite.height = nh
    sprite.x = 0
    sprite.y = 0
  } else if (fit === 'contain') {
    const scale = Math.min(nw / tw, nh / th)
    sprite.width = tw * scale
    sprite.height = th * scale
    sprite.x = (nw - sprite.width) / 2
    sprite.y = (nh - sprite.height) / 2
  } else {
    // cover (default)
    const scale = Math.max(nw / tw, nh / th)
    sprite.width = tw * scale
    sprite.height = th * scale
    sprite.x = (nw - sprite.width) / 2
    sprite.y = (nh - sprite.height) / 2
  }
}

async function loadImageTexture(url: string): Promise<Texture | null> {
  if (textureCache.has(url)) {
    return textureCache.get(url)!
  }
  try {
    // Hint the load parser for URLs without recognisable file extensions
    // (e.g. Unsplash URLs with query-string params instead of .jpg/.png)
    const texture = await Assets.load<Texture>({
      src: url,
      parser: 'loadTextures',
    })
    textureCache.set(url, texture)
    return texture
  } catch (e) {
    console.warn('[ImageRenderer] Failed to load:', url, e)
    return null
  }
}
