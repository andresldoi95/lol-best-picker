<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ROLES, type Role } from '@shared/types'
import { usePool } from '@renderer/composables/usePool'

const { pool, champions, loaded, loading, refresh, addToPool, removeFromPool, removeAllRoles } =
  usePool()

const selectedChampionId = ref<number | null>(null)
const selectedRoles = ref<Role[]>([])

const roleLabels: Record<Role, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Middle',
  BOTTOM: 'Bottom',
  SUPPORT: 'Support'
}
const roleIcons: Record<Role, string> = {
  TOP: 'mdi-shield-sword',
  JUNGLE: 'mdi-pine-tree',
  MIDDLE: 'mdi-map-marker',
  BOTTOM: 'mdi-bow-arrow',
  SUPPORT: 'mdi-hand-heart'
}

onMounted(() => {
  if (!loaded.value) void refresh()
})

const championItems = computed(() =>
  champions.value.map((c) => ({ title: c.name, value: c.championId }))
)

const groupedPool = computed(() =>
  ROLES.map((role) => ({
    role,
    entries: pool.value.filter((e) => e.role === role)
  }))
)

const canAdd = computed(
  () => selectedChampionId.value !== null && selectedRoles.value.length > 0
)

async function handleAdd(): Promise<void> {
  const championId = selectedChampionId.value
  if (championId === null) return
  for (const role of selectedRoles.value) {
    await addToPool(championId, role)
  }
  selectedRoles.value = []
  selectedChampionId.value = null
}
</script>

<template>
  <div>
    <h1 class="text-h4 mb-1">Champion Pool</h1>
    <p class="text-medium-emphasis mb-6">
      Tag the champions you actually play by role. Recommendations are drawn only from this pool.
    </p>

    <v-card class="mb-8" border flat>
      <v-card-text>
        <v-row align="center" dense>
          <v-col cols="12" md="5">
            <v-autocomplete
              v-model="selectedChampionId"
              :items="championItems"
              label="Champion"
              placeholder="Search a champion…"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="5">
            <v-chip-group v-model="selectedRoles" multiple column>
              <v-chip
                v-for="role in ROLES"
                :key="role"
                :value="role"
                :prepend-icon="roleIcons[role]"
                filter
                variant="outlined"
              >
                {{ roleLabels[role] }}
              </v-chip>
            </v-chip-group>
          </v-col>
          <v-col cols="12" md="2" class="text-md-right">
            <v-btn
              color="primary"
              :disabled="!canAdd"
              prepend-icon="mdi-plus"
              block
              @click="handleAdd"
            >
              Add
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-row>
      <v-col v-for="group in groupedPool" :key="group.role" cols="12" md="6" lg="4">
        <v-card border flat height="100%">
          <v-card-title class="d-flex align-center">
            <v-icon :icon="roleIcons[group.role]" class="me-2" />
            {{ roleLabels[group.role] }}
            <v-spacer />
            <v-chip size="small" variant="tonal">{{ group.entries.length }}</v-chip>
          </v-card-title>
          <v-divider />
          <v-list v-if="group.entries.length" density="comfortable" lines="one">
            <v-list-item v-for="entry in group.entries" :key="entry.championId">
              <template #prepend>
                <v-avatar size="36">
                  <v-img :src="entry.iconPath" :alt="entry.name" />
                </v-avatar>
              </template>
              <v-list-item-title>
                {{ entry.name }}
                <v-chip
                  v-if="entry.isFlagged"
                  size="x-small"
                  color="warning"
                  variant="flat"
                  class="ms-2"
                >
                  inactive
                </v-chip>
              </v-list-item-title>
              <template #append>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  :aria-label="`Remove ${entry.name} from ${roleLabels[group.role]}`"
                  @click="removeFromPool(entry.championId, entry.role)"
                />
                <v-btn
                  icon="mdi-delete-sweep"
                  size="x-small"
                  variant="text"
                  :aria-label="`Remove ${entry.name} from all roles`"
                  @click="removeAllRoles(entry.championId)"
                />
              </template>
            </v-list-item>
          </v-list>
          <v-card-text v-else class="text-medium-emphasis text-center py-8">
            No champions tagged for {{ roleLabels[group.role] }} yet.
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
