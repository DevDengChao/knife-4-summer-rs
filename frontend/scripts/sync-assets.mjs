import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = new URL('..', import.meta.url)
const repoRoot = new URL('../..', import.meta.url)
const generatedAssets = new URL('.output/public/', frontendRoot)
const embeddedAssets = new URL('assets/knife4j/', repoRoot)
const buildId = 'knife4j-static'
const timestamp = 0
const stablePluginNames = [
  'revive_payload_client',
  'unhead',
  'navigation_repaint_client',
  'check_outdated_build_client',
  'chunk_reload_client',
  'components_plugin',
  'prefetch_client',
  'unocss'
]
const stableScopeIds = new Map([
  ['error-404.css', 'knife4j404'],
  ['error-404.js', 'knife4j404'],
  ['error-500.css', 'knife4j500'],
  ['error-500.js', 'knife4j500']
])

async function normalizeJsonFile(fileUrl, normalize) {
  const json = JSON.parse(await readFile(fileUrl, 'utf8'))
  await writeJsonFile(fileUrl, normalize(json))
}

async function writeJsonFile(fileUrl, json) {
  await writeFile(fileUrl, `${JSON.stringify(json)}\n`)
}

async function normalizeHtmlFile(fileUrl) {
  let html = await readFile(fileUrl, 'utf8')
  html = html.replaceAll(/"buildId":"[^"]+"/g, `"buildId":"${buildId}"`)
  html = html.replaceAll(/,"buildId":"[^"]+"/g, `,"buildId":"${buildId}"`)
  html = html.replaceAll(
    /\[\{"prerenderedAt":1,"serverRendered":2\},\d+,false\]/g,
    `[{"prerenderedAt":1,"serverRendered":2},${timestamp},false]`
  )
  await writeFile(fileUrl, html)
}

export function normalizeAssetText(fileName, text) {
  let normalized = text

  if (fileName === 'entry.js') {
    for (const pluginName of stablePluginNames) {
      normalized = normalized.replaceAll(
        new RegExp(`${pluginName}_[A-Za-z0-9_$]+`, 'g'),
        `${pluginName}_knife4jStatic`
      )
    }
  }

  const scopeId = stableScopeIds.get(fileName)
  if (scopeId) {
    normalized = normalized.replaceAll(/data-v-[a-f0-9]{8}/g, `data-v-${scopeId}`)
  }

  return normalized
}

async function normalizeTextAsset(fileUrl) {
  const fileName = fileUrl.pathname.split('/').at(-1)
  const text = await readFile(fileUrl, 'utf8')
  await writeFile(fileUrl, normalizeAssetText(fileName, text))
}

async function normalizeGeneratedAssets() {
  const buildsDir = new URL('_knife4j/builds/', generatedAssets)
  const metaDir = new URL('_knife4j/builds/meta/', generatedAssets)

  await normalizeJsonFile(new URL('latest.json', buildsDir), () => ({
    id: buildId,
    timestamp
  }))

  for (const entry of await readdir(metaDir)) {
    await rm(new URL(entry, metaDir), { force: true })
  }

  await writeJsonFile(new URL(`${buildId}.json`, metaDir), {
    id: buildId,
    timestamp,
    prerendered: []
  })

  for (const htmlFile of [
    '200.html',
    '404.html',
    'doc.html',
    'index.html',
    join('doc', 'index.html')
  ]) {
    await normalizeHtmlFile(new URL(htmlFile.replaceAll('\\', '/'), generatedAssets))
  }

  for (const assetFile of [
    '_knife4j/entry.js',
    '_knife4j/error-404.css',
    '_knife4j/error-404.js',
    '_knife4j/error-500.css',
    '_knife4j/error-500.js'
  ]) {
    await normalizeTextAsset(new URL(assetFile, generatedAssets))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await normalizeGeneratedAssets()
  await rm(embeddedAssets, { force: true, recursive: true })
  await mkdir(embeddedAssets, { recursive: true })
  await cp(generatedAssets, embeddedAssets, { recursive: true })
}
