import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(
  new URL('../components/Knife4jConsole.vue', import.meta.url),
  'utf8'
)

describe('Knife4j brand bar', () => {
  it('shows the summer-rs brand and links the repository in a new window', () => {
    expect(componentSource).toContain('<strong>Knife 4 summer-rs</strong>')
    expect(componentSource).toContain('href="https://github.com/DevDengChao/knife-4-summer-rs"')
    expect(componentSource).toContain('target="_blank"')
    expect(componentSource).toContain('rel="noopener noreferrer"')
    expect(componentSource).toMatch(/>\s*By DevDengChao\s*<\/a/)
  })

  it('uses the Rust orange brand color on the mark background', () => {
    expect(componentSource).toContain('background: #d34516;')
  })
})
