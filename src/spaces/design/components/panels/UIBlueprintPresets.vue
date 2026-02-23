<script setup lang="ts">
/**
 * UIBlueprintPresets - Blueprint preset picker panel using Nuxt UI
 * Shows device presets organized by category with Accordion
 */

const emit = defineEmits<{
  (e: 'create', preset: { name: string; width: number; height: number }): void
}>()

// Blueprint presets organized by category
const blueprintPresets = [
  {
    label: 'Phone',
    icon: 'i-lucide-smartphone',
    value: 'phone',
    items: [
      { name: 'iPhone 16 Pro', width: 402, height: 874 },
      { name: 'iPhone 16', width: 393, height: 852 },
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'Android Large', width: 412, height: 915 },
      { name: 'Android Small', width: 360, height: 800 },
    ]
  },
  {
    label: 'Tablet',
    icon: 'i-lucide-tablet',
    value: 'tablet',
    items: [
      { name: 'iPad Pro 12.9"', width: 1024, height: 1366 },
      { name: 'iPad Pro 11"', width: 834, height: 1194 },
      { name: 'iPad Mini', width: 744, height: 1133 },
      { name: 'Surface Pro', width: 912, height: 1368 },
    ]
  },
  {
    label: 'Desktop',
    icon: 'i-lucide-monitor',
    value: 'desktop',
    items: [
      { name: 'Desktop', width: 1440, height: 1024 },
      { name: 'MacBook Pro 16"', width: 1728, height: 1117 },
      { name: 'MacBook Pro 14"', width: 1512, height: 982 },
      { name: 'MacBook Air', width: 1280, height: 832 },
      { name: 'iMac 24"', width: 2048, height: 1152 },
    ]
  },
  {
    label: 'Watch',
    icon: 'i-lucide-watch',
    value: 'watch',
    items: [
      { name: 'Apple Watch 49mm', width: 205, height: 251 },
      { name: 'Apple Watch 45mm', width: 198, height: 242 },
      { name: 'Apple Watch 41mm', width: 176, height: 215 },
    ]
  },
  {
    label: 'Social',
    icon: 'i-lucide-image',
    value: 'social',
    items: [
      { name: 'Instagram Post', width: 1080, height: 1080 },
      { name: 'Instagram Story', width: 1080, height: 1920 },
      { name: 'Twitter Post', width: 1200, height: 675 },
      { name: 'Facebook Cover', width: 820, height: 312 },
    ]
  },
]

interface DevicePreset {
  name: string
  width: number
  height: number
}

const handleCreate = (preset: DevicePreset) => {
  emit('create', preset)
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0 bg-app">
    <!-- Header -->
    <div class="p-3 border-b border-app shrink-0">
      <h3 class="text-sm font-medium text-app">Blueprints</h3>
      <p class="text-xs text-app-muted mt-1">Click to add to canvas</p>
    </div>

    <!-- Scrollable content -->
    <ScrollArea class="flex-1 min-h-0">
      <Accordion
        :items="blueprintPresets"
        type="multiple"
        :default-value="['phone']"
        :ui="{
          item: 'border-b border-app last:border-b-0',
          trigger: 'px-3 py-2 text-xs font-medium uppercase tracking-wide bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
        }"
      >
        <template #leading="{ item }">
          <Icon :name="item.icon" class="size-3.5 text-app-muted" />
        </template>

        <template #body="{ item }">
          <div class="p-2 space-y-0.5">
            <button
              v-for="preset in (item.items as DevicePreset[])"
              :key="preset.name"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors group"
              @click="handleCreate(preset)"
            >
              <Icon :name="item.icon" class="size-4 text-app-muted group-hover:text-primary" />
              <div class="flex-1 min-w-0">
                <div class="text-sm text-app truncate">{{ preset.name }}</div>
                <div class="text-xs text-app-muted">{{ preset.width }} × {{ preset.height }}</div>
              </div>
            </button>
          </div>
        </template>
      </Accordion>
    </ScrollArea>
  </div>
</template>
