import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Las piezas de `src/core` salen como entradas propias para poder
        // ejercitarlas desde los tests sin arrancar la aplicación entera.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          registry: resolve(__dirname, 'src/core/modules/registry.ts'),
          db: resolve(__dirname, 'src/core/db.ts'),
          replication: resolve(__dirname, 'src/core/replication.ts'),
          sync: resolve(__dirname, 'src/core/sync.ts'),
          client: resolve(__dirname, 'src/core/client.ts'),
          desktopSync: resolve(__dirname, 'src/main/sync.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } } }
  }
})
