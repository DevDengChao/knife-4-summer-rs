import { expect, test, type Page } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace'

interface OpenApiDocument {
  info?: {
    title?: string
    version?: string
  }
  openapi?: string
  swagger?: string
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>
  definitions?: Record<string, unknown>
  components?: {
    schemas?: Record<string, unknown>
  }
}

interface OpenApiOperation {
  tags?: string[]
  summary?: string
  description?: string
}

interface ExampleTarget {
  name: string
  packageName: string
  port: number
  petstoreFixture?: boolean
}

interface OperationSummary {
  method: HttpMethod
  path: string
  label: string
}

interface ApiSummary {
  title: string
  documentVersion: string
  operations: OperationSummary[]
  models: string[]
}

interface RunningExample {
  target: ExampleTarget
  origin: string
  process: ChildProcess
}

interface StaticProxyServer {
  origin: string
  close: () => Promise<void>
}

const METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const FRONTEND_ROOT = path.resolve(import.meta.dirname, '../..')
const KNIFE4J_REFERENCE_ROOT = path.join(REPO_ROOT, 'references', 'knife4j')
const KNIFE4J_SOURCE_ROOT = path.join(KNIFE4J_REFERENCE_ROOT, 'knife4j-vue3')
const KNIFE4J_CACHE_ROOT = path.join(REPO_ROOT, '.e2e-cache', 'knife4j-vue3')
const KNIFE4J_DIST_ROOT = path.join(KNIFE4J_CACHE_ROOT, 'dist')
const KNIFE4J_COMMIT = '78063054d67aeb9eff057585ed5247b1af989add'
const PETSTORE_URL = 'https://petstore.swagger.io/v2/swagger.json'
const PETSTORE_FIXTURE = path.join(FRONTEND_ROOT, 'fixtures', 'petstore.json')

const examples: ExampleTarget[] = [
  { name: 'summer-rs plugin', packageName: 'knife4j-summer-openapi-example', port: 8090 },
  { name: 'aide axum router', packageName: 'knife4j-aide-axum-example', port: 8091 },
  {
    name: 'petstore swagger v2',
    packageName: 'knife4j-petstore-example',
    port: 8092,
    petstoreFixture: true
  }
]

test.describe.serial('Knife4j parity for persisted examples', () => {
  test.beforeAll(async () => {
    await prepareKnife4jReferenceDist()
  })

  for (const target of examples) {
    test(`${target.name} renders consistently in /doc.html, /doc, and reference Knife4j`, async ({
      page
    }) => {
      const running = await startExample(target)
      let referenceServer: StaticProxyServer | undefined
      try {
        await routePetstoreFixture(page)
        const summary = await loadApiSummary(running)

        await assertSummerKnife4jPage(page, `${running.origin}/doc.html`, summary)
        await assertSummerKnife4jPage(page, `${running.origin}/doc`, summary)

        referenceServer = await startReferenceServer(running.origin)
        await assertOfficialKnife4jPage(page, `${referenceServer.origin}/doc.html`, summary)
      } finally {
        await referenceServer?.close()
        await stopExample(running)
      }
    })
  }
})

async function prepareKnife4jReferenceDist() {
  const stamp = path.join(KNIFE4J_CACHE_ROOT, '.knife4j-source')
  const expectedStamp = `${KNIFE4J_COMMIT}\n`
  if (
    (await fileExists(path.join(KNIFE4J_DIST_ROOT, 'doc.html'))) &&
    (await readOptional(stamp)) === expectedStamp
  ) {
    return
  }

  await ensureKnife4jReferenceCheckout()
  await rm(KNIFE4J_CACHE_ROOT, { recursive: true, force: true })
  await mkdir(KNIFE4J_CACHE_ROOT, { recursive: true })
  await cp(KNIFE4J_SOURCE_ROOT, KNIFE4J_CACHE_ROOT, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source)
      return name !== 'node_modules' && name !== 'dist'
    }
  })

  await runCommand(
    'corepack',
    ['pnpm@8.15.9', 'install', '--no-frozen-lockfile', '--ignore-scripts'],
    {
      cwd: KNIFE4J_CACHE_ROOT
    }
  )
  await runCommand(
    'corepack',
    [
      'pnpm@8.15.9',
      'exec',
      'cross-env',
      'VITE_RELEASE_APP_TYPE=SpringDocOpenApi',
      'VITE_APP_BASE_API=',
      'vite',
      'build'
    ],
    { cwd: KNIFE4J_CACHE_ROOT }
  )
  await writeFile(stamp, expectedStamp, 'utf8')
}

async function ensureKnife4jReferenceCheckout() {
  if (await fileExists(path.join(KNIFE4J_SOURCE_ROOT, 'package.json'))) {
    return
  }

  await mkdir(path.dirname(KNIFE4J_REFERENCE_ROOT), { recursive: true })
  if (!(await fileExists(path.join(KNIFE4J_REFERENCE_ROOT, '.git')))) {
    await rm(KNIFE4J_REFERENCE_ROOT, { recursive: true, force: true })
    await runCommand('git', [
      'clone',
      '--filter=blob:none',
      '--sparse',
      'git@github.com:xiaoymin/knife4j.git',
      KNIFE4J_REFERENCE_ROOT
    ])
  }
  await runCommand('git', ['checkout', KNIFE4J_COMMIT], { cwd: KNIFE4J_REFERENCE_ROOT })
  await runCommand('git', ['sparse-checkout', 'init', '--cone'], { cwd: KNIFE4J_REFERENCE_ROOT })
  await runCommand('git', ['sparse-checkout', 'set', 'knife4j-vue3'], {
    cwd: KNIFE4J_REFERENCE_ROOT
  })
}

async function startExample(target: ExampleTarget): Promise<RunningExample> {
  const child = spawn('cargo', ['run', '-p', target.packageName], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PATH: `C:\\Users\\Admin\\.cargo\\bin;${process.env.PATH ?? ''}`
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  child.stdout?.on('data', (chunk) => test.info().attach(`stdout-${target.name}`, { body: chunk }))
  child.stderr?.on('data', (chunk) => test.info().attach(`stderr-${target.name}`, { body: chunk }))

  const origin = `http://127.0.0.1:${target.port}`
  await waitForHttp(`${origin}/doc.html`, 90_000)
  return { target, origin, process: child }
}

async function stopExample(example: RunningExample) {
  if (example.process.exitCode !== null) {
    return
  }
  if (process.platform === 'win32' && example.process.pid) {
    await runCommand('taskkill', ['/PID', String(example.process.pid), '/T', '/F'], {
      allowFailure: true
    })
  } else {
    example.process.kill('SIGTERM')
  }
}

async function loadApiSummary(example: RunningExample): Promise<ApiSummary> {
  const document = example.target.petstoreFixture
    ? await loadPetstoreFixture()
    : await fetchJson<OpenApiDocument>(`${example.origin}/v3/api-docs`)
  const operations = collectOperations(document)
  const models = Object.keys(document.components?.schemas ?? document.definitions ?? {})
  return {
    title: document.info?.title ?? 'OpenAPI',
    documentVersion: document.swagger?.startsWith('2') ? '2.0' : '3.x',
    operations,
    models
  }
}

function collectOperations(document: OpenApiDocument): OperationSummary[] {
  const operations: OperationSummary[] = []
  for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = pathItem[method] as OpenApiOperation | undefined
      if (!operation || typeof operation !== 'object') continue
      operations.push({
        method,
        path: apiPath,
        label: operation.summary || operation.description || apiPath
      })
    }
  }
  return operations
}

async function assertSummerKnife4jPage(page: Page, url: string, summary: ApiSummary) {
  await page.goto(url)
  await routePetstoreFixture(page)
  await expect(page.locator('#knife4j-doc-app')).toBeVisible()
  await expect(page.getByRole('heading', { name: summary.title })).toBeVisible()

  const firstOperation = summary.operations[0]
  expect(firstOperation).toBeTruthy()
  await expect(page.locator('body')).toContainText(firstOperation.path)
  await expect(page.locator('body')).toContainText(firstOperation.method.toUpperCase())
  await expect(page.locator('body')).toContainText(`${summary.operations.length} APIs`)
  await expect(page.locator('body')).toContainText(`${summary.models.length} Models`)

  const search = page.getByPlaceholder('输入接口名称、路径或方法')
  await search.fill(firstOperation.path)
  await expect(page.locator('body')).toContainText(firstOperation.path)
  await search.fill('')

  await expect(page.getByRole('heading', { name: '请求参数' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '响应状态' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '响应模型' })).toBeVisible()

  await page.getByRole('button', { name: '调试' }).click()
  await expect(page.getByRole('button', { name: /发送/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '请求历史' })).toBeVisible()

  await page.getByRole('button', { name: '模型' }).click()
  if (summary.models.length > 0) {
    await expect(page.locator('body')).toContainText(summary.models[0])
  }

  await page.getByRole('button', { name: '全局参数' }).click()
  await expect(page.getByRole('heading', { name: '鉴权' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '全局参数' })).toBeVisible()

  await page.getByRole('button', { name: '离线文档' }).click()
  for (const exportName of ['OpenAPI JSON', 'Markdown', 'HTML', 'Word']) {
    await expect(page.getByRole('button', { name: exportName })).toBeVisible()
  }
}

async function assertOfficialKnife4jPage(page: Page, url: string, summary: ApiSummary) {
  await page.goto(url)
  await routePetstoreFixture(page)

  await expect(page.locator('#app').first()).toBeVisible()
  await expect(page.locator('body')).toContainText(summary.title)

  const firstOperation = summary.operations[0]
  await expect(page.locator('body')).toContainText(firstOperation.method.toUpperCase())
  await expect(page.locator('body')).toContainText(
    `接口统计信息${firstOperation.method.toUpperCase()}`
  )

  await expect(page.locator('body')).toContainText(/Swagger Models|文档管理/)
  await expect(page.locator('body')).toContainText(/全局参数|离线文档/)
}

async function startReferenceServer(targetOrigin: string): Promise<StaticProxyServer> {
  const server = createServer((request, response) => {
    void handleReferenceRequest(request, response, targetOrigin)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

async function handleReferenceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targetOrigin: string
) {
  const url = new URL(request.url ?? '/', targetOrigin)
  if (isKnife4jApiPath(url.pathname)) {
    await proxyRequest(response, `${targetOrigin}${url.pathname}${url.search}`)
    return
  }

  const pathname = url.pathname === '/' ? '/doc.html' : decodeURIComponent(url.pathname)
  const filePath = path.resolve(KNIFE4J_DIST_ROOT, `.${pathname}`)
  if (!filePath.startsWith(KNIFE4J_DIST_ROOT)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const file = await readFile(filePath)
    response.writeHead(200, { 'content-type': contentType(filePath) })
    response.end(file)
  } catch {
    response.writeHead(404)
    response.end('Not Found')
  }
}

function isKnife4jApiPath(pathname: string) {
  return (
    pathname === '/v3/api-docs' ||
    pathname === '/v3/api-docs/swagger-config' ||
    pathname === '/swagger-resources' ||
    pathname === '/swagger-resources/configuration/ui' ||
    pathname === '/swagger-resources/configuration/security' ||
    pathname === '/services.json'
  )
}

async function proxyRequest(response: ServerResponse, url: string) {
  const result = await fetch(url)
  response.writeHead(result.status, {
    'content-type': result.headers.get('content-type') ?? 'application/json'
  })
  response.end(Buffer.from(await result.arrayBuffer()))
}

async function routePetstoreFixture(page: Page) {
  await page.route(PETSTORE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(await loadPetstoreFixture())
    })
  })
}

async function loadPetstoreFixture(): Promise<OpenApiDocument> {
  return JSON.parse(await readFile(PETSTORE_FIXTURE, 'utf8')) as OpenApiDocument
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  return (await response.json()) as T
}

async function waitForHttp(url: string, timeoutMs: number) {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`)
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; allowFailure?: boolean } = {}
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('exit', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function readOptional(file: string) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

async function fileExists(file: string) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

function contentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}
