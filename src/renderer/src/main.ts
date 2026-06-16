import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'
import { router } from './router'

// Components/directives are auto-imported on use by `vite-plugin-vuetify`.
const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark'
  }
})

createApp(App).use(router).use(vuetify).mount('#app')
