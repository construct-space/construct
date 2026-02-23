<script setup lang="ts">
/**
 * Calendar Space - Monthly calendar with events
 */
import type { Event, CreateEventRequest, UpdateEventRequest } from '~/types/event'

const route = useRoute()
const authStore = useAuthStore()
const eventsStore = useEventsStore()
const projectStore = useProjectStore()
const toast = useToast()
const { setPageItems, setSearch, clearToolbar } = useToolbar()

const projectId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? Number(id) : undefined
})
const isProjectScope = computed(() => !!projectId.value)

// Calendar state
const currentDate = ref(new Date())
const showCreateModal = ref(false)
const showViewModal = ref(false)
const selectedDate = ref<Date | null>(null)
const selectedEvent = ref<Event | null>(null)
const isSubmitting = ref(false)
const isDeleting = ref(false)
const searchQuery = ref('')

// Format time for calendar grid
const formatShortTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '')
}

// Format datetime-local for API
const formatForAPI = (dateTimeLocal: string): string => {
  if (!dateTimeLocal) return ''
  return `${dateTimeLocal}:00`
}

// Calendar navigation
const currentMonth = computed(() => currentDate.value.getMonth())
const currentYear = computed(() => currentDate.value.getFullYear())
const monthName = computed(() => currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Generate calendar days (Monday-first week)
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const startDay = (firstDay.getDay() + 6) % 7
  const lastDay = new Date(year, month + 1, 0)
  const totalDays = lastDay.getDate()
  const prevMonth = new Date(year, month, 0)
  const prevMonthDays = prevMonth.getDate()

  const days: Array<{ date: number; month: 'prev' | 'current' | 'next'; isToday: boolean; fullDate: Date }> = []

  for (let i = startDay - 1; i >= 0; i--) {
    const date = prevMonthDays - i
    days.push({ date, month: 'prev', isToday: false, fullDate: new Date(year, month - 1, date) })
  }

  const today = new Date()
  for (let i = 1; i <= totalDays; i++) {
    const isToday = today.getDate() === i && today.getMonth() === month && today.getFullYear() === year
    days.push({ date: i, month: 'current', isToday, fullDate: new Date(year, month, i) })
  }

  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    days.push({ date: i, month: 'next', isToday: false, fullDate: new Date(year, month + 1, i) })
  }

  return days
})

// Filter events by search query
const filteredEventsForDay = (date: Date) => {
  const events = eventsStore.eventsByDate(date)
  if (!searchQuery.value) return events
  const query = searchQuery.value.toLowerCase()
  return events.filter(event =>
    event.title.toLowerCase().includes(query)
    || event.description?.toLowerCase().includes(query)
    || event.location?.toLowerCase().includes(query),
  )
}

const goToPrevMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1) }
const goToNextMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1) }
const goToToday = () => { currentDate.value = new Date() }

const openAddEvent = (date?: Date) => {
  selectedDate.value = date || new Date()
  selectedEvent.value = null
  showCreateModal.value = true
}

const openEventView = (event: Event, e: MouseEvent) => {
  e.stopPropagation()
  selectedEvent.value = event
  showViewModal.value = true
}

// Create form state
const formTitle = ref('')
const formDescription = ref('')
const formStartTime = ref('')
const formEndTime = ref('')
const formColor = ref('#6366f1')
const formLocation = ref('')
const formAllDay = ref(false)

const resetForm = () => {
  formTitle.value = ''
  formDescription.value = ''
  formStartTime.value = ''
  formEndTime.value = ''
  formColor.value = '#6366f1'
  formLocation.value = ''
  formAllDay.value = false
}

// Pre-fill form when opening create modal with a date
watch(showCreateModal, (open) => {
  if (open && selectedDate.value) {
    const d = selectedDate.value
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    formStartTime.value = `${yyyy}-${mm}-${dd}T09:00`
    formEndTime.value = `${yyyy}-${mm}-${dd}T10:00`

    // If editing, populate from event
    if (selectedEvent.value) {
      formTitle.value = selectedEvent.value.title
      formDescription.value = selectedEvent.value.description || ''
      formStartTime.value = selectedEvent.value.start_time.slice(0, 16)
      formEndTime.value = selectedEvent.value.end_time.slice(0, 16)
      formColor.value = selectedEvent.value.color || '#6366f1'
      formLocation.value = selectedEvent.value.location || ''
      formAllDay.value = selectedEvent.value.all_day
    } else {
      resetForm()
      formStartTime.value = `${yyyy}-${mm}-${dd}T09:00`
      formEndTime.value = `${yyyy}-${mm}-${dd}T10:00`
    }
  }
})

const handleCreate = async () => {
  if (!formTitle.value.trim()) {
    toast.add({ title: 'Error', description: 'Event title is required', color: 'error' })
    return
  }

  isSubmitting.value = true
  try {
    const data: CreateEventRequest = {
      title: formTitle.value,
      description: formDescription.value || undefined,
      start_time: formatForAPI(formStartTime.value),
      end_time: formatForAPI(formEndTime.value),
      color: formColor.value,
      location: formLocation.value || undefined,
      all_day: formAllDay.value,
    }
    const result = await eventsStore.createEvent(data)
    if (result.success) {
      toast.add({ title: 'Event created', color: 'success' })
      showCreateModal.value = false
      resetForm()
    } else {
      toast.add({ title: 'Error', description: result.error || 'Failed', color: 'error' })
    }
  } catch (error) {
    toast.add({ title: 'Error', description: (error as Error).message, color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const handleUpdate = async () => {
  if (!selectedEvent.value || !formTitle.value.trim()) return

  isSubmitting.value = true
  try {
    const data: UpdateEventRequest = {
      title: formTitle.value,
      description: formDescription.value || undefined,
      start_time: formatForAPI(formStartTime.value),
      end_time: formatForAPI(formEndTime.value),
      color: formColor.value,
      location: formLocation.value || undefined,
      all_day: formAllDay.value,
    }
    const result = await eventsStore.updateEvent(selectedEvent.value.id, data)
    if (result.success) {
      toast.add({ title: 'Event updated', color: 'success' })
      showCreateModal.value = false
      selectedEvent.value = null
      resetForm()
    } else {
      toast.add({ title: 'Error', description: result.error || 'Failed', color: 'error' })
    }
  } catch (error) {
    toast.add({ title: 'Error', description: (error as Error).message, color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const startEditing = () => {
  showViewModal.value = false
  if (selectedEvent.value) {
    selectedDate.value = new Date(selectedEvent.value.start_time)
    showCreateModal.value = true
  }
}

const handleDelete = async () => {
  if (!selectedEvent.value) return

  isDeleting.value = true
  try {
    const result = await eventsStore.deleteEvent(selectedEvent.value.id)
    if (result.success) {
      toast.add({ title: 'Event deleted', color: 'success' })
      showViewModal.value = false
      selectedEvent.value = null
    } else {
      toast.add({ title: 'Error', description: result.error || 'Failed', color: 'error' })
    }
  } catch (error) {
    toast.add({ title: 'Error', description: (error as Error).message, color: 'error' })
  } finally {
    isDeleting.value = false
  }
}

const syncToolbar = () => {
  setPageItems([
    { id: 'calendar-prev', icon: 'i-lucide-chevron-left', label: 'Previous', type: 'action', category: 'space', onClick: goToPrevMonth },
    { id: 'calendar-today', icon: 'i-lucide-calendar-check', label: 'Today', type: 'action', category: 'space', onClick: goToToday },
    { id: 'calendar-next', icon: 'i-lucide-chevron-right', label: 'Next', type: 'action', category: 'space', onClick: goToNextMonth },
    { id: 'calendar-add', icon: 'i-lucide-plus', label: 'Add Event', type: 'action', category: 'space', onClick: () => openAddEvent() },
  ])
  setSearch('Search events...', (query) => { searchQuery.value = query })
}

onMounted(async () => {
  syncToolbar()
  if (isProjectScope.value && projectId.value) {
    await eventsStore.fetchProjectEvents(projectId.value)
  } else if (authStore.user?.company_id) {
    await eventsStore.fetchCompanyEvents(authStore.user.company_id)
  }
})

onUnmounted(() => { clearToolbar() })
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <div class="flex-1 overflow-auto p-4">
      <!-- Month Header -->
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-semibold text-app">{{ monthName }}</h1>
        <div class="flex items-center gap-1">
          <Button icon="i-lucide-chevron-left" variant="ghost" size="xs" @click="goToPrevMonth" />
          <Button label="Today" variant="soft" size="xs" @click="goToToday" />
          <Button icon="i-lucide-chevron-right" variant="ghost" size="xs" @click="goToNextMonth" />
        </div>
      </div>

      <!-- Week Day Headers -->
      <div class="grid grid-cols-7 mb-1">
        <div
          v-for="day in weekDays"
          :key="day"
          class="text-center text-xs font-medium text-app-muted uppercase tracking-wider py-2"
        >
          {{ day }}
        </div>
      </div>

      <!-- Calendar Grid -->
      <div class="grid grid-cols-7 gap-px bg-white/5 rounded-lg overflow-hidden">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="min-h-24 p-2 bg-app transition-colors cursor-pointer hover:bg-white/5"
          :class="{
            'opacity-40': day.month !== 'current',
            'ring-2 ring-inset ring-(--app-accent)': day.isToday,
          }"
          @click="openAddEvent(day.fullDate)"
        >
          <span
            class="inline-flex items-center justify-center w-6 h-6 text-xs rounded"
            :class="{
              'bg-(--app-accent) text-white': day.isToday,
              'text-app': !day.isToday && day.month === 'current',
              'text-app-muted': day.month !== 'current',
            }"
          >
            {{ day.date }}
          </span>

          <!-- Events -->
          <div class="mt-1 space-y-0.5">
            <div
              v-for="event in filteredEventsForDay(day.fullDate)"
              :key="event.id"
              class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-90 transition-opacity truncate"
              :style="{ backgroundColor: event.color || 'var(--app-accent)', color: 'white' }"
              @click="openEventView(event, $event)"
            >
              <span class="truncate">{{ event.title }}</span>
              <span class="opacity-70 shrink-0">{{ formatShortTime(event.start_time) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- View Event Modal -->
    <Modal v-model:open="showViewModal">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: selectedEvent?.color || 'var(--app-accent)' }" />
          <h2 class="text-xl font-medium text-app">{{ selectedEvent?.title }}</h2>
        </div>
      </template>
      <template #body>
        <div v-if="selectedEvent" class="space-y-3">
          <div class="flex items-center gap-2 text-sm text-app-muted">
            <Icon name="i-lucide-clock" class="size-4" />
            <span>{{ new Date(selectedEvent.start_time).toLocaleString() }} — {{ new Date(selectedEvent.end_time).toLocaleString() }}</span>
          </div>
          <div v-if="selectedEvent.location" class="flex items-center gap-2 text-sm text-app-muted">
            <Icon name="i-lucide-map-pin" class="size-4" />
            <span>{{ selectedEvent.location }}</span>
          </div>
          <p v-if="selectedEvent.description" class="text-sm text-app-muted">{{ selectedEvent.description }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex items-center gap-2">
          <Button label="Delete" icon="i-lucide-trash-2" variant="ghost" color="error" :loading="isDeleting" @click="handleDelete" />
          <div class="flex-1" />
          <Button label="Close" variant="ghost" @click="showViewModal = false" />
          <Button label="Edit" icon="i-lucide-pencil" @click="startEditing" />
        </div>
      </template>
    </Modal>

    <!-- Create/Edit Event Modal -->
    <Modal v-model:open="showCreateModal">
      <template #header>
        <div class="flex items-center gap-3">
          <Icon name="i-lucide-calendar-plus" class="size-6 text-app-accent" />
          <h2 class="text-xl font-medium text-app">{{ selectedEvent ? 'Edit Event' : 'New Event' }}</h2>
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <FormField label="Title" required>
            <Input v-model="formTitle" placeholder="Event title" icon="i-lucide-type" />
          </FormField>
          <div class="grid grid-cols-2 gap-4">
            <FormField label="Start">
              <Input v-model="formStartTime" type="datetime-local" />
            </FormField>
            <FormField label="End">
              <Input v-model="formEndTime" type="datetime-local" />
            </FormField>
          </div>
          <FormField label="Location">
            <Input v-model="formLocation" placeholder="Location" icon="i-lucide-map-pin" />
          </FormField>
          <FormField label="Description">
            <Input v-model="formDescription" placeholder="Description" icon="i-lucide-align-left" />
          </FormField>
          <div class="flex items-center gap-4">
            <FormField label="Color">
              <input v-model="formColor" type="color" class="w-10 h-8 rounded border border-white/10 bg-transparent cursor-pointer" />
            </FormField>
            <Checkbox v-model="formAllDay" label="All day" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" variant="ghost" @click="showCreateModal = false; resetForm()" />
          <Button
            :label="selectedEvent ? 'Update' : 'Create'"
            icon="i-lucide-check"
            :loading="isSubmitting"
            :disabled="!formTitle.trim()"
            @click="selectedEvent ? handleUpdate() : handleCreate()"
          />
        </div>
      </template>
    </Modal>
  </div>
</template>
