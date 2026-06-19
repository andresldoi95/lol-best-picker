<script setup lang="ts">
import type { PersonalCounter } from '@shared/types'
import { confidenceColor } from '@renderer/types/game'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'

// One personal-counter row (spec 008 US2/US4): rank, portrait, name, win rate + games,
// threat score, and a sample-size confidence chip whose color escalates with certainty.
const props = defineProps<{ counter: PersonalCounter; rank: number }>()

const { t, n } = useLocale()

const confidenceLabelKeys: Record<PersonalCounter['confidenceTier'], keyof Catalog> = {
  Confirmed: 'counterConfidenceConfirmed',
  Likely: 'counterConfidenceLikely',
  Potential: 'counterConfidencePotential'
}
</script>

<template>
  <v-card variant="tonal" border flat class="counter-card">
    <div class="d-flex align-center pa-2 ga-3">
      <div class="counter-rank text-caption font-weight-bold" :aria-label="`#${rank}`">
        {{ rank }}
      </div>
      <v-avatar size="44" rounded="sm">
        <v-img :src="counter.iconPath" :alt="counter.championName" />
      </v-avatar>
      <div class="flex-grow-1 min-width-0">
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-1 font-weight-medium text-truncate">{{ counter.championName }}</span>
          <v-chip
            :color="confidenceColor(counter.confidenceTier)"
            size="x-small"
            variant="flat"
            :title="t('counterConfidenceTooltip')"
          >
            {{ t(confidenceLabelKeys[counter.confidenceTier]) }}
          </v-chip>
        </div>
        <div class="text-caption text-medium-emphasis d-flex flex-wrap ga-1">
          <span>{{ t('counterWinRate').replace('{wr}', n(counter.winRate, 'decimal1')) }}</span>
          <span>· {{ t('counterGamesCount').replace('{n}', String(counter.gamesPlayed)) }}</span>
        </div>
      </div>
      <!-- The threat score: the value the list is ranked by (higher = worse for you). -->
      <div class="text-right" :title="t('counterThreatScore').replace('{score}', n(counter.threatScore, 'decimal1'))">
        <div class="text-h6 font-weight-bold text-error">{{ n(counter.threatScore, 'decimal1') }}</div>
        <div class="text-caption text-disabled text-uppercase">{{ t('counterThreatScore').replace(' {score}', '') }}</div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.counter-card {
  width: 100%;
}
.counter-rank {
  flex: 0 0 auto;
  width: 20px;
  text-align: center;
  opacity: 0.7;
}
/* min-width:0 lets the name truncate inside the flex row instead of overflowing. */
.min-width-0 {
  min-width: 0;
}
</style>
