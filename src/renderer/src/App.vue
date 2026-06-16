<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { to: '/', label: 'Pool', icon: 'mdi-account-multiple' },
  { to: '/champ-select', label: 'Champ Select', icon: 'mdi-sword-cross' },
  { to: '/settings', label: 'Settings', icon: 'mdi-cog' }
]
</script>

<template>
  <v-app>
    <v-app-bar color="surface" flat density="comfortable">
      <v-app-bar-title>
        <span class="text-primary font-weight-bold">LoL</span> Best Picker
      </v-app-bar-title>
      <v-spacer />
      <v-btn
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        variant="text"
        :active="route.path === item.to"
      >
        {{ item.label }}
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
