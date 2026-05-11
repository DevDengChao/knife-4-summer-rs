import { beforeAll, describe, expect, it, vi } from 'vitest'

describe('Nuxt build config', () => {
  beforeAll(() => {
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  })

  it('uses deterministic asset names for embedded crate assets', async () => {
    const { default: nuxtConfig } = await import('../nuxt.config')
    const output = nuxtConfig.vite?.build?.rollupOptions?.output

    expect(output).toMatchObject({
      entryFileNames: '_knife4j/[name].js',
      chunkFileNames: '_knife4j/[name].js',
      assetFileNames: '_knife4j/[name][extname]'
    })
  })
})
