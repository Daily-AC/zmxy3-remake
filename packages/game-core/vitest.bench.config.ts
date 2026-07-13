import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/**/*.bench.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
