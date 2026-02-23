<template>
  <div class="px-4 py-2 border-b border-gray-200/50 dark:border-gray-800/50 bg-blue-500/5">
    <div class="flex items-center gap-2 text-xs text-app-muted">
      <Icon name="i-lucide-book-open" class="size-3.5 text-blue-500" />
      <span>Docs Assistant active</span>
    </div>
    <p class="text-[11px] text-app-muted mt-1">
      Write PRDs, architecture docs, READMEs, and more. Use ^DocTitle to reference existing documents.
    </p>
    <div class="flex flex-wrap gap-1.5 mt-1.5">
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Write a PRD</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Create README</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">Draft architecture doc</span>
    </div>
  </div>
</template>
