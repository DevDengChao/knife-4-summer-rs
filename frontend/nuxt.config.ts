export default defineNuxtConfig({
  compatibilityDate: '2026-05-09',
  buildId: 'knife4j-static',
  ssr: false,
  modules: ['@unocss/nuxt', '@nuxt/eslint'],
  app: {
    buildAssetsDir: '/_knife4j/',
    head: {
      htmlAttrs: {
        lang: 'zh-CN'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ],
      title: 'Knife4j'
    }
  },
  nitro: {
    prerender: {
      routes: ['/', '/doc', '/doc.html']
    }
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: '_knife4j/[name].js',
          chunkFileNames: '_knife4j/[name].js',
          assetFileNames: '_knife4j/[name][extname]'
        }
      }
    }
  },
  eslint: {
    config: {
      stylistic: false
    }
  },
  typescript: {
    strict: true
  },
  devtools: {
    enabled: false
  }
})
