import { describe, expect, it } from 'vitest'
import { normalizeAssetText } from '../scripts/sync-assets.mjs'

describe('embedded asset sync normalization', () => {
  it('stabilizes Nuxt plugin variable names across operating systems', () => {
    const source = `
const revive_payload_client_randomHash = defineNuxtPlugin({});
const unhead_otherHash = defineNuxtPlugin({});
const navigation_repaint_client_osHash = defineNuxtPlugin({});
const check_outdated_build_client_newHash = defineNuxtPlugin({});
const chunk_reload_client_chunkHash = defineNuxtPlugin({});
const components_plugin_componentHash = defineNuxtPlugin({});
const prefetch_client_prefetchHash = defineNuxtPlugin({});
const unocss_unoHash = defineNuxtPlugin(() => {});
const plugins = [
  revive_payload_client_randomHash,
  unhead_otherHash,
  navigation_repaint_client_osHash,
  check_outdated_build_client_newHash,
  chunk_reload_client_chunkHash,
  components_plugin_componentHash,
  prefetch_client_prefetchHash,
  unocss_unoHash
];`

    expect(normalizeAssetText('entry.js', source)).toContain('revive_payload_client_knife4jStatic')
    expect(normalizeAssetText('entry.js', source)).toContain('unhead_knife4jStatic')
    expect(normalizeAssetText('entry.js', source)).toContain(
      'navigation_repaint_client_knife4jStatic'
    )
    expect(normalizeAssetText('entry.js', source)).toContain(
      'check_outdated_build_client_knife4jStatic'
    )
    expect(normalizeAssetText('entry.js', source)).toContain('chunk_reload_client_knife4jStatic')
    expect(normalizeAssetText('entry.js', source)).toContain('components_plugin_knife4jStatic')
    expect(normalizeAssetText('entry.js', source)).toContain('prefetch_client_knife4jStatic')
    expect(normalizeAssetText('entry.js', source)).toContain('unocss_knife4jStatic')
  })

  it('stabilizes generated Vue scope ids in error page assets', () => {
    expect(normalizeAssetText('error-404.css', '.grid[data-v-ca48caf0]{display:grid}')).toBe(
      '.grid[data-v-knife4j404]{display:grid}'
    )
    expect(
      normalizeAssetText(
        'error-404.js',
        'const error404 = _export_sfc(_sfc_main, [["__scopeId", "data-v-ca48caf0"]]);'
      )
    ).toBe('const error404 = _export_sfc(_sfc_main, [["__scopeId", "data-v-knife4j404"]]);')
    expect(normalizeAssetText('error-500.css', '.grid[data-v-a70264fd]{display:grid}')).toBe(
      '.grid[data-v-knife4j500]{display:grid}'
    )
    expect(
      normalizeAssetText(
        'error-500.js',
        'const error500 = _export_sfc(_sfc_main, [["__scopeId", "data-v-a70264fd"]]);'
      )
    ).toBe('const error500 = _export_sfc(_sfc_main, [["__scopeId", "data-v-knife4j500"]]);')
  })
})
