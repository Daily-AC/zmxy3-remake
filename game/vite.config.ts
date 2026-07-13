import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const gamePackage = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  base: './', // relative asset paths so dist/index.html also loads via file:// (Electron/Tauri); no effect on dev server
  define: { __GAME_VERSION__: JSON.stringify(gamePackage.version) },
  server: { port: 5180 },
  build: { target: 'es2022' },
})
