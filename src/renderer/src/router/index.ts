import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import PoolManagementView from '@renderer/pages/PoolManagementView.vue'
import ChampSelectView from '@renderer/pages/ChampSelectView.vue'
import BanRecommendationsView from '@renderer/pages/BanRecommendationsView.vue'
import SettingsView from '@renderer/pages/SettingsView.vue'

// Hash history avoids file:// path issues when the renderer is loaded from disk
// in a packaged Electron build.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'pool', component: PoolManagementView, meta: { title: 'Champion Pool' } },
  {
    path: '/champ-select',
    name: 'champ-select',
    component: ChampSelectView,
    meta: { title: 'Champion Select' }
  },
  { path: '/bans', name: 'bans', component: BanRecommendationsView, meta: { title: 'Recommended Bans' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'Settings' } }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
