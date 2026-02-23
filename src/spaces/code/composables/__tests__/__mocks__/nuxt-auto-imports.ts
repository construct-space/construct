/**
 * Setup file: inject Nuxt auto-imports into the global scope so composables
 * can use ref(), computed(), watch(), etc. without explicit imports.
 */
import { vi } from 'vitest'
import { ref, computed, reactive, watch, nextTick, shallowRef, triggerRef, watchEffect } from 'vue'
import type { Ref as _Ref, ComputedRef as _ComputedRef } from 'vue'

// Inject Vue reactivity primitives as globals (Nuxt auto-imports these)
Object.assign(globalThis, {
  ref,
  computed,
  reactive,
  watch,
  nextTick,
  shallowRef,
  triggerRef,
  watchEffect,
})

// Declare global types for TypeScript
declare global {
  const ref: typeof import('vue')['ref']
  const computed: typeof import('vue')['computed']
  const reactive: typeof import('vue')['reactive']
  const watch: typeof import('vue')['watch']
  const nextTick: typeof import('vue')['nextTick']
  const shallowRef: typeof import('vue')['shallowRef']
  const triggerRef: typeof import('vue')['triggerRef']
  const watchEffect: typeof import('vue')['watchEffect']
  type Ref<T = unknown> = import('vue').Ref<T>
  type ComputedRef<T = unknown> = import('vue').ComputedRef<T>
}

// Mock useColorMode — returns a reactive ref
;(globalThis as Record<string, unknown>).useColorMode = () => ref('dark')

// Mock usePreferencesStore
;(globalThis as Record<string, unknown>).usePreferencesStore = () => ({
  editorSettings: null,
  setEditorSettings: vi.fn(),
  init: vi.fn(() => Promise.resolve()),
})

// Mock useToast
;(globalThis as Record<string, unknown>).useToast = () => ({
  add: vi.fn(),
})

// Mock useProcessManager
;(globalThis as Record<string, unknown>).useProcessManager = () => ({
  killPort: vi.fn(() => Promise.resolve(true)),
  restartProcess: vi.fn(() => Promise.resolve()),
  runningProcesses: ref([]),
})
