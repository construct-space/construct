<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVibeEngine } from '@/composables/useVibeEngine'

const route = useRoute()
const router = useRouter()
const vibe = useVibeEngine()

const projectRoute = computed(() => {
  const raw = route.params.projectId
  return typeof raw === 'string' && raw ? `/app/projects/${raw}` : ''
})

const architectRoute = computed(() => {
  return projectRoute.value ? `${projectRoute.value}/architect` : '/app/architect'
})

const sourceLabel = computed(() => {
  const source = vibe.session.value?.source || vibe.handoff.value?.source || route.query.source
  if (typeof source !== 'string' || !source) return 'manual'
  return source.replace(/[-_]/g, ' ')
})

function submitDraft() {
  vibe.submitPrompt()
}
</script>

<template>
  <div class="min-h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--app-accent)_18%,transparent),transparent_42%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_34%)]">
    <div class="mx-auto flex h-full max-w-[1780px] flex-col gap-4 px-4 py-5 sm:px-6">
      <section class="rounded-[28px] border border-app bg-[color-mix(in_srgb,var(--app-background),white_4%)]/92 px-5 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:px-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <div class="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">
              <Icon name="i-lucide-zap" class="size-3.5" />
              Vibe Execution Engine
            </div>
            <div class="space-y-2">
              <h1 class="max-w-3xl text-3xl font-semibold tracking-tight text-app sm:text-[2.35rem]">
                Build through phased execution, not chat drift.
              </h1>
              <p class="max-w-3xl text-sm leading-6 text-app-muted sm:text-[15px]">
                Vibe is the execution surface for Construct. It turns a goal or Architect handoff into a live
                research → plan → implement → verify → review → summarize run, while keeping every step inspectable.
              </p>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
            <button
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-app bg-white/5 px-4 py-3 text-sm font-medium text-app transition hover:bg-white/8"
              @click="router.push(architectRoute)"
            >
              <Icon name="i-lucide-compass" class="size-4" />
              Open Architect
            </button>
            <button
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-app bg-white/5 px-4 py-3 text-sm font-medium text-app transition hover:bg-white/8"
              :disabled="vibe.isRunning.value"
              @click="vibe.resetSession()"
            >
              <Icon name="i-lucide-rotate-ccw" class="size-4" />
              New Session
            </button>
            <button
              class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition"
              :class="vibe.isRunning.value
                ? 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                : 'bg-[var(--app-accent)] text-[var(--app-accent-foreground)] hover:opacity-90'"
              @click="vibe.isRunning.value ? vibe.stopListening() : submitDraft()"
            >
              <Icon :name="vibe.isRunning.value ? 'i-lucide-square' : 'i-lucide-play'" class="size-4" />
              {{ vibe.isRunning.value ? 'Stop Listening' : 'Run Goal' }}
            </button>
            <button
              v-if="projectRoute"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-app bg-white/5 px-4 py-3 text-sm font-medium text-app transition hover:bg-white/8"
              @click="router.push(projectRoute)"
            >
              <Icon name="i-lucide-folder" class="size-4" />
              Back To Project
            </button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-4">
          <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.14em] text-app-muted/70">Session</p>
            <p class="mt-1 text-sm font-medium text-app">{{ vibe.status.value }}</p>
            <p v-if="vibe.session.value?.session_id" class="mt-1 text-[11px] text-app-muted">{{ vibe.session.value?.session_id }}</p>
          </div>
          <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.14em] text-app-muted/70">Project</p>
            <p class="mt-1 text-sm font-medium text-app">{{ vibe.currentProject.value?.name || 'Global session' }}</p>
            <p class="mt-1 text-[11px] text-app-muted">{{ vibe.projectPath.value || 'No project path bound yet' }}</p>
          </div>
          <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.14em] text-app-muted/70">Routing</p>
            <p class="mt-1 text-sm font-medium text-app">{{ vibe.routeInfo.value?.model || 'auto' }}</p>
            <p class="mt-1 text-[11px] text-app-muted">{{ vibe.routeInfo.value?.reason || 'Smart routing active' }}</p>
          </div>
          <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.14em] text-app-muted/70">Source</p>
            <p class="mt-1 text-sm font-medium text-app capitalize">{{ sourceLabel }}</p>
            <p class="mt-1 text-[11px] text-app-muted">{{ vibe.handoff.value ? 'Architect handoff attached' : 'Direct execution prompt' }}</p>
          </div>
        </div>
      </section>

      <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.08fr_1.15fr_0.85fr]">
        <section class="min-h-[460px] rounded-[28px] border border-app bg-[color-mix(in_srgb,var(--app-background),white_2%)]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
          <div class="flex h-full flex-col">
            <div class="mb-4 flex items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted/70">Goal</p>
                <h2 class="mt-1 text-lg font-semibold text-app">Conversation</h2>
              </div>
              <div
                v-if="vibe.handoff.value"
                class="rounded-full border border-app bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-app-muted"
              >
                handoff
              </div>
            </div>

            <div class="mb-4 rounded-3xl border border-amber-400/15 bg-amber-400/6 p-4">
              <p class="text-[11px] uppercase tracking-[0.16em] text-amber-200/80">Working goal</p>
              <p class="mt-2 text-sm leading-6 text-app">
                {{ vibe.session.value?.goal || vibe.draft.value || 'Describe what Vibe should build, change, or verify.' }}
              </p>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto pr-1">
              <div v-if="vibe.messages.value.length === 0" class="space-y-3">
                <div class="rounded-3xl border border-dashed border-app bg-white/[0.03] p-5">
                  <p class="text-sm font-medium text-app">No session messages yet.</p>
                  <p class="mt-2 text-sm leading-6 text-app-muted">
                    Start with a concrete objective, like “Build the activity join flow from the PlayUp handoff and verify the first vertical slice.”
                  </p>
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    class="rounded-2xl border border-app bg-white/[0.03] px-4 py-3 text-left text-sm text-app transition hover:bg-white/[0.06]"
                    @click="vibe.draft.value = 'Build the first vertical slice from the current handoff and verify it end to end.'"
                  >
                    Build first vertical slice
                  </button>
                  <button
                    class="rounded-2xl border border-app bg-white/[0.03] px-4 py-3 text-left text-sm text-app transition hover:bg-white/[0.06]"
                    @click="vibe.draft.value = 'Research the current project, plan the next milestone, implement it, and review the result.'"
                  >
                    Plan and implement next milestone
                  </button>
                </div>
              </div>

              <div v-else class="space-y-3">
                <article
                  v-for="message in vibe.messages.value"
                  :key="message.id"
                  class="rounded-3xl border px-4 py-3"
                  :class="message.role === 'user'
                    ? 'ml-5 border-app bg-[var(--app-accent)]/10'
                    : 'mr-5 border-app bg-white/[0.03]'"
                >
                  <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">
                    {{ message.role === 'user' ? 'You' : 'Vibe' }}
                  </p>
                  <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-app">{{ message.content }}</p>
                </article>
              </div>
            </div>

            <div class="mt-4 space-y-3 border-t border-app pt-4">
              <textarea
                v-model="vibe.draft.value"
                rows="4"
                class="w-full rounded-3xl border border-app bg-black/10 px-4 py-3 text-sm text-app outline-none transition placeholder:text-app-muted/45 focus:border-[var(--app-accent)]/30 focus:ring-1 focus:ring-[var(--app-accent)]/20"
                placeholder="Tell Vibe what to build, verify, or change..."
                @keydown.meta.enter.prevent="submitDraft()"
                @keydown.ctrl.enter.prevent="submitDraft()"
              />
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-[11px] uppercase tracking-[0.15em] text-app-muted/65">
                  {{ vibe.handoff.value ? 'Architect handoff is attached to this run.' : 'Direct goal mode.' }}
                </p>
                <button
                  class="inline-flex items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--app-accent-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                  :disabled="!vibe.draft.value.trim() || vibe.isRunning.value"
                  @click="submitDraft()"
                >
                  <Icon name="i-lucide-arrow-up-right" class="size-4" />
                  Run Vibe
                </button>
              </div>
              <p v-if="vibe.error.value" class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ vibe.error.value }}
              </p>
            </div>
          </div>
        </section>

        <section class="min-h-[460px] rounded-[28px] border border-app bg-[color-mix(in_srgb,var(--app-background),white_2%)]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
          <div class="flex h-full flex-col">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted/70">Execution</p>
                <h2 class="mt-1 text-lg font-semibold text-app">Timeline</h2>
              </div>
              <div class="rounded-full border border-app bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-app-muted">
                {{ vibe.plan.value?.phases?.length || 0 }} phases
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Spaces</p>
                <p class="mt-2 text-sm text-app">{{ vibe.activeSpaces.value.length ? vibe.activeSpaces.value.join(', ') : 'Pending plan' }}</p>
              </div>
              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Verify</p>
                <p class="mt-2 text-sm font-medium text-app">{{ vibe.verifyStatus.value || 'Pending' }}</p>
              </div>
              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Review</p>
                <p class="mt-2 text-sm font-medium text-app">{{ vibe.reviewStatus.value || 'Pending' }}</p>
              </div>
            </div>

            <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div v-if="vibe.timeline.value.length === 0" class="rounded-3xl border border-dashed border-app bg-white/[0.03] p-6">
                <p class="text-sm font-medium text-app">No execution events yet.</p>
                <p class="mt-2 text-sm leading-6 text-app-muted">
                  Once Vibe starts, phase planning and execution events will stream here in real time from the brain.
                </p>
              </div>

              <div v-else class="space-y-3">
                <article
                  v-for="entry in vibe.timeline.value"
                  :key="entry.id"
                  class="rounded-3xl border border-app bg-white/[0.03] px-4 py-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/65">{{ entry.kind }}</p>
                      <h3 class="mt-1 text-sm font-semibold text-app">{{ entry.title }}</h3>
                    </div>
                    <span
                      class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      :class="entry.status === 'failed' || entry.status === 'blocked'
                        ? 'bg-red-500/10 text-red-200'
                        : entry.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : 'bg-white/8 text-app-muted'"
                    >
                      {{ entry.status }}
                    </span>
                  </div>
                  <p v-if="entry.detail" class="mt-2 whitespace-pre-wrap text-sm leading-6 text-app-muted">{{ entry.detail }}</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <aside class="min-h-[460px] rounded-[28px] border border-app bg-[color-mix(in_srgb,var(--app-background),white_2%)]/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
          <div class="flex h-full flex-col">
            <div class="mb-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted/70">Artifacts</p>
              <h2 class="mt-1 text-lg font-semibold text-app">Session Output</h2>
            </div>

            <div class="space-y-3 overflow-y-auto pr-1">
              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Plan reason</p>
                <p class="mt-2 text-sm text-app">{{ vibe.plan.value?.reason || 'Awaiting execution plan' }}</p>
              </div>

              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Phases</p>
                <div v-if="vibe.plan.value?.phases?.length" class="mt-2 space-y-2">
                  <div
                    v-for="phase in vibe.plan.value.phases"
                    :key="phase.id"
                    class="rounded-xl bg-white/[0.03] px-3 py-2"
                  >
                    <p class="text-sm font-medium text-app">{{ phase.kind }}<span v-if="phase.domain">:{{ phase.domain }}</span></p>
                    <p class="mt-1 text-[12px] leading-5 text-app-muted">{{ phase.goal }}</p>
                  </div>
                </div>
                <p v-else class="mt-2 text-sm text-app-muted">No orchestration plan received yet.</p>
              </div>

              <div class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Artifacts</p>
                <div v-if="vibe.artifacts.value.length" class="mt-2 space-y-2">
                  <article
                    v-for="artifact in vibe.artifacts.value"
                    :key="artifact.id"
                    class="rounded-xl bg-white/[0.03] px-3 py-2"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-medium text-app">{{ artifact.title }}</p>
                      <span class="text-[10px] uppercase tracking-[0.16em] text-app-muted">{{ artifact.executor }}</span>
                    </div>
                    <p class="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-app-muted">{{ artifact.preview }}</p>
                  </article>
                </div>
                <p v-else class="mt-2 text-sm text-app-muted">Artifacts will appear as implementation, verify, and review phases complete.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
