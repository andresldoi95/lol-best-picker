<script setup lang="ts">
// Dedicated "Personal Counters" page (spec 008 US2). A standalone, always-accessible
// view — separate from the champion pool — for reviewing the enemies you lose to most.
// Kept thin: all logic lives in <PersonalCounters />.
import PersonalCounters from '@renderer/components/PersonalCounters.vue'
</script>

<template>
  <PersonalCounters />
</template>
