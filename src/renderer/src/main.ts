import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { en as vuetifyEn, es as vuetifyEs } from 'vuetify/locale'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import { router } from './router'

// Components/directives are auto-imported on use by `vite-plugin-vuetify`.
// Register Vuetify's bundled English + Spanish messages so its built-in strings
// (e.g. autocomplete "No data available") follow the app locale (research.md §5).
// The active locale is switched at runtime in App.vue via Vuetify's useLocale.
const vuetify = createVuetify({
  locale: {
    locale: 'en',
    fallback: 'en',
    messages: { en: vuetifyEn, es: vuetifyEs }
  },
  theme: {
    defaultTheme: 'dark'
  }
})

createApp(App).use(router).use(vuetify).mount('#app')
