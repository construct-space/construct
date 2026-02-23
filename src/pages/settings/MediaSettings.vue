<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Switch from '@/components/ui/Switch.vue'
import Slider from '@/components/ui/Slider.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  media_convert_images: true,
  media_convert_videos: true,
  media_convert_audio: true,
  media_keep_original: true,
  media_image_quality: 85,
  media_video_quality: 80,
  media_audio_bitrate: 128,
})

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.mediaSettings, (settings) => {
  skipWatch = true
  for (const s of settings) {
    const key = s.setting_key as keyof typeof formData.value
    if (key in formData.value) {
      if (s.type === 'bool') {
        ;(formData.value as Record<string, unknown>)[key] = s.value_bool
      } else if (s.type === 'int') {
        ;(formData.value as Record<string, unknown>)[key] = s.value_int
      }
    }
  }
  nextTick(() => { skipWatch = false; loaded.value = true })
}, { immediate: true })

watch(formData, () => {
  if (!loaded.value || skipWatch) return
  saved.value = false
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 600)
}, { deep: true })

async function save() {
  try {
    await settingsStore.updateMediaSettings(formData.value)
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  }
}
</script>

<template>
  <div>

    <div class="flex flex-col gap-5">
      <h3 class="text-sm font-semibold text-[var(--app-foreground)]">Conversion</h3>

      <FormField label="Convert Images" description="Automatically convert uploaded images to optimized formats.">
        <Switch v-model="formData.media_convert_images" />
      </FormField>

      <FormField label="Convert Videos" description="Automatically transcode uploaded videos.">
        <Switch v-model="formData.media_convert_videos" />
      </FormField>

      <FormField label="Convert Audio" description="Automatically convert uploaded audio files.">
        <Switch v-model="formData.media_convert_audio" />
      </FormField>

      <FormField label="Keep Originals" description="Preserve original files after conversion.">
        <Switch v-model="formData.media_keep_original" />
      </FormField>

      <div class="border-t border-[var(--app-border)] my-2" />

      <h3 class="text-sm font-semibold text-[var(--app-foreground)]">Quality</h3>

      <FormField label="Image Quality" :description="`${formData.media_image_quality}%`">
        <Slider v-model="formData.media_image_quality" :min="10" :max="100" :step="5" />
      </FormField>

      <FormField label="Video Quality" :description="`${formData.media_video_quality}%`">
        <Slider v-model="formData.media_video_quality" :min="10" :max="100" :step="5" />
      </FormField>

      <FormField label="Audio Bitrate" :description="`${formData.media_audio_bitrate} kbps`">
        <Slider v-model="formData.media_audio_bitrate" :min="64" :max="320" :step="32" />
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>
  </div>
</template>
