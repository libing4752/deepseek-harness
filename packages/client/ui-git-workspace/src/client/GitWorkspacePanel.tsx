/**
 * Workspace-changes panel: the `sidebar.footer.action` occupant that opens a
 * master-detail modal — a file list with status badges on the left and the
 * selected file's side-by-side diff (DiffBlock) on the right. Per-file and
 * all-files revert run through the injected gitWorkspace Remote; the current
 * session id comes from the framework `useSessions` seat. Open state, the
 * selected file, and the revert-all confirmation are component-local viewing
 * state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  DiffBlock, IconBranchOutline16, IconCheckOutline16, IconCloseOutline16,
  IconEditOutline16, IconWarningOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ChangedFile, ChangedFileStatus, ChangedFilesList, FileDiffResult, RevertResult,
} from '@deepseek-ai/dsh-git-workspace/types'
import css from './GitWorkspacePanel.module.css'

/** Registrant-private injected share: the gitWorkspace Remote calls. */
export interface GitWorkspacePanelInjected {
  /** List the workspace's changed files for one session. */
  changedFiles: (sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<ChangedFilesList>>
  /** Load one changed file's before/after content. */
  fileDiff: (sessionId: SessionId, path: string, signal?: AbortSignal) => Promise<RemoteResult<FileDiffResult | undefined>>
  /** Revert the given paths (empty reverts all). */
  revert: (sessionId: SessionId, paths: readonly string[], signal?: AbortSignal) => Promise<RemoteResult<RevertResult>>
}

/** Full component props: the sidebar owner share, the injected callbacks, and the locale seat. */
export type GitWorkspacePanelProps =
  PropsRuntime<'sidebar.footer.action'>
  & InjectFace<GitWorkspacePanelInjected>
  & PropsLocale<'gitWorkspace'>

/** The per-status CSS class (tokens resolve through --dsw-*). */
const STATUS_CLASS: Record<ChangedFileStatus, string | undefined> = {
  added: css.badgeAdded,
  modified: css.badgeModified,
  deleted: css.badgeDeleted,
  untracked: css.badgeUntracked,
}

/** Human-facing label for a change status. */
function statusLabel(status: ChangedFileStatus, t: GitWorkspacePanelProps['t']): string {
  switch (status) {
    case 'added': return t('badge.added')
    case 'modified': return t('badge.modified')
    case 'deleted': return t('badge.deleted')
    case 'untracked': return t('badge.untracked')
  }
}

/** Render an error string for an arbitrary thrown value. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One changed file row: status dot, path, label, and a per-file revert action. */
function FileRow({
  t, file, selected, reverting, onOpen, onRevert,
}: {
  t: GitWorkspacePanelProps['t']
  file: ChangedFile
  selected: boolean
  reverting: boolean
  onOpen: () => void
  onRevert: () => void
}) {
  return (
    <li className={clsx(css.fileRow, selected && css.fileRowSelected)}>
      <button type="button" className={css.fileMain} onClick={onOpen}>
        <span className={clsx(css.statusDot, STATUS_CLASS[file.status])} aria-hidden />
        <span className={css.filePath}>{file.path}</span>
        <span className={clsx(css.badge, STATUS_CLASS[file.status])}>{statusLabel(file.status, t)}</span>
      </button>
      <button
        type="button"
        className={css.revert}
        onClick={onRevert}
        disabled={reverting}
        aria-label={`${t('action.revert')} ${file.path}`}
      >
        {t('action.revert')}
      </button>
    </li>
  )
}

/** Modal layer: mask + centered panel with a header, a file list, and a diff pane. */
function GitWorkspaceModal({
  t,
  git,
  files,
  selected,
  loading,
  diffLoading,
  error,
  reverting,
  confirmAll,
  noSession,
  onOpen,
  onRevert,
  onRevertAll,
  onConfirmAll,
  onCancelConfirm,
  onClose,
}: {
  t: GitWorkspacePanelProps['t']
  git: boolean | null
  files: ChangedFile[] | null
  selected: FileDiffResult | null
  loading: boolean
  diffLoading: boolean
  error: string | null
  reverting: boolean
  confirmAll: boolean
  noSession: boolean
  onOpen: (path: string) => void
  onRevert: (path: string) => void
  onRevertAll: () => void
  onConfirmAll: () => void
  onCancelConfirm: () => void
  onClose: () => void
}) {
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const count = files?.length ?? 0
  const notGit = !loading && error === null && git === false
  const empty = !loading && error === null && git === true && count === 0
  const summary = t('summary').replace('{n}', String(count))

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('panel.title')}>
        <div className={css.header}>
          <div className={css.headerLeft}>
            <IconBranchOutline16 size={14} />
            <span className={css.title}>{t('panel.title')}</span>
            {git === true && <span className={css.summary}>{summary}</span>}
          </div>
          <div className={css.headerRight}>
            {git === true && count > 0 && (
              <button type="button" className={css.revertAll} onClick={onRevertAll} disabled={reverting}>
                {t('action.revertAll')}
              </button>
            )}
            <button ref={closeButton} type="button" className={css.close} onClick={onClose} aria-label={t('panel.close')}>
              <IconCloseOutline16 size={14} />
            </button>
          </div>
        </div>

        {confirmAll ? (
          <div className={css.confirmBar} role="alertdialog" aria-label={t('action.revertAllConfirm')}>
            <span className={css.confirmText}>{t('action.revertAllConfirm')}</span>
            <button type="button" className={css.confirmCancel} onClick={onCancelConfirm}>{t('action.cancel')}</button>
            <button type="button" className={css.confirmOk} onClick={onConfirmAll} disabled={reverting}>{t('action.confirm')}</button>
          </div>
        ) : null}

        <div className={css.body}>
          {loading ? <div className={css.status}><IconCheckOutline16 size={14} />{t('status.loading')}</div> : null}
          {!loading && error !== null ? (
            <div className={css.status} data-error=""><IconWarningOutline16 size={14} />{t('status.error')}: {error}</div>
          ) : null}
          {noSession ? <div className={css.status}><IconWarningOutline16 size={14} />{t('panel.noSession')}</div> : null}
          {notGit ? <div className={css.status}><IconWarningOutline16 size={14} />{t('panel.notGit')}</div> : null}
          {empty ? <div className={css.status}><IconCheckOutline16 size={14} />{t('panel.empty')}</div> : null}

          {git === true && count > 0 ? (
            <div className={css.split}>
              <ul className={css.list}>
                {files?.map(file => (
                  <FileRow
                    key={file.path}
                    t={t}
                    file={file}
                    selected={selected?.path === file.path}
                    reverting={reverting}
                    onOpen={() => { onOpen(file.path) }}
                    onRevert={() => { onRevert(file.path) }}
                  />
                ))}
              </ul>
              <div className={css.diff}>
                {diffLoading ? <div className={css.status}>{t('status.loading')}</div> : null}
                {!diffLoading && selected === null ? (
                  <div className={css.hint}><IconEditOutline16 size={14} />{t('action.selectHint')}</div>
                ) : null}
                {!diffLoading && selected !== null ? (
                  <DiffBlock diffs={[{ path: selected.path, oldText: selected.oldText, newText: selected.newText }]} maxLines={Infinity} />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Render the footer trigger and the workspace-changes modal.
 * @param props - composed slot props (owner `wide`, injected callbacks, locale seat).
 * @returns the trigger row plus the modal while open.
 */
export function GitWorkspacePanel({ wide, useSessions, changedFiles, fileDiff, revert, t }: GitWorkspacePanelProps) {
  const current = useSessions(s => s.current)
  const [open, setOpen] = useState(false)
  const [git, setGit] = useState<boolean | null>(null)
  const [files, setFiles] = useState<ChangedFile[] | null>(null)
  const [selected, setSelected] = useState<FileDiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reverting, setReverting] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [noSession, setNoSession] = useState(false)
  const request = useRef<AbortController | null>(null)

  const cancel = useCallback((): void => {
    request.current?.abort()
    request.current = null
  }, [])

  const close = useCallback((): void => {
    cancel()
    setOpen(false)
    setGit(null)
    setFiles(null)
    setSelected(null)
    setError(null)
    setConfirmAll(false)
    setNoSession(false)
  }, [cancel])

  const runList = useCallback((): void => {
    /* v8 ignore next -- unreachable: the open effect only runs callbacks with a current session */
    if (current === undefined) return
    cancel()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    setSelected(null)
    setConfirmAll(false)
    changedFiles(current, controller.signal).then((result) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      if (result.ok) {
        setGit(result.value.git)
        setFiles([...result.value.files])
      } else {
        setError(result.error.message)
      }
    }, (reason: unknown) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      setError(errorText(reason))
    })
  }, [current, cancel, changedFiles])

  useEffect(() => {
    if (!open) return
    if (current === undefined) {
      setGit(null)
      setFiles(null)
      setLoading(false)
      setError(null)
      setNoSession(true)
      return
    }
    setNoSession(false)
    runList()
    return cancel
  }, [open, current, runList, cancel])

  const openFile = useCallback((path: string): void => {
    /* v8 ignore next -- unreachable: the open effect only runs callbacks with a current session */
    if (current === undefined) return
    cancel()
    const controller = new AbortController()
    request.current = controller
    setDiffLoading(true)
    setError(null)
    fileDiff(current, path, controller.signal).then((result) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setDiffLoading(false)
      if (result.ok) setSelected(result.value ?? null)
      else setError(result.error.message)
    }, (reason: unknown) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setDiffLoading(false)
      setError(errorText(reason))
    })
  }, [current, cancel, fileDiff])

  const doRevert = useCallback((paths: readonly string[]): void => {
    /* v8 ignore next -- unreachable: the open effect only runs callbacks with a current session */
    if (current === undefined) return
    cancel()
    const controller = new AbortController()
    request.current = controller
    setReverting(true)
    setError(null)
    setConfirmAll(false)
    revert(current, paths, controller.signal).then((result) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setReverting(false)
      if (result.ok) runList()
      else setError(result.error.message)
    }, (reason: unknown) => {
      /* v8 ignore next -- abort guard: a superseded request's post-cancel settle runs no state updates */
      if (controller.signal.aborted) return
      request.current = null
      setReverting(false)
      setError(errorText(reason))
    })
  }, [current, cancel, revert, runList])

  const requestAll = useCallback((): void => { setConfirmAll(true) }, [])
  const cancelConfirm = useCallback((): void => { setConfirmAll(false) }, [])
  const confirmAllRevert = useCallback((): void => { doRevert([]) }, [doRevert])

  return (
    <>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.rail)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(true) }}
      >
        <IconBranchOutline16 size={14} />
        {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
      </button>
      {open ? (
        <GitWorkspaceModal
          t={t}
          git={git}
          files={files}
          selected={selected}
          loading={loading}
          diffLoading={diffLoading}
          error={error}
          reverting={reverting}
          confirmAll={confirmAll}
          noSession={noSession}
          onOpen={openFile}
          onRevert={(path) => { doRevert([path]) }}
          onRevertAll={requestAll}
          onConfirmAll={confirmAllRevert}
          onCancelConfirm={cancelConfirm}
          onClose={close}
        />
      ) : null}
    </>
  )
}
