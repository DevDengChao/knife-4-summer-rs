import { describe, expect, it, vi } from 'vitest'
import petstore from '../fixtures/petstore.json'
import { exportMarkdown } from '../utils/exporters'
import { normalizeDiscoveryPayload, parseOpenApi, schemaType } from '../utils/openapi'
import type { OpenApiDocument } from '../types/openapi'

describe('OpenAPI parser', () => {
  it('parses the petstore swagger 2 document into Knife4j navigation groups', () => {
    vi.stubGlobal('window', {
      location: {
        protocol: 'https:',
        host: 'example.test',
        pathname: '/doc.html',
        origin: 'https://example.test'
      }
    })

    const api = parseOpenApi(petstore as OpenApiDocument)

    expect(api.title).toBe('Swagger Petstore')
    expect(api.documentVersion).toBe('2.0')
    expect(api.baseUrl).toBe('https://petstore.swagger.io/v2')
    expect(api.tags.map((tag) => tag.name)).toEqual(['pet', 'store'])
    expect(api.operations.map((operation) => `${operation.method} ${operation.path}`)).toEqual([
      'get /pet/{petId}',
      'post /store/order'
    ])
    expect(api.models.map((model) => model.name)).toEqual(['Pet', 'Order'])
    expect(schemaType(api.models[0].schema.properties?.id)).toBe('integer(int64)')
  })

  it('normalizes springdoc and springfox discovery payloads', () => {
    expect(normalizeDiscoveryPayload({ urls: [{ name: 'default', url: 'v3/api-docs' }] })).toEqual([
      { name: 'default', url: 'v3/api-docs', swaggerVersion: '3.0.3' }
    ])
    expect(normalizeDiscoveryPayload([{ name: 'petstore', location: 'petstore.json' }])).toEqual([
      {
        name: 'petstore',
        url: 'petstore.json',
        location: 'petstore.json',
        swaggerVersion: undefined
      }
    ])
  })

  it('exports markdown documents for offline Knife4j-style sharing', () => {
    const api = parseOpenApi(petstore as OpenApiDocument)
    const markdown = exportMarkdown(api)

    expect(markdown).toContain('# Swagger Petstore')
    expect(markdown).toContain('## GET /pet/{petId}')
    expect(markdown).toContain('| 404 | Pet not found |')
  })
})
