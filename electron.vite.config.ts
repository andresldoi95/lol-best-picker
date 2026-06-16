import { resolve } from 'path'
import { copyFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// The Riot LCU root CA is a runtime asset (read via fs, not imported), so the
// bundler won't emit it. Copy it next to the compiled main entry so buildAgent()
// finds it at join(__dirname, 'riotgames.pem') in both dev and packaged builds.
function copyRiotCert(): Plugin {
  return {
    name: 'copy-riot-cert',
    writeBundle() {
      copyFileSync(resolve('src/main/lcu/riotgames.pem'), resolve('out/main/riotgames.pem'))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyRiotCert()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@recommendation': resolve('src/recommendation'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue(), vuetify({ autoImport: true })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})
