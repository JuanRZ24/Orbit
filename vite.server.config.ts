import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * El servidor se compila aparte de la aplicación de escritorio: no lleva
 * Electron ni renderer, solo `src/server` y lo que importe de `src/core`.
 */
export default defineConfig({
  build: {
    ssr: fileURLToPath(new URL('src/server/index.ts', import.meta.url)),
    outDir: 'out/server',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'index.js' } }
  }
})
