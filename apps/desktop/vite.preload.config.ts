import path from 'node:path'

import { defineConfig } from 'vite'

const external = ['electron', ...Object.keys(process.binding('natives'))]

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: '.vite/build',
    lib: {
      entry: path.resolve(__dirname, 'electron/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: {
      external,
    },
    target: 'node20',
  },
  clearScreen: false,
})
