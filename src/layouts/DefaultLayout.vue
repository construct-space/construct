<script setup lang="ts">
import Toolbar3D from '@/components/common/Toolbar3D.vue'
import Sidebar3D from '@/components/common/Sidebar3D.vue'
import AssistantFloat from '@/components/ai/AssistantFloat.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- 3D Sidebar -->
    <Sidebar3D />

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar -->
      <Toolbar3D />

      <!-- Page content -->
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>

    <!-- AI Assistant (triggered by double Shift) -->
    <AssistantFloat />
  </div>
</template>
