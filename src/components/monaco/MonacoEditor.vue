<script setup lang="ts">
/**
 * MonacoEditor — Thin Vue wrapper around monaco-editor.
 * Supports v-model for content, language, and editor options.
 */
import * as monaco from 'monaco-editor'

interface Props {
  modelValue?: string
  lang?: string
  options?: monaco.editor.IStandaloneEditorConstructionOptions
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  lang: 'plaintext',
  options: () => ({}),
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'load', editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco): void
}>()

const containerRef = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let isUpdatingFromProp = false

onMounted(() => {
  if (!containerRef.value) return

  editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: props.lang,
    automaticLayout: true,
    ...props.options,
  })

  // Emit content changes
  editor.onDidChangeModelContent(() => {
    if (isUpdatingFromProp) return
    const value = editor!.getValue()
    emit('update:modelValue', value)
  })

  emit('load', editor, monaco)
})

// Sync modelValue → editor
watch(() => props.modelValue, (newVal) => {
  if (!editor) return
  const current = editor.getValue()
  if (newVal !== current) {
    isUpdatingFromProp = true
    editor.setValue(newVal ?? '')
    isUpdatingFromProp = false
  }
})

// Sync language changes
watch(() => props.lang, (newLang) => {
  if (!editor) return
  const model = editor.getModel()
  if (model && newLang) {
    monaco.editor.setModelLanguage(model, newLang)
  }
})

// Sync options changes
watch(() => props.options, (newOptions) => {
  if (!editor || !newOptions) return
  editor.updateOptions(newOptions)
}, { deep: true })

onUnmounted(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full" />
</template>
