// @vitest-environment jsdom
/**
 * CatalogPanel interaction spec: the trigger opens the modal, the project's
 * skills and memory render as grouped rows, and selecting a row loads and
 * shows the entry's full content.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { AgentsCatalogList, CatalogEntry, CatalogRef } from '@deepseek-ai/dsh-agents-catalog/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'
import { CatalogPanel } from '../src/client/CatalogPanel.tsx'
import type { CatalogPanelProps } from '../src/client/CatalogPanel.tsx'

const t = makeTranslate(zh, commonZh) as CatalogPanelProps['t']

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const CATALOG: AgentsCatalogList = {
  skills: [
    { name: 'example-skill', description: 'an example skill', modelInvocable: true, userInvocable: true, source: 'project-dsh', provider: 'runtime' },
  ],
  memory: [
    { name: 'note.md', displayPath: '.agents/memory/note.md' },
  ],
}

/** Minimal sessions-state feed: one current session. */
const useSessions = (selector: (state: { current: SessionId }) => unknown) => selector({ current: 'session-1' as SessionId })

/** Minimal workspaces-state feed: no workspaces. */
const useWorkspaces = (selector: (state: unknown) => unknown) => selector({})

function renderPanel(overrides: Partial<Parameters<typeof CatalogPanel>[0]> = {}) {
  const list = vi.fn(async (): Promise<{ ok: true; value: AgentsCatalogList }> => ({ ok: true, value: CATALOG }))
  const read = vi.fn(async (_id: SessionId, ref: CatalogRef): Promise<{ ok: true; value: CatalogEntry }> => ({
    ok: true,
    value: ref.kind === 'skill'
      ? { kind: 'skill', name: 'example-skill', content: '# do the example' }
      : { kind: 'memory', name: 'note.md', displayPath: '.agents/memory/note.md', content: '# note body' },
  }))
  render(<CatalogPanel wide useSessions={useSessions as CatalogPanelProps['useSessions']} useWorkspaces={useWorkspaces as CatalogPanelProps['useWorkspaces']} list={list} read={read} t={t} {...overrides} />)
  return { list, read }
}

describe('CatalogPanel', () => {
  it('renders the footer trigger with its label', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '技能与记忆' })).toBeTruthy()
  })

  it('opens the modal and lists skills and memory groups', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '技能与记忆' }))
    expect(await screen.findByText('技能')).toBeTruthy()
    expect(await screen.findByText('example-skill')).toBeTruthy()
    expect(await screen.findByText('记忆')).toBeTruthy()
    expect(await screen.findByText('note.md')).toBeTruthy()
  })

  it('shows the selected skill body and returns to the list', async () => {
    const { read } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '技能与记忆' }))
    fireEvent.click(await screen.findByText('example-skill'))
    expect(await screen.findByText('# do the example')).toBeTruthy()
    expect(read).toHaveBeenCalledWith('session-1', { kind: 'skill', id: 'example-skill' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(await screen.findByText('记忆')).toBeTruthy()
  })
})
