import { expect, test, type Locator, type Page } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace'

interface OpenApiDocument {
  info?: {
    title?: string
    version?: string
    description?: string
  }
  openapi?: string
  swagger?: string
  host?: string
  basePath?: string
  schemes?: string[]
  servers?: Array<{ url?: string; description?: string }>
  tags?: Array<{ name?: string; description?: string }>
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>
  definitions?: Record<string, OpenApiSchema>
  components?: {
    schemas?: Record<string, OpenApiSchema>
    securitySchemes?: Record<string, OpenApiSecurityScheme>
  }
  securityDefinitions?: Record<string, OpenApiSecurityScheme>
  security?: Array<Record<string, string[]>>
}

interface OpenApiOperation {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  consumes?: string[]
  produces?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: {
    description?: string
    required?: boolean
    content?: Record<string, { schema?: OpenApiSchema; example?: unknown; examples?: unknown }>
  }
  responses?: Record<string, OpenApiResponse>
  security?: Array<Record<string, string[]>>
}

interface OpenApiParameter {
  name?: string
  in?: 'query' | 'header' | 'path' | 'cookie' | 'body' | 'formData'
  description?: string
  required?: boolean
  type?: string
  format?: string
  schema?: OpenApiSchema
  example?: unknown
  default?: unknown
}

interface OpenApiResponse {
  description?: string
  schema?: OpenApiSchema
  content?: Record<string, { schema?: OpenApiSchema; example?: unknown; examples?: unknown }>
  headers?: Record<string, OpenApiParameter>
}

interface OpenApiSchema {
  $ref?: string
  title?: string
  description?: string
  type?: string | string[]
  format?: string
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
  required?: string[]
  enum?: unknown[]
  example?: unknown
  default?: unknown
  additionalProperties?: boolean | OpenApiSchema
  allOf?: OpenApiSchema[]
  oneOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
}

interface OpenApiSecurityScheme {
  type?: string
  name?: string
  in?: string
  scheme?: string
  bearerFormat?: string
  flows?: Record<string, unknown>
  description?: string
}

interface ParameterSummary {
  name: string
  in: string
  type: string
  required: boolean
  description: string
  schemaRefs: string[]
}

interface ResponseSummary {
  code: string
  description: string
  schemaRefs: string[]
}

interface ExampleTarget {
  name: string
  packageName: string
  port: number
  petstoreFixture?: boolean
}

interface OperationSummary {
  operationId: string
  method: HttpMethod
  path: string
  tag: string
  label: string
  description: string
  parameters: ParameterSummary[]
  responses: ResponseSummary[]
  requestBodyContentTypes: string[]
  schemaRefs: string[]
}

interface TagSummary {
  name: string
  description: string
  operationCount: number
}

interface ModelSummary {
  name: string
  propertyNames: string[]
}

interface ApiSummary {
  title: string
  version: string
  description: string
  documentVersion: string
  tags: TagSummary[]
  operations: OperationSummary[]
  models: ModelSummary[]
  securitySchemes: string[]
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
  const models = collectModels(document)
  const tags = collectTags(document, operations)
  return {
    title: document.info?.title ?? 'OpenAPI',
    version: document.info?.version ?? '',
    description: document.info?.description ?? '',
    documentVersion: document.swagger?.startsWith('2') ? '2.0' : '3.x',
    tags,
    operations,
    models,
    securitySchemes: Object.keys(
      document.components?.securitySchemes ?? document.securityDefinitions ?? {}
    )
  }
}

function collectOperations(document: OpenApiDocument): OperationSummary[] {
  const operations: OperationSummary[] = []
  for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
    const commonParameters = Array.isArray((pathItem as { parameters?: unknown }).parameters)
      ? ((pathItem as { parameters: OpenApiParameter[] }).parameters ?? [])
      : []
    for (const method of METHODS) {
      const operation = pathItem[method] as OpenApiOperation | undefined
      if (!operation || typeof operation !== 'object') continue
      const parameters = [...commonParameters, ...(operation.parameters ?? [])].map(
        parameterSummary
      )
      const requestBodyContentTypes = Object.keys(operation.requestBody?.content ?? {})
      const responses = Object.entries(operation.responses ?? {}).map(([code, response]) =>
        responseSummary(code, response)
      )
      operations.push({
        operationId: operation.operationId ?? officialGeneratedOperationId(apiPath, method),
        method,
        path: apiPath,
        tag: operation.tags?.[0] ?? 'default',
        label: operation.summary || operation.description || apiPath,
        description: operation.description ?? '',
        parameters,
        responses,
        requestBodyContentTypes,
        schemaRefs: unique([
          ...parameters.flatMap((parameter) => parameter.schemaRefs),
          ...responses.flatMap((response) => response.schemaRefs),
          ...schemaRefsFromObject(operation.requestBody)
        ])
      })
    }
  }
  return operations
}

function collectTags(document: OpenApiDocument, operations: OperationSummary[]): TagSummary[] {
  const tagDescriptions = new Map(
    (document.tags ?? [])
      .filter((tag) => tag.name)
      .map((tag) => [tag.name as string, tag.description ?? ''])
  )
  const counts = new Map<string, number>()
  for (const operation of operations) {
    counts.set(operation.tag, (counts.get(operation.tag) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, operationCount]) => ({
    name,
    description: tagDescriptions.get(name) ?? '',
    operationCount
  }))
}

function collectModels(document: OpenApiDocument): ModelSummary[] {
  return Object.entries(document.components?.schemas ?? document.definitions ?? {}).map(
    ([name, schema]) => ({
      name,
      propertyNames: Object.keys(schema.properties ?? {})
    })
  )
}

function parameterSummary(parameter: OpenApiParameter): ParameterSummary {
  return {
    name: parameter.name ?? '',
    in: parameter.in ?? '',
    type: schemaType(parameter.schema) || parameter.type || '',
    required: Boolean(parameter.required),
    description: parameter.description ?? '',
    schemaRefs: unique([
      ...schemaRefsFromObject(parameter.schema),
      ...schemaRefsFromObject(parameter)
    ])
  }
}

function responseSummary(code: string, response: OpenApiResponse): ResponseSummary {
  return {
    code,
    description: response.description ?? '',
    schemaRefs: unique([
      ...schemaRefsFromObject(response.schema),
      ...schemaRefsFromObject(response.content)
    ])
  }
}

async function assertSummerKnife4jPage(page: Page, url: string, summary: ApiSummary) {
  await page.goto(url)
  await routePetstoreFixture(page)
  await expect(page.locator('#knife4j-doc-app')).toBeVisible()
  await expect(page.getByRole('heading', { name: summary.title })).toBeVisible()
  await assertSummerDocumentOverview(page, summary)

  const sampledOperations = operationSamples(summary)
  const firstOperation = sampledOperations[0]
  expect(firstOperation).toBeTruthy()
  for (const operation of sampledOperations) {
    await assertSummerOperationNavigation(page, operation)
  }

  const search = page.getByPlaceholder('输入接口名称、路径或方法')
  await search.fill(firstOperation.path)
  await expect(page.locator('body')).toContainText(firstOperation.path)
  await expect(page.locator('.operation-link')).toHaveCount(1)
  await search.fill('')
  await expect(page.locator('.operation-link')).toHaveCount(summary.operations.length)

  await assertSummerOperationDetail(page, firstOperation)
  await assertSummerDebug(page, firstOperation)
  await assertSummerModels(page, summary)
  await assertSummerSettings(page)
  await assertSummerExports(page, summary)
}

async function assertSummerDocumentOverview(page: Page, summary: ApiSummary) {
  await expect(page.locator('body')).toContainText(summary.documentVersion)
  if (summary.version) await expect(page.locator('body')).toContainText(`版本 ${summary.version}`)
  await expect(page.locator('body')).toContainText(`${summary.operations.length} APIs`)
  await expect(page.locator('body')).toContainText(`${summary.models.length} Models`)
  await expect(page.locator('.tag-title')).toHaveCount(summary.tags.length)
  await expect(page.locator('.operation-link')).toHaveCount(summary.operations.length)
  for (const tag of summary.tags) {
    await expect(page.locator('body')).toContainText(tag.name)
    await expect(page.locator('body')).toContainText(String(tag.operationCount))
  }
}

async function assertSummerOperationNavigation(page: Page, operation: OperationSummary) {
  const link = operationLink(page, operation)
  await expect(link).toBeVisible()
  await expect(link).toContainText(operation.method.toUpperCase())
  await expect(link).toContainText(operation.path)
  await link.click()
  await expect(page.locator('.operation-head')).toContainText(operation.method.toUpperCase())
  await expect(page.locator('.operation-head')).toContainText(operation.path)
  await expect(page.getByRole('heading', { name: operation.label })).toBeVisible()
}

async function assertSummerOperationDetail(page: Page, operation: OperationSummary) {
  await operationLink(page, operation).click()
  await expect(page.getByRole('heading', { name: '请求参数' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '响应状态' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '响应模型' })).toBeVisible()
  for (const parameter of operation.parameters) {
    await expect(page.locator('.panel')).toContainText(parameter.name)
    if (parameter.in) await expect(page.locator('.panel')).toContainText(parameter.in)
    if (parameter.description)
      await expect(page.locator('.panel')).toContainText(parameter.description)
  }
  for (const response of operation.responses) {
    await expect(page.locator('.panel')).toContainText(response.code)
    if (response.description)
      await expect(page.locator('.panel')).toContainText(response.description)
  }
  for (const ref of operation.schemaRefs) {
    await expect(page.locator('.panel')).toContainText(ref)
  }
}

async function assertSummerDebug(page: Page, operation: OperationSummary) {
  await operationLink(page, operation).click()
  await page.getByRole('button', { name: '调试' }).click()
  await expect(page.getByRole('button', { name: /发送/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '请求历史' })).toBeVisible()
  await expect(page.locator('.debug-url input')).toBeVisible()
  await expect(page.locator('.debug-url input')).toHaveAttribute('placeholder', /.+/)
  for (const parameter of operation.parameters.filter((item) =>
    ['path', 'query', 'header'].includes(item.in)
  )) {
    await expect(page.locator('.debug-params')).toContainText(parameter.in)
    await expect(page.locator('.debug-params')).toContainText(parameter.name)
  }
  if (
    operation.parameters.some((item) => item.in === 'body') ||
    operation.requestBodyContentTypes.length > 0
  ) {
    await expect(page.locator('.request-editor')).not.toHaveValue('')
  }
  await page.getByRole('button', { name: /发送/ }).click()
  await expect(page.locator('.history-list')).toContainText(operation.method.toUpperCase())
  await expect(page.locator('.history-list')).toContainText(operation.path.split('{')[0])
  await expect(page.locator('.response-box')).toBeVisible()
}

async function assertSummerModels(page: Page, summary: ApiSummary) {
  await page.getByRole('button', { name: '模型' }).click()
  if (summary.models.length > 0) {
    await expect(page.locator('.model-pill')).toHaveCount(summary.models.length)
    for (const model of modelSamples(summary)) {
      await page.locator('.model-pill').filter({ hasText: model.name }).click()
      await expect(page.locator('.model-pill.active')).toContainText(model.name)
      await expect(page.locator('.panel h2')).toContainText(model.name)
      for (const property of model.propertyNames.slice(0, 4)) {
        await expect(page.locator('.panel')).toContainText(property)
      }
    }
  }
}

async function assertSummerSettings(page: Page) {
  await page.getByRole('button', { name: '全局参数' }).click()
  await expect(page.getByRole('heading', { name: '鉴权' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '全局参数' })).toBeVisible()
  const authPanel = page.locator('.settings-grid > div').first()
  const parameterPanel = page.locator('.settings-grid > div').nth(1)
  await page.getByRole('button', { name: '添加鉴权' }).click()
  await expect(authPanel.locator('input[placeholder="Header"]').last()).toHaveValue('Authorization')
  await expect(authPanel.locator('input[placeholder="Value"]').last()).toHaveValue('Bearer ')
  await page.getByRole('button', { name: '添加参数' }).click()
  await expect(parameterPanel.locator('select.k-input').last()).toBeVisible()
  await expect(parameterPanel.locator('input[placeholder="Name"]').last()).toBeVisible()
}

async function assertSummerExports(page: Page, summary: ApiSummary) {
  await page.getByRole('button', { name: '离线文档' }).click()
  await assertDownload(page, 'OpenAPI JSON', 'openapi.json', summary.title)
  await assertDownload(page, 'Markdown', 'openapi.md', `# ${summary.title}`)
  await assertDownload(page, 'HTML', 'openapi.html', '<!doctype html>')
  await assertDownload(page, 'Word', 'openapi.doc', summary.title)
}

async function assertOfficialKnife4jPage(page: Page, url: string, summary: ApiSummary) {
  await page.goto(url)
  await routePetstoreFixture(page)

  await expect(page.locator('#app').first()).toBeVisible()
  await expect(page.locator('body')).toContainText(summary.title)
  await assertOfficialDocumentOverview(page, summary)

  for (const operation of operationSamples(summary)) {
    await assertOfficialOperation(page, operation)
  }
  await assertOfficialSearch(page, summary)
  await assertOfficialModels(page, summary)
  await assertOfficialManagementEntries(page, summary)
}

async function assertOfficialDocumentOverview(page: Page, summary: ApiSummary) {
  await expect(page.locator('body')).toContainText(
    `接口统计信息${summary.operations[0].method.toUpperCase()}`
  )
  await expect(page.locator('body')).toContainText(/Swagger Models|文档管理/)
  await expect(page.locator('body')).toContainText(/全局参数|离线文档/)
  for (const tag of summary.tags) {
    await expect(page.locator('body')).toContainText(tag.name)
  }
}

async function assertOfficialOperation(page: Page, operation: OperationSummary) {
  await expect(page.locator('body')).toContainText(operation.method.toUpperCase())
  await clickOfficialOperation(page, operation)
  await expect(page.locator('body')).toContainText(/请求参数|响应状态/)
  await expect(page.locator('body')).toContainText(operation.path)
  if (operation.label && operation.label !== operation.path) {
    await expect(page.locator('body')).toContainText(operation.label)
  }
  for (const parameter of operation.parameters.slice(0, 3)) {
    await expect(page.locator('body')).toContainText(parameter.name)
  }
  for (const response of operation.responses.slice(0, 3)) {
    await expect(page.locator('body')).toContainText(response.code)
    if (response.description) await expect(page.locator('body')).toContainText(response.description)
  }
}

async function clickOfficialOperation(page: Page, operation: OperationSummary) {
  const method = operation.method.toUpperCase()
  const pathText = officialPathText(operation.path)
  const tagMenu = page.locator('.ant-menu-submenu-title').filter({ hasText: operation.tag }).first()
  if (await tagMenu.isVisible().catch(() => false)) {
    await tagMenu.click()
  }
  const operationEntry = page.locator('a').filter({
    hasText: new RegExp(`${method}.*${escapeRegExp(pathText)}|${escapeRegExp(pathText)}.*${method}`)
  })
  if ((await operationEntry.count()) > 0) {
    await operationEntry.first().click()
    return
  }

  await page.evaluate(
    ({ methodText, operationId, text }) => {
      const candidates = [...document.querySelectorAll('a')]
      const link = candidates.find((item) => {
        const content = item.textContent ?? ''
        const href = item.getAttribute('href') ?? ''
        return (
          content.includes(methodText) &&
          (content.includes(text) ||
            content.includes(operationId) ||
            href.includes(operationId) ||
            href.includes(encodeURIComponent(operationId)))
        )
      })
      if (!(link instanceof HTMLElement)) {
        throw new Error(
          `Official Knife4j operation link not found: ${methodText} ${text} ${operationId}`
        )
      }
      link.click()
    },
    { methodText: method, operationId: operation.operationId, text: pathText }
  )
}

async function assertOfficialSearch(page: Page, summary: ApiSummary) {
  const firstOperation = summary.operations[0]
  const searchInput = page.locator('input').filter({ hasText: /^$/ }).first()
  await expect(searchInput).toBeVisible()
  await searchInput.fill(firstOperation.path)
  await expect(page.locator('body')).toContainText(firstOperation.path)
  await searchInput.fill('')
}

async function assertOfficialModels(page: Page, summary: ApiSummary) {
  if (summary.models.length === 0) return
  await expect(page.locator('body')).toContainText(/Swagger Models/)
  for (const model of modelSamples(summary)) {
    await expect(page.locator('body')).toContainText(model.name)
  }
}

async function assertOfficialManagementEntries(page: Page, summary: ApiSummary) {
  if (summary.securitySchemes.length > 0) {
    await expect(page.locator('body')).toContainText(/Authorize|授权|鉴权/)
  }
  await expect(page.locator('body')).toContainText(/全局参数设置|全局参数/)
  await expect(page.locator('body')).toContainText(/离线文档/)
}

function operationLink(page: Page, operation: OperationSummary): Locator {
  return page.locator('.operation-link').filter({ hasText: operation.path }).first()
}

function operationSamples(summary: ApiSummary): OperationSummary[] {
  const samples = new Map<string, OperationSummary>()
  for (const operation of summary.operations) {
    samples.set(operationKey(operation), operation)
  }
  const withParameter = summary.operations.find((operation) => operation.parameters.length > 0)
  if (withParameter) samples.set(operationKey(withParameter), withParameter)
  const withBody = summary.operations.find(
    (operation) =>
      operation.parameters.some((parameter) => parameter.in === 'body') ||
      operation.requestBodyContentTypes.length > 0
  )
  if (withBody) samples.set(operationKey(withBody), withBody)
  const withSchema = summary.operations.find((operation) => operation.schemaRefs.length > 0)
  if (withSchema) samples.set(operationKey(withSchema), withSchema)
  for (const operation of summary.operations) {
    if (samples.size >= Math.min(4, summary.operations.length)) break
    samples.set(operationKey(operation), operation)
  }
  return [...samples.values()]
}

function modelSamples(summary: ApiSummary): ModelSummary[] {
  return summary.models.slice(0, Math.min(4, summary.models.length))
}

function operationKey(operation: OperationSummary): string {
  return `${operation.method} ${operation.path}`
}

function officialGeneratedOperationId(pathname: string, method: HttpMethod): string {
  return createHash('md5').update(`${pathname}${method.toUpperCase()}`).digest('hex')
}

function officialPathText(pathname: string): string {
  return pathname.replace(/^\//, '')
}

async function assertDownload(
  page: Page,
  buttonName: string,
  expectedFilename: string,
  expectedContent: string
) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: buttonName }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(expectedFilename)
  const stream = await download.createReadStream()
  expect(stream).toBeTruthy()
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    stream
      ?.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      .on('end', resolve)
      .on('error', reject)
  })
  expect(Buffer.concat(chunks).toString('utf8')).toContain(expectedContent)
}

function schemaType(schema?: OpenApiSchema): string {
  if (!schema) return ''
  if (schema.$ref) return refName(schema.$ref)
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  if (schema.type === 'array') return `array<${schemaType(schema.items)}>`
  if (schema.type) return schema.format ? `${schema.type}(${schema.format})` : schema.type
  if (schema.oneOf?.length) return schema.oneOf.map(schemaType).join(' | ')
  if (schema.anyOf?.length) return schema.anyOf.map(schemaType).join(' | ')
  if (schema.allOf?.length) return schema.allOf.map(schemaType).join(' & ')
  return ''
}

function schemaRefsFromObject(value: unknown): string[] {
  const refs: string[] = []
  collectSchemaRefs(value, refs)
  return unique(refs.map(refName))
}

function collectSchemaRefs(value: unknown, refs: string[]) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaRefs(item, refs)
    return
  }
  const record = value as Record<string, unknown>
  if (typeof record.$ref === 'string') refs.push(record.$ref)
  for (const item of Object.values(record)) {
    collectSchemaRefs(item, refs)
  }
}

function refName(ref: string): string {
  return ref.split('/').pop() ?? ref
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
