import { describe, expect, it } from 'vitest'
import type { MemoryFile } from '@deepseek-ai/dsh-memory/src/files.ts'
import { renderMemoryContext } from '@deepseek-ai/dsh-memory/src/render.ts'

function file(displayPath: string, content: string): MemoryFile {
  return { absolutePath: `/abs/${displayPath}`, displayPath, content, digest: 'd' }
}

describe('renderMemoryContext', () => {
  it('wraps every note in a system-reminder frame', () => {
    const rendered = renderMemoryContext([
      file('.agents/memory/one.md', 'first'),
      file('~/.agents/memory/two.md', 'second'),
    ], 65536)
    expect(rendered.text).toContain('<system-reminder>')
    expect(rendered.text).toContain('</system-reminder>')
    expect(rendered.text).toContain('Memory from: .agents/memory/one.md')
    expect(rendered.text).toContain('first')
    expect(rendered.text).toContain('Memory from: ~/.agents/memory/two.md')
    expect(rendered.text).toContain('second')
    expect(rendered.included).toHaveLength(2)
  })

  it('returns empty when no notes are present', () => {
    expect(renderMemoryContext([], 65536)).toEqual({ text: '', included: [] })
  })

  it('drops the earliest notes to fit the byte budget', () => {
    const first = file('.agents/memory/a.md', 'a'.repeat(4000))
    const last = file('.agents/memory/b.md', 'b'.repeat(200))
    const rendered = renderMemoryContext([first, last], 1000)
    expect(rendered.included).toEqual([last])
    expect(rendered.text).toContain('bbbb')
    expect(rendered.text).not.toContain('aaaa')
  })

  it('keeps a single oversized note rather than dropping everything', () => {
    const big = file('.agents/memory/big.md', 'x'.repeat(5000))
    const rendered = renderMemoryContext([big], 100)
    expect(rendered.included).toEqual([big])
    expect(rendered.text).toContain('xxxxx')
  })
})
