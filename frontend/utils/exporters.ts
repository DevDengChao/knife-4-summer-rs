import type { ApiOperation, ParsedOpenApi } from '../types/openapi'
import { methodLabel } from './openapi'

export function exportMarkdown(api: ParsedOpenApi): string {
  const lines = [`# ${api.title}`, '', api.description, '', `Version: ${api.version}`, ''].filter(
    Boolean
  )
  for (const operation of api.operations) {
    lines.push(
      `## ${methodLabel(operation.method)} ${operation.path}`,
      '',
      operation.summary || operation.description || '',
      '',
      '| Code | Description |',
      '| --- | --- |'
    )
    for (const response of operation.responses) {
      lines.push(`| ${response.code} | ${response.description || '-'} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function exportHtml(api: ParsedOpenApi): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(api.title)}</title></head><body>${api.operations
    .map(operationHtml)
    .join('')}</body></html>`
}

export function exportWordHtml(api: ParsedOpenApi): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}.knife4j-word-title{font-weight:bold;margin-top:16px}.knife4j-word-method{color:#fff;background:#1677ff;padding:2px 6px}</style></head><body><h1>${escapeHtml(api.title)}</h1>${api.operations
    .map(operationHtml)
    .join('')}</body></html>`
}

function operationHtml(operation: ApiOperation): string {
  return `<section><h2><span class="knife4j-word-method">${methodLabel(operation.method)}</span> ${escapeHtml(
    operation.path
  )}</h2><p>${escapeHtml(operation.summary || operation.description || '')}</p></section>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
