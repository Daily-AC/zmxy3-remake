import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative asset paths so dist/index.html also loads via file:// (Electron/Tauri); no effect on dev server
  server: { port: 5180 },
  build: { target: 'es2022' },
})
