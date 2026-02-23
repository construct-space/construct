<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const credits = useCredits()
const { pool, userAllocation, allocations, packages, transactions, balance, userRemaining, userUsedThisMonth, hasUnlimitedAllocation, usagePercentage, isLowCredits, formatCredits, formatPrice, getTransactionTypeLabel, getTransactionTypeColor } = credits
const toast = useToast()

const loading = ref(true)
const actionLoading = ref(false)
const showPurchaseModal = ref(false)
const showAllocationModal = ref(false)
const editingAllocation = ref<{ userId: number; monthlyLimit: number } | null>(null)

const isAdmin = computed(() => true)

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function purchasePackage(packageId: number) {
  actionLoading.value = true
  try {
    const url = await credits.purchaseCredits({
      package_id: packageId,
      success_url: `${window.location.origin}/app/settings/credits?purchase=success`,
      cancel_url: window.location.href,
    })
    window.location.href = url
  } catch {
    toast.add({ title: 'Failed to start purchase', color: 'error' })
  } finally {
    actionLoading.value = false
    showPurchaseModal.value = false
  }
}

function openAllocationEdit(userId: number, currentLimit: number) {
  editingAllocation.value = { userId, monthlyLimit: currentLimit }
  showAllocationModal.value = true
}

async function saveAllocation() {
  if (!editingAllocation.value) return
  actionLoading.value = true
  try {
    await credits.updateAllocations([{ user_id: editingAllocation.value.userId, monthly_limit: editingAllocation.value.monthlyLimit }])
    toast.add({ title: 'Allocation updated', color: 'success' })
    showAllocationModal.value = false
    editingAllocation.value = null
  } catch {
    toast.add({ title: 'Failed to update allocation', color: 'error' })
  } finally {
    actionLoading.value = false
  }
}

onMounted(async () => {
  try {
    await Promise.all([credits.fetchCredits(), credits.fetchPackages(), credits.fetchTransactions()])
  } catch {
    toast.add({ title: 'Failed to load credits information', color: 'error' })
  } finally {
    loading.value = false
  }

  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('purchase') === 'success') {
    toast.add({ title: 'Credits added to your account', color: 'success' })
    window.history.replaceState({}, '', window.location.pathname)
    credits.fetchCredits()
    credits.fetchTransactions()
  }
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <Button size="sm" label="Buy Credits" @click="showPurchaseModal = true" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-[var(--app-muted)]" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <template v-else>
      <!-- Stats -->
      <div class="grid grid-cols-3 gap-4 mb-8">
        <div>
          <p class="text-xs text-[var(--app-muted)] uppercase tracking-wider mb-1">Company Balance</p>
          <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ formatCredits(balance) }}</p>
          <p v-if="isLowCredits" class="text-xs text-amber-500 mt-1">Low credit balance</p>
        </div>
        <div>
          <p class="text-xs text-[var(--app-muted)] uppercase tracking-wider mb-1">Your Remaining</p>
          <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ hasUnlimitedAllocation ? 'Unlimited' : formatCredits(userRemaining) }}</p>
          <div v-if="!hasUnlimitedAllocation" class="mt-2">
            <div class="flex justify-between text-xs text-[var(--app-muted)] mb-1">
              <span>Used this month</span>
              <span>{{ userUsedThisMonth }} / {{ userAllocation?.monthly_limit }}</span>
            </div>
            <div class="w-full bg-[color-mix(in_srgb,var(--app-muted)_15%,transparent)] rounded-full h-1.5">
              <div
                class="h-1.5 rounded-full transition-all"
                :class="usagePercentage > 80 ? 'bg-amber-500' : 'bg-app-accent'"
                :style="{ width: `${usagePercentage}%` }"
              />
            </div>
          </div>
        </div>
        <div>
          <p class="text-xs text-[var(--app-muted)] uppercase tracking-wider mb-1">Total Used</p>
          <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ formatCredits(pool?.total_used || 0) }}</p>
        </div>
      </div>

      <!-- Team Allocations -->
      <div v-if="isAdmin && allocations.length > 0" class="mb-8">
        <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-1">Team Allocations</h3>
        <p class="text-xs text-[var(--app-muted)] mb-3">Set monthly credit limits per user. Use -1 for unlimited.</p>
        <div class="rounded-lg border border-[var(--app-border)] overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">User</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Limit</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Used</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Remaining</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-[var(--app-muted)] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--app-border)]">
              <tr v-for="alloc in allocations" :key="alloc.id">
                <td class="px-4 py-2 text-[var(--app-foreground)]">User #{{ alloc.user_id }}</td>
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ alloc.monthly_limit === -1 ? 'Unlimited' : formatCredits(alloc.monthly_limit) }}</td>
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ formatCredits(alloc.used_this_month) }}</td>
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ alloc.monthly_limit === -1 ? '-' : formatCredits(alloc.remaining) }}</td>
                <td class="px-4 py-2 text-right">
                  <Button variant="ghost" size="xs" label="Edit" @click="openAllocationEdit(alloc.user_id, alloc.monthly_limit)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Transactions -->
      <div v-if="transactions.length > 0">
        <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-3">Recent Activity</h3>
        <div class="rounded-lg border border-[var(--app-border)] overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Date</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Type</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-[var(--app-muted)] uppercase">Description</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-[var(--app-muted)] uppercase">Amount</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-[var(--app-muted)] uppercase">Balance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--app-border)]">
              <tr v-for="tx in transactions" :key="tx.id">
                <td class="px-4 py-2 text-[var(--app-muted)]">{{ formatDate(tx.created_at) }}</td>
                <td class="px-4 py-2">
                  <span :class="['px-1.5 py-0.5 text-[10px] rounded-full', `bg-${getTransactionTypeColor(tx.type)}-500/10 text-${getTransactionTypeColor(tx.type)}-500`]">
                    {{ getTransactionTypeLabel(tx.type) }}
                  </span>
                </td>
                <td class="px-4 py-2 text-[var(--app-foreground)]">{{ tx.description }}</td>
                <td class="px-4 py-2 text-right font-medium" :class="tx.amount > 0 ? 'text-green-500' : 'text-red-500'">
                  {{ tx.amount > 0 ? '+' : '' }}{{ formatCredits(tx.amount) }}
                </td>
                <td class="px-4 py-2 text-right text-[var(--app-muted)]">{{ formatCredits(tx.balance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else class="text-sm text-[var(--app-muted)]">No transactions yet</p>
    </template>

    <!-- Purchase modal -->
    <Teleport to="body">
      <div v-if="showPurchaseModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showPurchaseModal = false">
        <div class="bg-[var(--app-background)] rounded-lg border border-[var(--app-border)] p-6 max-w-sm w-full mx-4">
          <h3 class="text-lg font-semibold text-[var(--app-foreground)] mb-2">Buy Credits</h3>
          <div class="space-y-3">
            <button
              v-for="pkg in packages"
              :key="pkg.id"
              class="w-full p-4 border border-[var(--app-border)] rounded-lg hover:border-[var(--app-accent)] transition-colors text-left cursor-pointer"
              :disabled="actionLoading"
              @click="purchasePackage(pkg.id)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-semibold text-[var(--app-foreground)]">{{ pkg.name }}</div>
                  <div class="text-xs text-[var(--app-muted)]">{{ pkg.description }}</div>
                </div>
                <div class="text-right">
                  <div class="font-bold text-[var(--app-foreground)]">{{ formatPrice(pkg.price_cents, pkg.currency) }}</div>
                  <div class="text-xs text-[var(--app-muted)]">{{ (pkg.price_cents / pkg.credits).toFixed(2) }}c/credit</div>
                </div>
              </div>
            </button>
          </div>
          <div class="mt-4 flex justify-end">
            <Button variant="ghost" label="Cancel" @click="showPurchaseModal = false" />
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Allocation edit modal -->
    <Teleport to="body">
      <div v-if="showAllocationModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAllocationModal = false">
        <div class="bg-[var(--app-background)] rounded-lg border border-[var(--app-border)] p-6 max-w-sm w-full mx-4">
          <h3 class="text-lg font-semibold text-[var(--app-foreground)] mb-2">Edit Credit Allocation</h3>
          <div v-if="editingAllocation" class="space-y-4">
            <div class="flex gap-2">
              <Input v-model="editingAllocation.monthlyLimit" type="number" placeholder="Monthly limit" />
              <Button variant="soft" size="sm" label="Unlimited" @click="editingAllocation.monthlyLimit = -1" />
            </div>
            <p class="text-xs text-[var(--app-muted)]">
              {{ editingAllocation.monthlyLimit === -1 ? 'Unlimited access to company pool' : `Up to ${formatCredits(editingAllocation.monthlyLimit)} credits/month` }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button v-for="preset in [50, 100, 200, 500, 1000]" :key="preset" variant="outline" size="xs" :label="formatCredits(preset)" @click="editingAllocation.monthlyLimit = preset" />
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" label="Cancel" @click="showAllocationModal = false" />
            <Button label="Save" :loading="actionLoading" @click="saveAllocation" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
