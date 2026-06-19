<script setup lang="ts">
// Dedicated "Bans" page (spec 007 US1 / T017). A standalone, always-accessible view
// — not gated on an active champ select — so the player can review recommended bans
// *before* champion select begins and for all five roles regardless of their
// assigned role. Kept thin: all logic lives in <BanRecommendations />.
import BanRecommendations from '@renderer/components/BanRecommendations.vue'
</script>

<template>
  <BanRecommendations />
</template>
