<script setup lang="ts">
import Toolbar3D from '@/components/common/Toolbar3D.vue'
import Sidebar3D from '@/components/common/Sidebar3D.vue'
import AssistantFloat from '@/components/ai/AssistantFloat.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- 3D Sidebar -->
    <Sidebar3D />

    <!-- Assistant dock: left -->
    <div id="assistant-dock-left" class="shrink-0" />

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <!-- Toolbar -->
      <Toolbar3D />

      <!-- Content + right dock wrapper -->
      <div class="flex-1 flex overflow-hidden min-h-0">
        <!-- Page content -->
        <main class="flex-1 overflow-auto min-w-0">
          <RouterView />
        </main>

        <!-- Assistant dock: right -->
        <div id="assistant-dock-right" class="shrink-0" />
      </div>

      <!-- Assistant dock: bottom -->
      <div id="assistant-dock-bottom" class="shrink-0" />
    </div>

    <!-- AI Assistant (triggered by double Shift, uses Teleport for docked modes) -->
    <Suspense>
      <AssistantFloat />
    </Suspense>
  </div>
</template>
