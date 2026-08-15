// @vitest-environment jsdom
// DiffBlock: the side-by-side (default) and inline views over per-file hunks —
// the path header and same-file gap chrome, the line-aligned rows (context
// stays aligned; removed/added/modified rows land on the correct side with
// per-side line numbers), the `+A -R · N file(s)` footer counting only genuine
// changes (context excluded), the side-by-side ↔ inline toggle, the syntax
// highlighting for a known extension and its plain fallback, the highlight
// budget, the head/tail height cap and expand control, the empty-diffs null
// render, and the copy control writing the unified diff text on the accepted
// and refused clipboard paths. writeClipboard's own return contract is pinned in
// terminal-block.spec.tsx (the shared return contract), so only its DOM
// consequence is asserted here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_DIFF_MAX_LINES, DiffBlock } from '../src/index.ts'
import { langFromPath } from '../src/DiffBlock.tsx'

afterEach(cleanup)

beforeEach(() => {
  vi.useRealTimers()
})

/** The change rows bearing a given role (`add`/`del`/`mod`/`ctx`). */
function roleRows(container: HTMLElement, role: string): Element[] {
  return [...container.querySelectorAll(`[data-role="${role}"]`)]
}

/** The text of one side's content cells, in order (side-by-side view). */
function sideTexts(container: HTMLElement, side: 'left' | 'right'): string[] {
  return [...container.querySelectorAll(`[data-side="${side}"]`)].map(cell => cell.textContent ?? '')
}

/** One side's gutter numbers, in order (side-by-side view). */
function gutters(container: HTMLElement, side: 'left' | 'right'): string[] {
  return [...container.querySelectorAll(`[data-gutter="${side}"]`)].map(cell => cell.textContent ?? '')
}

/** `count` numbered added lines as one hunk's newText. */
function added(count: number): string {
  return Array.from({ length: count }, (_v, i) => `line ${i + 1}`).join('\n')
}

describe('langFromPath', () => {
  it('maps a known extension to its language hint, case-insensitively', () => {
    expect(langFromPath('src/a.ts')).toBe('ts')
    expect(langFromPath('src/a.TSX')).toBe('tsx')
    expect(langFromPath('conf.yml')).toBe('yaml')
    expect(langFromPath('README.md')).toBe('md')
    expect(langFromPath('C:\\src\\main.rs')).toBe('rs')
  })

  it('returns undefined for a dotfile, a multi-part or unknown extension, or no extension', () => {
    expect(langFromPath('a.py.bak')).toBeUndefined()
    expect(langFromPath('archive.tar.gz')).toBeUndefined()
    expect(langFromPath('/dir.py/plain')).toBeUndefined()
    expect(langFromPath('.gitignore')).toBeUndefined()
    expect(langFromPath('/etc/hosts')).toBeUndefined()
    expect(langFromPath('data.unknownext')).toBeUndefined()
    expect(langFromPath('trailingdot.')).toBeUndefined()
  })

  it('never resolves an Object.prototype extension name', () => {
    expect(langFromPath('foo.constructor')).toBeUndefined()
    expect(langFromPath('foo.__proto__')).toBeUndefined()
    expect(langFromPath('foo.hasOwnProperty')).toBeUndefined()
  })
})

describe('DiffBlock side-by-side structure', () => {
  it('renders a create as a path header and an added right pane (no left pane)', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'notes/new.txt', oldText: null, newText: 'hello\nworld' }]} />)
    expect(screen.getByText('notes/new.txt')).toBeTruthy()
    expect(roleRows(container, 'add')).toHaveLength(2)
    expect(roleRows(container, 'del')).toHaveLength(0)
    expect(sideTexts(container, 'left')).toEqual(['', ''])
    expect(sideTexts(container, 'right')).toEqual(['hello', 'world'])
  })

  it('renders an edit as one modified row pairing the removed and added lines', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'old', newText: 'new' }]} />)
    expect(roleRows(container, 'mod')).toHaveLength(1)
    expect(sideTexts(container, 'left')).toEqual(['old'])
    expect(sideTexts(container, 'right')).toEqual(['new'])
  })

  it('keeps context lines aligned and counts only genuine changes in the footer', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb\nc', newText: 'a\nX\nc' }]} />)
    expect(roleRows(container, 'ctx')).toHaveLength(2)
    expect(roleRows(container, 'mod')).toHaveLength(1)
    expect(sideTexts(container, 'left')).toEqual(['a', 'b', 'c'])
    expect(sideTexts(container, 'right')).toEqual(['a', 'X', 'c'])
    expect(screen.getByText('└ +1 -1 · 1 file')).toBeTruthy()
  })

  it('numbers each side per hunk, advancing only the changed side', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb', newText: '' }]} />)
    expect(gutters(container, 'left')).toEqual(['1', '2'])
    expect(gutters(container, 'right')).toEqual(['', ''])
  })

  it('opens a same-file second hunk with a gap instead of repeating the path', () => {
    const { container } = render(
      <DiffBlock diffs={[{ path: 'a.txt', oldText: 'x', newText: 'y' }, { path: 'a.txt', oldText: 'p', newText: 'q' }]} />,
    )
    expect(roleRows(container, 'mod')).toHaveLength(2)
    expect([...container.querySelectorAll('[class*="_gap_"]')]).toHaveLength(1)
    expect([...container.querySelectorAll('[class*="_path_"]')]).toHaveLength(1)
  })

  it('opens a new file with its own path header', () => {
    const { container } = render(
      <DiffBlock diffs={[{ path: 'a.txt', oldText: 'x', newText: 'y' }, { path: 'b.txt', oldText: 'p', newText: 'q' }]} />,
    )
    expect([...container.querySelectorAll('[class*="_path_"]')]).toHaveLength(2)
    expect([...container.querySelectorAll('[class*="_gap_"]')]).toHaveLength(0)
  })

  it('renders nothing for empty diffs', () => {
    const { container } = render(<DiffBlock diffs={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('treats a trailing newline as a terminator, not an extra blank line', () => {
    render(<DiffBlock diffs={[{ path: 'n.txt', oldText: null, newText: 'hello\n' }]} />)
    expect(screen.getByText('└ +1 -0 · 1 file')).toBeTruthy()
  })

  it('renders a full deletion as removed-only with no phantom added line', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'gone.txt', oldText: 'a\nb', newText: '' }]} />)
    expect(roleRows(container, 'add')).toHaveLength(0)
    expect(roleRows(container, 'del')).toHaveLength(2)
    expect(screen.getByText('└ +0 -2 · 1 file')).toBeTruthy()
  })

  it('keeps a genuine interior blank line', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: 'x\n\ny' }]} />)
    expect(roleRows(container, 'add')).toHaveLength(3)
  })

  it('pads the shorter left side of an uneven modification', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a', newText: 'x\ny' }]} />)
    expect(sideTexts(container, 'left')).toEqual(['a', ''])
    expect(sideTexts(container, 'right')).toEqual(['x', 'y'])
    expect(screen.getByText('└ +2 -1 · 1 file')).toBeTruthy()
  })

  it('pads the shorter right side of an uneven modification', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb', newText: 'x' }]} />)
    expect(sideTexts(container, 'left')).toEqual(['a', 'b'])
    expect(sideTexts(container, 'right')).toEqual(['x', ''])
    expect(screen.getByText('└ +1 -2 · 1 file')).toBeTruthy()
  })
})

describe('DiffBlock toggle and inline view', () => {
  it('defaults to side-by-side and switches to inline on the toggle', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'old', newText: 'new' }]} />)
    expect(container.querySelector('[data-diff]')?.getAttribute('data-mode')).toBe('split')
    expect(screen.getByRole('button', { name: '并排' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '行内' }))
    expect(container.querySelector('[data-diff]')?.getAttribute('data-mode')).toBe('inline')
    expect(screen.getByRole('button', { name: '行内' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '并排' }))
    expect(container.querySelector('[data-diff]')?.getAttribute('data-mode')).toBe('split')
  })

  it('renders the inline view as a unified `-`/`+`/` ` diff', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb\nc', newText: 'a\nX\nc' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '行内' }))
    const prefixes = [...container.querySelectorAll('[class*="_prefix_"]')].map(span => span.textContent)
    expect(prefixes).toEqual([' ', '-', '+', ' '])
    expect(roleRows(container, 'ctx')).toHaveLength(2)
    expect(roleRows(container, 'del')).toHaveLength(1)
    expect(roleRows(container, 'add')).toHaveLength(1)
  })

  it('renders the inline gap separator for a same-file second hunk', () => {
    const { container } = render(
      <DiffBlock diffs={[{ path: 'a.txt', oldText: 'x', newText: 'y' }, { path: 'a.txt', oldText: 'p', newText: 'q' }]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '行内' }))
    expect([...container.querySelectorAll('[class*="_gap_"]')]).toHaveLength(1)
    expect([...container.querySelectorAll('[class*="_path_"]')]).toHaveLength(1)
  })

  it('highlights inline-mode code lines for a known extension', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.ts', oldText: 'const a = 1', newText: 'const b = 2' }]} />)
    fireEvent.click(screen.getByRole('button', { name: '行内' }))
    expect(container.querySelectorAll('[class*="_content_"] span[style]').length).toBeGreaterThan(1)
  })

  it('caps and expands the inline view', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: added(10) }]} maxLines={4} />)
    fireEvent.click(screen.getByRole('button', { name: '行内' }))
    const toggle = screen.getByRole('button', { name: '展开其余 7 行差异' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '收起差异' })).toBeTruthy()
    expect(roleRows(container, 'add')).toHaveLength(10)
  })
})

describe('DiffBlock syntax highlighting', () => {
  it('highlights the code lines for a known extension into token spans', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.ts', oldText: 'const a = 1', newText: 'const b = 2' }]} />)
    const left = container.querySelector('[data-side="left"]')
    const right = container.querySelector('[data-side="right"]')
    expect(left?.querySelectorAll('span[style]').length).toBeGreaterThan(1)
    expect(right?.querySelectorAll('span[style]').length).toBeGreaterThan(1)
    expect(left?.textContent).toBe('const a = 1')
    expect(right?.textContent).toBe('const b = 2')
  })

  it('renders bare text with no span wrappers for an unknown extension', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.unknownext', oldText: 'x', newText: 'y' }]} />)
    const left = container.querySelector('[data-side="left"]')
    expect(left?.querySelectorAll('span').length).toBe(0)
    expect(left?.textContent).toBe('x')
  })

  it('renders a side past the highlight budget as plain text', () => {
    const big = 'x'.repeat(70_000)
    const { container } = render(<DiffBlock diffs={[{ path: 'big.txt', oldText: big, newText: '' }]} />)
    expect(roleRows(container, 'del')).toHaveLength(1)
    expect(container.querySelectorAll('[data-side="left"] span[style]')).toHaveLength(0)
  })
})

describe('DiffBlock footer', () => {
  it('counts added and removed lines and one file', () => {
    render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb', newText: 'c' }]} />)
    expect(screen.getByText('└ +1 -2 · 1 file')).toBeTruthy()
  })

  it('pluralizes the distinct-file count', () => {
    render(
      <DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: 'x' }, { path: 'b.txt', oldText: null, newText: 'y' }]} />,
    )
    expect(screen.getByText('└ +2 -0 · 2 files')).toBeTruthy()
  })
})

describe('DiffBlock height cap', () => {
  it('shows head and tail with an expand control past the cap, then all rows expanded', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: added(10) }]} maxLines={4} />)
    const toggle = screen.getByRole('button', { name: '展开其余 7 行差异' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(roleRows(container, 'add')).toHaveLength(3)

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '收起差异' }).getAttribute('aria-expanded')).toBe('true')
    expect(roleRows(container, 'add')).toHaveLength(10)
  })

  it('shows no expand control at or under the cap', () => {
    render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: added(4) }]} maxLines={16} />)
    expect(screen.queryByRole('button', { name: /展开其余|收起差异/ })).toBeNull()
  })

  it('caps at the documented default when maxLines is absent', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: added(DEFAULT_DIFF_MAX_LINES) }]} />)
    expect(screen.getByRole('button', { name: '展开其余 1 行差异' })).toBeTruthy()
    expect(roleRows(container, 'add').length).toBeLessThan(DEFAULT_DIFF_MAX_LINES)
  })
})

describe('DiffBlock copy', () => {
  it('copies the unified diff text and flips the label on success', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(
      <DiffBlock diffs={[{ path: 'a.txt', oldText: 'old', newText: 'new' }, { path: 'a.txt', oldText: 'p', newText: 'q' }]} />,
    )
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制' })) })
    expect(writeText).toHaveBeenCalledWith('a.txt\n- old\n+ new\n⋯\n- p\n+ q')
    expect(screen.getByRole('button', { name: '复制成功' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
  })

  it('copies context lines with a space prefix', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<DiffBlock diffs={[{ path: 'a.txt', oldText: 'a\nb\nc', newText: 'a\nX\nc' }]} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制' })) })
    expect(writeText).toHaveBeenCalledWith('a.txt\n a\n- b\n+ X\n c')
  })

  it('keeps the label on a refused clipboard write', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: 'x' }]} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制' })) })
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '复制成功' })).toBeNull()
  })

  it('ignores a second click while the copied label is showing', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<DiffBlock diffs={[{ path: 'a.txt', oldText: null, newText: 'x' }]} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制成功' })) })
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
