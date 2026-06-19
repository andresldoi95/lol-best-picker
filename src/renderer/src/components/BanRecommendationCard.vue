<script setup lang="ts">
import type { BanRecommendation } from '@shared/types'
import { useLocale } from '@renderer/i18n/useLocale'

// Individual ban card (spec 007 US1/US2). Deliberately styled as a "danger" item —
// error/red color, a ban-symbol overlay on the portrait, and a rank badge — so it
// reads as a ban at a glance and never gets confused with a (primary/blue) pick card.
defineProps<{ ban: BanRecommendation }>()

const { t, n } = useLocale()
</script>

<template>
  <v-card color="error" variant="tonal" border flat class="ban-card">
    <div class="d-flex align-center pa-2 ga-2">
      <div class="ban-rank text-caption font-weight-bold" :aria-label="`#${ban.rank}`">
        {{ ban.rank }}
      </div>
      <v-avatar size="40" rounded="sm" class="ban-portrait">
        <v-img :src="ban.iconPath" :alt="ban.championName" />
        <v-icon icon="mdi-cancel" class="ban-portrait-overlay" />
      </v-avatar>
      <div class="flex-grow-1 min-width-0">
        <div class="text-body-2 font-weight-medium text-truncate">{{ ban.championName }}</div>
        <!-- Qualified indicator: win rate AND pick rate (presence), so a one-trick's
             inflated win rate is obvious from its low pick rate (spec 007). -->
        <div class="text-caption text-medium-emphasis d-flex flex-wrap ga-1">
          <span>{{ t('banCardWinRateShort').replace('{wr}', n(ban.winRate, 'decimal1')) }}</span>
          <span v-if="ban.pickRate != null">
            · {{ t('banCardPickRate').replace('{pr}', n(ban.pickRate, 'decimal1')) }}
          </span>
        </div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.ban-card {
  width: 100%;
}
.ban-rank {
  flex: 0 0 auto;
  width: 20px;
  text-align: center;
  opacity: 0.7;
}
/* min-width:0 lets the name truncate inside the flex row instead of overflowing. */
.min-width-0 {
  min-width: 0;
}
.ban-portrait {
  position: relative;
}
/* A semi-transparent ban symbol over the portrait reinforces "do not pick this". */
.ban-portrait-overlay {
  position: absolute;
  inset: 0;
  margin: auto;
  color: rgb(var(--v-theme-error));
  opacity: 0.85;
  font-size: 28px;
}
</style>
