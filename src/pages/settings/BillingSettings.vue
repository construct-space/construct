<script setup lang="ts">
import Button from '@/components/ui/Button.vue'

const billing = useBilling()
const { subscription, plans, invoices, isSubscribed, isTrialing, trialDaysRemaining, currentPlan, monthlyPrice, formatPrice, getStatusColor } = billing
const toast = useToast()

const loading = ref(true)
const actionLoading = ref(false)
const showCancelConfirm = ref(false)
const firstPlan = computed(() => plans.value[0] ?? null)

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function openBillingPortal() {
  actionLoading.value = true
  try {
    const url = await billing.createPortalSession(window.location.href)
    window.location.href = url
  } catch {
    toast.add({ title: 'Failed to open billing portal', color: 'error' })
  } finally {
    actionLoading.value = false
  }
}

async function subscribe(planSlug: string) {
  actionLoading.value = true
  try {
    const successUrl = `${window.location.origin}/#/app/settings/billing?success=true`
    const cancelUrl = `${window.location.origin}/#/app/settings/billing`
    const url = await billing.createCheckout(planSlug, successUrl, cancelUrl)
    window.location.href = url
  } catch {
    toast.add({ title: 'Failed to start checkout', color: 'error' })
  } finally {
    actionLoading.value = false
  }
}

async function confirmCancel() {
  if (!subscription.value) return
  showCancelConfirm.value = false
  actionLoading.value = true
  try {
    await billing.cancelSubscription()
    toast.add({ title: 'Subscription canceled', description: 'Ends at current billing period', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to cancel subscription', color: 'error' })
  } finally {
    actionLoading.value = false
  }
}

onMounted(async () => {
  try {
    await Promise.all([billing.fetchSubscription(), billing.fetchPlans(), billing.fetchInvoices()])
  } catch {
    toast.add({ title: 'Failed to load billing information', color: 'error' })
  } finally {
    loading.value = false
  }

  const hash = window.location.hash
  if (hash.includes('success=true')) {
    toast.add({ title: 'Your subscription is now active', color: 'success' })
    window.history.replaceState({}, '', window.location.pathname + '#/app/settings/billing')
    billing.fetchSubscription()
  }
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <Button v-if="isSubscribed" variant="outline" size="sm" label="Manage Billing" :loading="actionLoading" @click="openBillingPortal" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-[var(--app-muted)]" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <template v-else>
      <!-- Current subscription -->
      <div v-if="subscription" class="p-6 rounded-lg border border-[var(--app-border)] mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-sm font-semibold text-[var(--app-foreground)]">Current Plan</h3>
            <div class="mt-2 flex items-center gap-3">
              <span class="text-2xl font-bold text-[var(--app-foreground)]">{{ currentPlan?.name || 'Construct' }}</span>
              <span
                class="px-2 py-0.5 text-xs rounded-full"
                :class="`bg-${getStatusColor(subscription.status)}-500/10 text-${getStatusColor(subscription.status)}-500`"
              >
                {{ subscription.status }}
              </span>
            </div>
            <p v-if="isTrialing" class="text-sm text-[var(--app-muted)] mt-1">Trial ends in {{ trialDaysRemaining }} days</p>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-[var(--app-foreground)]">{{ formatPrice(monthlyPrice, currentPlan?.currency) }}</div>
            <div class="text-sm text-[var(--app-muted)]">/ {{ currentPlan?.billing_interval || 'month' }}</div>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-[var(--app-border)] grid grid-cols-3 gap-4 text-sm">
          <div>
            <div class="text-[var(--app-muted)]">Current Period</div>
            <div class="font-medium text-[var(--app-foreground)]">{{ formatDate(subscription.current_period_start) }}</div>
          </div>
          <div>
            <div class="text-[var(--app-muted)]">Renews On</div>
            <div class="font-medium text-[var(--app-foreground)]">{{ subscription.current_period_end ? formatDate(subscription.current_period_end) : '-' }}</div>
          </div>
          <div v-if="subscription.days_until_renewal > 0">
            <div class="text-[var(--app-muted)]">Days Until Renewal</div>
            <div class="font-medium text-[var(--app-foreground)]">{{ subscription.days_until_renewal }}</div>
          </div>
        </div>

        <div class="mt-6 flex gap-3">
          <Button variant="soft" label="Manage Subscription" :loading="actionLoading" @click="openBillingPortal" />
          <Button v-if="!subscription.cancel_at_period_end" variant="ghost" color="error" label="Cancel Subscription" :loading="actionLoading" @click="showCancelConfirm = true" />
          <span v-else class="text-sm text-amber-500 flex items-center gap-1">Cancels at period end</span>
        </div>
      </div>

      <!-- No subscription -->
      <div v-else class="text-center py-8">
        <h3 class="text-xl font-semibold text-[var(--app-foreground)]">Construct Pro</h3>
        <p class="text-[var(--app-muted)] mt-1 mb-6">Everything you need to build, ship, and manage software</p>

        <div v-if="firstPlan" class="max-w-sm mx-auto p-6 rounded-lg border-2 border-[var(--app-accent)]">
          <h4 class="text-xl font-bold text-[var(--app-foreground)]">{{ firstPlan.name }}</h4>
          <p v-if="firstPlan.description" class="text-sm text-[var(--app-muted)] mt-1">{{ firstPlan.description }}</p>
          <div class="mt-4">
            <span class="text-3xl font-bold text-[var(--app-foreground)]">{{ formatPrice(firstPlan.price_per_user_cents, firstPlan.currency) }}</span>
            <span v-if="firstPlan.billing_interval" class="text-[var(--app-muted)]">/{{ firstPlan.billing_interval }}</span>
          </div>
          <ul class="mt-6 space-y-2 text-sm text-left">
            <li class="flex items-center gap-2 text-[var(--app-foreground)]">
              <svg class="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12" /></svg>
              Unlimited projects
            </li>
            <li class="flex items-center gap-2 text-[var(--app-foreground)]">
              <svg class="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12" /></svg>
              AI-powered development tools
            </li>
            <li class="flex items-center gap-2 text-[var(--app-foreground)]">
              <svg class="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12" /></svg>
              {{ firstPlan.ai_credits_per_user }} AI credits / month
            </li>
            <li v-if="firstPlan.trial_days > 0" class="flex items-center gap-2 text-[var(--app-foreground)]">
              <svg class="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12" /></svg>
              {{ firstPlan.trial_days }}-day free trial
            </li>
          </ul>
          <Button class="mt-6" block label="Subscribe" :loading="actionLoading" @click="subscribe(firstPlan.slug)" />
        </div>

        <p v-else class="text-sm text-[var(--app-muted)]">No plans available at the moment</p>
      </div>

      <!-- Invoice history -->
      <div v-if="invoices.length > 0" class="mt-8">
        <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-4">Invoice History</h3>
        <div class="rounded-lg border border-[var(--app-border)] overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Date</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Description</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Amount</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--app-border)]">
              <tr v-for="invoice in invoices" :key="invoice.id">
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ formatDate(invoice.created_at) }}</td>
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ invoice.description || '-' }}</td>
                <td class="px-4 py-2 font-medium text-[var(--app-foreground)]">{{ formatPrice(invoice.amount_due_cents, invoice.currency) }}</td>
                <td class="px-4 py-2">
                  <span :class="['px-1.5 py-0.5 text-[10px] rounded-full', invoice.status === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500']">
                    {{ invoice.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Cancel confirmation -->
    <Teleport to="body">
      <div v-if="showCancelConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showCancelConfirm = false">
        <div class="bg-[var(--app-background)] rounded-lg border border-[var(--app-border)] p-6 max-w-sm w-full mx-4 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--app-foreground)]">Cancel Subscription</h3>
          <div class="flex justify-end gap-3">
            <Button variant="soft" label="Keep Subscription" @click="showCancelConfirm = false" />
            <Button color="error" label="Cancel Subscription" :loading="actionLoading" @click="confirmCancel" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
