// @vitest-environment jsdom
/**
 * GitWorkspacePanel interaction spec: the trigger (wide + rail), the modal list
 * with every status badge, selecting a file and showing its diff, per-file and
 * all-files revert (including error and rejection paths), the non-git / clean /
 * no-session degrades, and close via Escape and the header button.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChangedFilesList, FileDiffResult, RevertResult } from '@deepseek-ai/dsh-git-workspace/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'
import { GitWorkspacePanel } from '../src/client/GitWorkspacePanel.tsx'
import type { GitWorkspacePanelProps } from '../src/client/GitWorkspacePanel.tsx'

const t = makeTranslate(zh, commonZh) as GitWorkspacePanelProps['t']

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const FILES: ChangedFilesList = {
  git: true,
  files: [
    { path: 'a.txt', status: 'modified' },
    { path: 'new.txt', status: 'untracked' },
  ],
}

const ALL_FILES: ChangedFilesList = {
  git: true,
  files: [
    { path: 'added.txt', status: 'added' },
    { path: 'modified.txt', status: 'modified' },
    { path: 'deleted.txt', status: 'deleted' },
    { path: 'untracked.txt', status: 'untracked' },
  ],
}

const DIFF: FileDiffResult = { path: 'a.txt', status: 'modified', oldText: 'old line', newText: 'new line' }

/** Minimal sessions-state feed: one current session. */
const useSessions = (selector: (state: { current: SessionId }) => unknown) => selector({ current: 'session-1' as SessionId })

/** No current session. */
const noSessions = (selector: (state: { current: undefined }) => unknown) => selector({ current: undefined })

const useWorkspaces = (selector: (state: unknown) => unknown) => selector({})

interface Mocks {
  changedFiles: ReturnType<typeof vi.fn>
  fileDiff: ReturnType<typeof vi.fn>
  revert: ReturnType<typeof vi.fn>
}

function renderPanel(overrides: Partial<GitWorkspacePanelProps> = {}): Mocks {
  const changedFiles = vi.fn(async (): Promise<{ ok: true; value: ChangedFilesList }> => ({ ok: true, value: FILES }))
  const fileDiff = vi.fn(
    async (_id: SessionId, _path: string): Promise<{ ok: true; value: FileDiffResult | undefined }> =>
      ({ ok: true, value: DIFF }),
  )
  const revert = vi.fn(async (): Promise<{ ok: true; value: RevertResult }> => ({ ok: true, value: { reverted: ['a.txt'] } }))
  render(
    <GitWorkspacePanel
      wide
      useSessions={useSessions as GitWorkspacePanelProps['useSessions']}
      useWorkspaces={useWorkspaces as GitWorkspacePanelProps['useWorkspaces']}
      changedFiles={changedFiles}
      fileDiff={fileDiff}
      revert={revert}
      t={t}
      {...overrides}
    />,
  )
  return { changedFiles, fileDiff, revert }
}

describe('GitWorkspacePanel', () => {
  it('renders the wide footer trigger with its label', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '改动' })).toBeTruthy()
  })

  it('renders the rail trigger without a label when narrow', () => {
    renderPanel({ wide: false } as Partial<GitWorkspacePanelProps>)
    expect(screen.queryByText('改动')).toBeNull()
    expect(document.querySelector('[aria-haspopup="dialog"]')).toBeTruthy()
  })

  it('opens the modal and lists changed files with status badges', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText('工作区改动')).toBeTruthy()
    expect(await screen.findByText('a.txt')).toBeTruthy()
    expect(await screen.findByText('new.txt')).toBeTruthy()
    expect(await screen.findByText('修改')).toBeTruthy()
    expect(await screen.findByText('未跟踪')).toBeTruthy()
    expect(await screen.findByText('2 个文件')).toBeTruthy()
  })

  it('renders every status badge', async () => {
    renderPanel({ changedFiles: vi.fn(async () => ({ ok: true, value: ALL_FILES })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText('新增')).toBeTruthy()
    expect(await screen.findByText('修改')).toBeTruthy()
    expect(await screen.findByText('删除')).toBeTruthy()
    expect(await screen.findByText('未跟踪')).toBeTruthy()
  })

  it('loads and shows the selected file diff', async () => {
    const { fileDiff } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByText('a.txt'))
    expect(await screen.findByText('old line')).toBeTruthy()
    expect(await screen.findByText('new line')).toBeTruthy()
    expect(fileDiff).toHaveBeenCalledWith('session-1', 'a.txt', expect.anything())
  })

  it('keeps the select hint when a diff resolves to undefined', async () => {
    renderPanel({ fileDiff: vi.fn(async () => ({ ok: true, value: undefined })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByText('a.txt'))
    expect(await screen.findByText('选择左侧文件查看改动')).toBeTruthy()
  })

  it('shows a file-diff error when the diff fails', async () => {
    renderPanel({ fileDiff: vi.fn(async () => ({ ok: false, error: { code: 'test', message: 'diff boom', details: {} } })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByText('a.txt'))
    expect(await screen.findByText(/diff boom/)).toBeTruthy()
  })

  it('shows a file-diff error when the diff rejects', async () => {
    renderPanel({ fileDiff: vi.fn(async () => { throw new Error('diff rejected') }) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByText('a.txt'))
    expect(await screen.findByText(/diff rejected/)).toBeTruthy()
  })

  it('reverts one file and refreshes the list', async () => {
    const { revert, changedFiles } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByRole('button', { name: '回退 a.txt' }))
    expect(revert).toHaveBeenCalledWith('session-1', ['a.txt'], expect.anything())
    await vi.waitFor(() => expect(changedFiles).toHaveBeenCalledTimes(2))
  })

  it('shows a revert error when the revert fails', async () => {
    renderPanel({ revert: vi.fn(async () => ({ ok: false, error: { code: 'test', message: 'revert boom', details: {} } })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByRole('button', { name: '回退 a.txt' }))
    expect(await screen.findByText(/revert boom/)).toBeTruthy()
  })

  it('shows a revert error when the revert rejects with a non-Error', async () => {
    renderPanel({ revert: vi.fn(async () => { throw 'revert plain' }) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByRole('button', { name: '回退 a.txt' }))
    expect(await screen.findByText(/revert plain/)).toBeTruthy()
  })

  it('reverts all after confirmation and cancels safely', async () => {
    const { revert } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    fireEvent.click(await screen.findByRole('button', { name: '全部回退' }))
    expect(await screen.findByText('确定回退全部改动？此操作不可撤销。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(revert).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '全部回退' }))
    fireEvent.click(await screen.findByRole('button', { name: '回退' }))
    expect(revert).toHaveBeenCalledWith('session-1', [], expect.anything())
  })

  it('shows a list error when the changed-files call fails', async () => {
    renderPanel({ changedFiles: vi.fn(async () => ({ ok: false, error: { code: 'test', message: 'list boom', details: {} } })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText(/list boom/)).toBeTruthy()
  })

  it('shows a list error when the changed-files call rejects', async () => {
    renderPanel({ changedFiles: vi.fn(async () => { throw new Error('list rejected') }) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText(/list rejected/)).toBeTruthy()
  })

  it('closes on Escape and on the close button', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    await screen.findByText('工作区改动')
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(screen.queryByText('工作区改动')).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByText('工作区改动')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    await screen.findByText('工作区改动')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByText('工作区改动')).toBeNull()
  })

  it('shows the clean state for an empty git workspace', async () => {
    renderPanel({ changedFiles: vi.fn(async () => ({ ok: true, value: { git: true, files: [] } })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText('工作区干净，没有未提交改动')).toBeTruthy()
  })

  it('shows the non-git state when the workspace is not a repository', async () => {
    renderPanel({ changedFiles: vi.fn(async () => ({ ok: true, value: { git: false, files: [] } })) } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText('当前目录不是 git 仓库')).toBeTruthy()
  })

  it('shows the no-session state when no session is current', async () => {
    renderPanel({ useSessions: noSessions as GitWorkspacePanelProps['useSessions'] } as Partial<GitWorkspacePanelProps>)
    fireEvent.click(screen.getByRole('button', { name: '改动' }))
    expect(await screen.findByText('请先打开一个会话')).toBeTruthy()
  })
})
