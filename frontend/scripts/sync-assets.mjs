import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const frontendRoot = new URL('..', import.meta.url)
const repoRoot = new URL('../..', import.meta.url)
const generatedAssets = new URL('.output/public/', frontendRoot)
const embeddedAssets = new URL('assets/knife4j/', repoRoot)
const buildId = 'knife4j-static'
const timestamp = 0

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
}

await normalizeGeneratedAssets()
await rm(embeddedAssets, { force: true, recursive: true })
await mkdir(embeddedAssets, { recursive: true })
await cp(generatedAssets, embeddedAssets, { recursive: true })
