<script setup lang="ts">
/**
 * MonacoDiffEditor — Thin Vue wrapper around monaco-editor's diff editor.
 */
import * as monaco from 'monaco-editor'

interface Props {
  original?: string
  modified?: string
  lang?: string
  options?: monaco.editor.IDiffEditorConstructionOptions
}

const props = withDefaults(defineProps<Props>(), {
  original: '',
  modified: '',
  lang: 'plaintext',
  options: () => ({}),
})

const emit = defineEmits<{
  (e: 'load', editor: monaco.editor.IStandaloneDiffEditor, monacoInstance: typeof monaco): void
}>()

const containerRef = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneDiffEditor | null = null

function createModels() {
  const originalModel = monaco.editor.createModel(props.original, props.lang)
  const modifiedModel = monaco.editor.createModel(props.modified, props.lang)
  return { original: originalModel, modified: modifiedModel }
}

onMounted(() => {
  if (!containerRef.value) return

  editor = monaco.editor.createDiffEditor(containerRef.value, {
    automaticLayout: true,
    readOnly: true,
    ...props.options,
  })

  const models = createModels()
  editor.setModel(models)

  emit('load', editor, monaco)
})

// Sync content changes
watch([() => props.original, () => props.modified, () => props.lang], () => {
  if (!editor) return
  const oldModel = editor.getModel()
  const models = createModels()
  editor.setModel(models)
  // Dispose old models
  oldModel?.original?.dispose()
  oldModel?.modified?.dispose()
})

// Sync options
watch(() => props.options, (newOptions) => {
  if (!editor || !newOptions) return
  editor.updateOptions(newOptions)
}, { deep: true })

onUnmounted(() => {
  const model = editor?.getModel()
  model?.original?.dispose()
  model?.modified?.dispose()
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full" />
</template>
