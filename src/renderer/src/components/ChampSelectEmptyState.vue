<script setup lang="ts">
import { useLocale } from '@renderer/i18n/useLocale'

// Idle state for the Champ Select view when no live champion select is active —
// shown on launch (no game yet) and after the phase ends / LCU disconnects
// (spec 006 US3 / FR-005). Deliberately distinct from an error state: it reads
// as "nothing to do yet", not "something went wrong" (spec Assumptions).
const { t } = useLocale()
</script>

<template>
  <v-card border flat class="text-center pa-8">
    <v-icon icon="mdi-sword-cross" size="64" color="medium-emphasis" class="mb-4" />
    <v-card-title class="text-h5">{{ t('champSelectInactiveTitle') }}</v-card-title>
    <v-card-text class="text-medium-emphasis">
      {{ t('champSelectInactiveMessage') }}
    </v-card-text>
  </v-card>
</template>
