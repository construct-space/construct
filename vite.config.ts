import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      dirs: [
        'src/composables',
        'src/stores',
        'src/utils',
      ],
      dts: 'src/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      dirs: [
        'src/components',
        'src/components/media',
        'src/spaces/code/components',
        'src/spaces/kanban/components',
        'src/spaces/notes/components',
        'src/spaces/ai/components',
        'src/spaces/architect/components',
        'src/spaces/docs/components',
        'src/spaces/terminal/components',
        'src/spaces/git/components',
        'src/spaces/chat/components',
        'src/spaces/design/components',
      ],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['vue'],
  },
  server: {
    port: 3050,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/media': 'http://localhost:8000',
    },
  },
  // Clear screen disabled for Tauri integration
  clearScreen: false,
  // Nuxt compatibility: import.meta.client/server are Nuxt-specific.
  // Since this is always a client-side SPA, define them as constants.
  define: {
    'import.meta.client': 'true',
    'import.meta.server': 'false',
  },
})
