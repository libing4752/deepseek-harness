/**
 * Skills + memory catalog panel: the `sidebar.footer.action` occupant that
 * opens a centered modal listing the current project's skills and memory
 * notes, and shows one entry's full content on selection. Data arrives
 * through the injected agentsCatalog Remote callbacks; the current session id
 * comes from the framework `useSessions` seat. Open state and the selected
 * entry are component-local viewing state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconChevronLeftOutline14, IconCloseOutline16, IconDataOutline16,
  IconFolderClose16, IconSkillOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AgentsCatalogList, CatalogEntry, CatalogRef, MemoryItem, SkillItem,
} from '@deepseek-ai/dsh-agents-catalog/types'
import css from './CatalogPanel.module.css'

/** Registrant-private injected share: the catalog Remote calls. */
export interface CatalogPanelInjected {
  /** List the project's skills and memory for one session. */
  list: (sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<AgentsCatalogList>>
  /** Load one entry's full content. */
  read: (sessionId: SessionId, ref: CatalogRef, signal?: AbortSignal) => Promise<RemoteResult<CatalogEntry | undefined>>
}

/** Full component props: the sidebar owner share, the injected callbacks, and the locale seat. */
export type CatalogPanelProps =
  PropsRuntime<'sidebar.footer.action'>
  & InjectFace<CatalogPanelInjected>
  & PropsLocale<'agentsCatalog'>

/** Human-facing badge for a skill's invocation policy. */
function invocationBadge(skill: SkillItem, t: CatalogPanelProps['t']): string {
  if (skill.modelInvocable && skill.userInvocable) return t('badge.both')
  if (skill.modelInvocable) return t('badge.modelOnly')
  return t('badge.userOnly')
}

/** Render an error string for an arbitrary thrown value. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Modal layer: mask + centered panel with a header, body, and close paths. */
function CatalogModal({
  t,
  catalog,
  selected,
  loading,
  error,
  onBack,
  onOpen,
  onClose,
}: {
  t: CatalogPanelProps['t']
  catalog: AgentsCatalogList | null
  selected: CatalogEntry | null
  loading: boolean
  error: string | null
  onBack: () => void
  onOpen: (ref: CatalogRef) => void
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

  const total = (catalog?.skills.length ?? 0) + (catalog?.memory.length ?? 0)
  const empty = !loading && error === null && catalog !== null && total === 0

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('panel.title')}>
        <div className={css.header}>
          <div className={css.headerLeft}>
            {selected !== null ? (
              <button type="button" className={css.back} onClick={onBack} aria-label={t('panel.back')}>
                <IconChevronLeftOutline14 size={14} />
              </button>
            ) : null}
            <span className={css.title}>{t('panel.title')}</span>
          </div>
          <button ref={closeButton} type="button" className={css.close} onClick={onClose} aria-label={t('panel.close')}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>

        {selected !== null ? (
          <div className={css.detail}>
            <h3 className={css.detailTitle}>{selected.name}</h3>
            {selected.displayPath !== undefined ? (
              <div className={css.detailPath}>{selected.displayPath}</div>
            ) : null}
            <pre className={css.detailBody}>{selected.content || t('content.empty')}</pre>
          </div>
        ) : (
          <div className={css.body}>
            {loading ? <div className={css.status}>{t('status.loading')}</div> : null}
            {!loading && error !== null ? <div className={css.status}>{t('status.error')}: {error}</div> : null}
            {empty ? <div className={css.status}>{t('empty')}</div> : null}
            {catalog !== null && total > 0 ? (
              <>
                <Group
                  t={t}
                  title={t('group.skills')}
                  empty={catalog.skills.length === 0}
                  onOpen={onOpen}
                  items={catalog.skills.map(skill => ({
                    key: `skill:${skill.name}`,
                    name: skill.name,
                    description: skill.description,
                    badge: invocationBadge(skill, t),
                    ref: { kind: 'skill', id: skill.name } as CatalogRef,
                  }))}
                />
                <Group
                  t={t}
                  title={t('group.memory')}
                  empty={catalog.memory.length === 0}
                  onOpen={onOpen}
                  items={catalog.memory.map((note: MemoryItem) => ({
                    key: `memory:${note.displayPath}`,
                    name: note.name,
                    description: note.displayPath,
                    badge: undefined,
                    ref: { kind: 'memory', id: note.displayPath } as CatalogRef,
                  }))}
                />
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

/** One catalog group (skills or memory) with its rows. */
function Group({
  t,
  title,
  empty,
  items,
  onOpen,
}: {
  t: CatalogPanelProps['t']
  title: string
  empty: boolean
  items: readonly { key: string; name: string; description: string; badge: string | undefined; ref: CatalogRef }[]
  onOpen: (ref: CatalogRef) => void
}) {
  if (empty) return null
  return (
    <section className={css.group}>
      <h4 className={css.groupTitle}>{title}</h4>
      <ul className={css.list}>
        {items.map(item => (
          <li key={item.key}>
            <button type="button" className={css.row} onClick={() => { onOpen(item.ref) }}>
              <span className={css.rowIcon}>{title === t('group.skills') ? <IconDataOutline16 size={14} /> : <IconFolderClose16 size={14} />}</span>
              <span className={css.rowMain}>
                <span className={css.rowName}>{item.name}</span>
                <span className={css.rowDesc}>{item.description}</span>
              </span>
              {item.badge !== undefined ? <span className={css.badge}>{item.badge}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Render the footer trigger and the catalog modal.
 * @param props - composed slot props (owner `wide`, injected callbacks, locale seat).
 * @returns the trigger row plus the modal while open.
 */
export function CatalogPanel({ wide, useSessions, list, read, t }: CatalogPanelProps) {
  const current = useSessions(s => s.current)
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<AgentsCatalogList | null>(null)
  const [selected, setSelected] = useState<CatalogEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const cancel = useCallback((): void => {
    request.current?.abort()
    request.current = null
  }, [])

  const close = useCallback((): void => {
    cancel()
    setOpen(false)
    setCatalog(null)
    setSelected(null)
    setError(null)
  }, [cancel])

  const runList = useCallback((): void => {
    if (current === undefined) return
    cancel()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    setSelected(null)
    list(current, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      if (result.ok) setCatalog(result.value)
      else setError(result.error.message)
    }, (reason: unknown) => {
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      setError(errorText(reason))
    })
  }, [current, cancel, list])

  useEffect(() => {
    if (!open) return
    if (current === undefined) {
      setCatalog(null)
      setSelected(null)
      setLoading(false)
      setError(null)
      return
    }
    runList()
    return cancel
  }, [open, current, runList, cancel])

  const openEntry = useCallback((ref: CatalogRef): void => {
    if (current === undefined) return
    cancel()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    read(current, ref, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      if (result.ok) setSelected(result.value ?? null)
      else setError(result.error.message)
    }, (reason: unknown) => {
      if (controller.signal.aborted) return
      request.current = null
      setLoading(false)
      setError(errorText(reason))
    })
  }, [current, cancel, read])

  const back = useCallback((): void => { setSelected(null) }, [])

  return (
    <>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.rail)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(true) }}
      >
        <IconSkillOutline16 size={14} />
        {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
      </button>
      {open ? (
        <CatalogModal
          t={t}
          catalog={catalog}
          selected={selected}
          loading={loading}
          error={error}
          onBack={back}
          onOpen={openEntry}
          onClose={close}
        />
      ) : null}
    </>
  )
}
