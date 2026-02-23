/**
 * Freepik API composable for AI-powered image operations
 *
 * Supports:
 * - Text-to-image generation (Mystic model)
 * - Image upscaling (Magnific AI, up to 16K)
 * - Image relighting (style/lighting transforms)
 * - Text-to-icon generation
 * - Background removal
 *
 * API docs: https://docs.freepik.com/
 */

import { appConfig } from '@/utils/config'

const FREEPIK_BASE = 'https://api.freepik.com/v1/ai'

interface FreepikBackgroundRemovalResponse {
  original: string
  high_resolution: string
  preview: string
  url: string
}

interface FreepikImageGenResponse {
  data: Array<{
    base64: string
    has_nsfw: boolean
  }>
  meta: {
    image_id: string
    seed: number
  }
}

interface FreepikUpscaleResponse {
  data: Array<{
    base64: string
    has_nsfw: boolean
  }>
}

interface FreepikRelightResponse {
  data: Array<{
    base64: string
    has_nsfw: boolean
  }>
}

interface FreepikIconResponse {
  data: Array<{
    base64: string
  }>
}

interface FreepikError {
  error: string
  message?: string
}

export function useFreepikApi() {
  const apiKey = appConfig.freepikApiKey || 'FPSX02b96b6ae0d05b574753962c89157a79'

  const isProcessing = ref(false)
  const error = ref<string | null>(null)

  // Shared request helper using native fetch
  async function freepikRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T | null> {
    isProcessing.value = true
    error.value = null

    try {
      const response = await fetch(`${FREEPIK_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': apiKey,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as FreepikError
        error.value = errorData.message || errorData.error || `Freepik API error (${response.status})`
        return null
      }

      return await response.json() as T
    } catch (err: unknown) {
      console.error(`Freepik API error (${endpoint}):`, err)
      if (err instanceof Error) {
        error.value = err.message
      } else {
        error.value = 'Freepik API error'
      }
      return null
    } finally {
      isProcessing.value = false
    }
  }

  // Shared form-data request helper using native fetch
  async function freepikFormRequest<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
    isProcessing.value = true
    error.value = null

    try {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        formData.append(key, value)
      }

      const response = await fetch(`${FREEPIK_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-freepik-api-key': apiKey,
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as FreepikError
        error.value = errorData.message || errorData.error || `Freepik API error (${response.status})`
        return null
      }

      return await response.json() as T
    } catch (err: unknown) {
      console.error(`Freepik API error (${endpoint}):`, err)
      if (err instanceof Error) {
        error.value = err.message
      } else {
        error.value = 'Freepik API error'
      }
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Generate an image from a text prompt using Mystic model
   */
  async function generateImage(
    prompt: string,
    options?: {
      negativePrompt?: string
      width?: number
      height?: number
      numImages?: number
      guidanceScale?: number
    }
  ): Promise<FreepikImageGenResponse | null> {
    return freepikRequest<FreepikImageGenResponse>('/text-to-image/mystic', {
      prompt,
      negative_prompt: options?.negativePrompt || '',
      image: {
        size: {
          width: options?.width || 1024,
          height: options?.height || 1024,
        },
      },
      num_images: options?.numImages || 1,
      guidance_scale: options?.guidanceScale || 7,
    })
  }

  /**
   * Upscale an image using Magnific AI (up to 16K resolution)
   */
  async function upscaleImage(
    imageBase64: string,
    scale: 2 | 4 | 8 | 16 = 2
  ): Promise<FreepikUpscaleResponse | null> {
    return freepikRequest<FreepikUpscaleResponse>('/image-upscaler', {
      image: imageBase64,
      scale_factor: scale,
    })
  }

  /**
   * Apply lighting and style transformations to an image
   */
  async function relightImage(
    imageBase64: string,
    prompt: string
  ): Promise<FreepikRelightResponse | null> {
    return freepikRequest<FreepikRelightResponse>('/image-relight', {
      image: imageBase64,
      prompt,
    })
  }

  /**
   * Generate an icon from a text description
   */
  async function generateIcon(
    prompt: string,
    options?: {
      color?: string
      shape?: 'circle' | 'square' | 'rounded'
      style?: 'flat' | 'gradient' | 'outline'
    }
  ): Promise<FreepikIconResponse | null> {
    return freepikRequest<FreepikIconResponse>('/text-to-icon/preview', {
      prompt,
      color: options?.color,
      shape: options?.shape || 'rounded',
      style: options?.style || 'flat',
    })
  }

  /**
   * Remove background from an image
   */
  async function removeBackground(imageUrl: string): Promise<FreepikBackgroundRemovalResponse | null> {
    if (!imageUrl) {
      error.value = 'No image URL provided'
      return null
    }
    if (imageUrl.startsWith('data:')) {
      error.value = 'Data URLs are not supported. Please upload the image first.'
      return null
    }
    return freepikFormRequest<FreepikBackgroundRemovalResponse>('/beta/remove-background', {
      image_url: imageUrl,
    })
  }

  /**
   * Download an image from a URL and return it as a Blob
   */
  async function downloadImage(url: string): Promise<Blob | null> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`)
      }
      return await response.blob()
    } catch (err) {
      console.error('Failed to download image:', err)
      error.value = 'Failed to download processed image'
      return null
    }
  }

  /**
   * Upload an image blob to the Construct media library
   */
  async function uploadToMedia(blob: Blob, filename: string): Promise<string | null> {
    try {
      const baseURL = appConfig.apiBase

      const isDesktopApp = (
        window.location.protocol === 'tauri:' ||
        window.location.hostname === 'tauri.localhost' ||
        '__TAURI__' in window ||
        '__TAURI_INTERNALS__' in window
      )

      const token = isDesktopApp
        ? localStorage.getItem('cp_auth_token')
        : document.cookie.match(/(?:^|; )cp_auth_token=([^;]*)/)?.[1] || null

      const formData = new FormData()
      formData.append('file', blob, filename)
      formData.append('name', filename)
      formData.append('type', 'image')
      formData.append('description', 'Processed via Freepik AI')

      const headers: Record<string, string> = {
        'X-API-Key': appConfig.apiKey,
      }
      if (token) {
        headers.Authorization = `Bearer ${decodeURIComponent(token)}`
      }

      const response = await fetch(`${baseURL}/media`, {
        method: 'POST',
        body: formData,
        headers,
      })

      if (!response.ok) throw new Error(`Upload failed: ${response.status}`)

      const result = await response.json() as { id: number; file?: { url: string } }
      return result.file?.url || null
    } catch (err) {
      console.error('Failed to upload to media:', err)
      error.value = 'Failed to save processed image'
      return null
    }
  }

  function dataUrlToBlob(dataUrl: string): Blob | null {
    try {
      const arr = dataUrl.split(',')
      const mime = arr[0]?.match(/:(.*?);/)?.[1] || 'image/png'
      const bstr = atob(arr[1] || '')
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      return new Blob([u8arr], { type: mime })
    } catch {
      return null
    }
  }

  async function uploadDataUrl(dataUrl: string, filename?: string): Promise<string | null> {
    const blob = dataUrlToBlob(dataUrl)
    if (!blob) {
      error.value = 'Failed to process image data'
      return null
    }
    const name = filename || `image-${Date.now()}.png`
    return await uploadToMedia(blob, name)
  }

  /**
   * Complete flow: Remove background and save to media library
   */
  async function removeBackgroundAndSave(
    imageUrl: string,
    originalFilename?: string
  ): Promise<string | null> {
    let publicUrl = imageUrl

    if (imageUrl.startsWith('data:')) {
      const uploadedUrl = await uploadDataUrl(imageUrl, originalFilename || 'image-for-processing.png')
      if (!uploadedUrl) {
        error.value = 'Failed to upload image for processing'
        return null
      }
      publicUrl = uploadedUrl
    }

    const result = await removeBackground(publicUrl)
    if (!result) return null

    const imageBlob = await downloadImage(result.high_resolution)
    if (!imageBlob) return null

    const baseName = originalFilename
      ? originalFilename.replace(/\.[^.]+$/, '')
      : 'image'
    const newFilename = `${baseName}-nobg-${Date.now()}.png`

    return await uploadToMedia(imageBlob, newFilename)
  }

  return {
    // State
    isProcessing: readonly(isProcessing),
    error: readonly(error),

    // Image Generation
    generateImage,
    generateIcon,

    // Image Processing
    upscaleImage,
    relightImage,
    removeBackground,
    removeBackgroundAndSave,

    // Utilities
    downloadImage,
    uploadToMedia,
    uploadDataUrl,
  }
}
