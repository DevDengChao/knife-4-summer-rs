import type {
  ApiOperation,
  ApiTagGroup,
  HttpMethod,
  Knife4jDiscoveryGroup,
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSchema,
  ParsedOpenApi
} from '../types/openapi'

const METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']

const METHOD_LABELS: Record<HttpMethod, string> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
  head: 'HEAD',
  options: 'OPTIONS',
  trace: 'TRACE'
}

export function parseOpenApi(document: OpenApiDocument): ParsedOpenApi {
  const operations = collectOperations(document)
  const tagDescriptions = new Map(
    (document.tags ?? [])
      .filter((tag) => tag.name)
      .map((tag) => [tag.name as string, tag.description ?? ''])
  )
  const tags = groupOperations(operations, tagDescriptions)
  const schemaMap = document.components?.schemas ?? document.definitions ?? {}

  return {
    title: document.info?.title ?? 'OpenAPI',
    version: document.info?.version ?? '',
    description: document.info?.description ?? '',
    documentVersion: document.swagger?.startsWith('2') ? '2.0' : '3.x',
    baseUrl: resolveBaseUrl(document),
    tags,
    operations,
    models: Object.entries(schemaMap).map(([name, schema]) => ({ name, schema })),
    securitySchemes: Object.entries(
      document.components?.securitySchemes ?? document.securityDefinitions ?? {}
    ).map(([name, scheme]) => ({ name, scheme })),
    raw: document
  }
}

export function methodLabel(method: HttpMethod): string {
  return METHOD_LABELS[method]
}

export function methodClass(method: HttpMethod): string {
  return `method-${method}`
}

export function operationDisplayName(operation: ApiOperation): string {
  return operation.summary || operation.description || operation.path
}

export function schemaType(schema?: OpenApiSchema): string {
  if (!schema) return 'object'
  if (schema.$ref) return refName(schema.$ref)
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  if (schema.type === 'array') return `array<${schemaType(schema.items)}>`
  if (schema.type) return schema.format ? `${schema.type}(${schema.format})` : schema.type
  if (schema.oneOf?.length) return schema.oneOf.map(schemaType).join(' | ')
  if (schema.anyOf?.length) return schema.anyOf.map(schemaType).join(' | ')
  if (schema.allOf?.length) return schema.allOf.map(schemaType).join(' & ')
  return 'object'
}

export function exampleFromSchema(schema?: OpenApiSchema): unknown {
  if (!schema) return {}
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.$ref) return { [`${refName(schema.$ref)}`]: {} }
  const type = Array.isArray(schema.type)
    ? schema.type.find((item) => item !== 'null')
    : schema.type
  if (type === 'array') return [exampleFromSchema(schema.items)]
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return true
  if (type === 'string') return schema.enum?.[0] ?? ''
  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, exampleFromSchema(value)])
    )
  }
  return {}
}

export function resolveRelativeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = window.location.pathname.replace(/\/(?:doc\.html|doc)?$/, '/')
  const cleanBase = base.endsWith('/') ? base : `${base}/`
  return new URL(url.replace(/^\//, ''), `${window.location.origin}${cleanBase}`).toString()
}

export async function loadDiscoveryGroups(
  fetcher: typeof fetch = fetch
): Promise<Knife4jDiscoveryGroup[]> {
  const candidates = ['/v3/api-docs/swagger-config', '/swagger-resources', '/services.json']

  for (const candidate of candidates) {
    try {
      const response = await fetcher(resolveRelativeUrl(candidate))
      if (!response.ok) continue
      const payload = await response.json()
      const groups = normalizeDiscoveryPayload(payload)
      if (groups.length > 0) return groups
    } catch {
      // Try the next Knife4j discovery mode.
    }
  }

  return [{ name: 'default', url: 'v3/api-docs', swaggerVersion: '3.0.3' }]
}

export function normalizeDiscoveryPayload(payload: unknown): Knife4jDiscoveryGroup[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
      .map((item) => ({
        name: String(item.name ?? item.serviceId ?? 'default'),
        url: String(item.url ?? item.location ?? ''),
        location: item.location ? String(item.location) : undefined,
        swaggerVersion: item.swaggerVersion ? String(item.swaggerVersion) : undefined
      }))
      .filter((item) => item.url)
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { urls?: unknown }).urls)
  ) {
    return (payload as { urls: Array<Record<string, unknown>> }).urls
      .map((item) => ({
        name: String(item.name ?? 'default'),
        url: String(item.url ?? ''),
        swaggerVersion: '3.0.3'
      }))
      .filter((item) => item.url)
  }
  return []
}

function collectOperations(document: OpenApiDocument): ApiOperation[] {
  const operations: ApiOperation[] = []
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const commonParameters = Array.isArray((pathItem as { parameters?: unknown }).parameters)
      ? (pathItem as { parameters: OpenApiParameter[] }).parameters
      : []
    for (const method of METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenApiOperation
        | undefined
      if (!operation || typeof operation !== 'object') continue
      const tag = operation.tags?.[0] ?? 'default'
      const requestBodyContentTypes = Object.keys(operation.requestBody?.content ?? {})
      const consumes = operation.consumes ?? requestBodyContentTypes
      const produces =
        operation.produces ?? Object.keys(firstJsonObject(operation.responses)?.content ?? {})
      operations.push({
        id: operation.operationId ?? `${method}-${path}`,
        method,
        path,
        tag,
        summary: operation.summary ?? '',
        description: operation.description ?? '',
        deprecated: Boolean(operation.deprecated),
        consumes,
        produces,
        parameters: [...commonParameters, ...(operation.parameters ?? [])],
        rawRequestBodyContent: operation.requestBody?.content ?? {},
        requestBodyContentTypes,
        responses: Object.entries(operation.responses ?? {}).map(([code, response]) => ({
          code,
          description: response.description ?? '',
          schema: response.schema ?? firstSchema(response.content)
        })),
        security: operation.security ?? document.security ?? []
      })
    }
  }
  return operations
}

function groupOperations(
  operations: ApiOperation[],
  tagDescriptions: Map<string, string>
): ApiTagGroup[] {
  const groups = new Map<string, ApiTagGroup>()
  for (const operation of operations) {
    if (!groups.has(operation.tag)) {
      groups.set(operation.tag, {
        name: operation.tag,
        description: tagDescriptions.get(operation.tag) ?? '',
        operations: []
      })
    }
    groups.get(operation.tag)?.operations.push(operation)
  }
  return [...groups.values()]
}

function resolveBaseUrl(document: OpenApiDocument): string {
  if (document.servers?.[0]?.url) return document.servers[0].url
  const scheme = document.schemes?.[0] ?? window.location.protocol.replace(':', '')
  const host = document.host ?? window.location.host
  const basePath = document.basePath ?? ''
  return `${scheme}://${host}${basePath}`
}

function firstJsonObject<T>(record?: Record<string, T>): T | undefined {
  if (!record) return undefined
  return Object.values(record)[0]
}

function firstSchema(
  content?: Record<string, { schema?: OpenApiSchema }>
): OpenApiSchema | undefined {
  if (!content) return undefined
  return Object.values(content).find((item) => item.schema)?.schema
}

function refName(ref: string): string {
  return ref.split('/').pop() ?? ref
}
