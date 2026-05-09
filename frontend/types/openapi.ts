export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace'

export interface OpenApiDocument {
  openapi?: string
  swagger?: string
  info?: {
    title?: string
    version?: string
    description?: string
    termsOfService?: string
    contact?: Record<string, unknown>
    license?: Record<string, unknown>
  }
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

export interface OpenApiOperation {
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

export interface OpenApiParameter {
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

export interface OpenApiResponse {
  description?: string
  schema?: OpenApiSchema
  content?: Record<string, { schema?: OpenApiSchema; example?: unknown; examples?: unknown }>
  headers?: Record<string, OpenApiParameter>
}

export interface OpenApiSchema {
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

export interface OpenApiSecurityScheme {
  type?: string
  name?: string
  in?: string
  scheme?: string
  bearerFormat?: string
  flows?: Record<string, unknown>
  description?: string
}

export interface ApiOperation {
  id: string
  method: HttpMethod
  path: string
  tag: string
  summary: string
  description: string
  deprecated: boolean
  consumes: string[]
  produces: string[]
  parameters: OpenApiParameter[]
  rawRequestBodyContent: Record<
    string,
    { schema?: OpenApiSchema; example?: unknown; examples?: unknown }
  >
  requestBodyContentTypes: string[]
  responses: Array<{ code: string; description: string; schema?: OpenApiSchema }>
  security: Array<Record<string, string[]>>
}

export interface ApiTagGroup {
  name: string
  description: string
  operations: ApiOperation[]
}

export interface ParsedOpenApi {
  title: string
  version: string
  description: string
  documentVersion: '2.0' | '3.x'
  baseUrl: string
  tags: ApiTagGroup[]
  operations: ApiOperation[]
  models: Array<{ name: string; schema: OpenApiSchema }>
  securitySchemes: Array<{ name: string; scheme: OpenApiSecurityScheme }>
  raw: OpenApiDocument
}

export interface Knife4jDiscoveryGroup {
  name: string
  url: string
  location?: string
  swaggerVersion?: string
}
