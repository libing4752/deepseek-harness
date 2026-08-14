/** Composer compression control: an always-visible button with a menu and a
 * name/title dialog for the optional skill/memory distillation. The durable
 * result renders as the `/compact` command's own transcript row; this control
 * owns only the menu/dialog state and surfaces transport/handler failures. */

import { useCallback, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  Button, IconArchiveOutline20, Input, Menu, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { CompactInjected } from './index.ts'
import css from './CompactControl.module.css'

/** Full compression-seat component props: runtime share, injected run face, and the locale seat. */
export type CompactControlProps =
  PropsRuntime<'conversation.input.left'> & InjectFace<CompactInjected> & PropsLocale<'compact'>

type DialogKind = 'skill' | 'memory'

/** One of the menu entries; `skill`/`memory` open the name/title dialog. */
function dialogKind(id: string): DialogKind | undefined {
  return id === 'skill' || id === 'memory' ? id : undefined
}

export function CompactControl({ useSession, run, t }: CompactControlProps) {
  const running = useSession(s => s.running)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  // React state disables controls on the next render; the ref closes the
  // same-render window so a rapid double-activation cannot submit twice.
  const execute = useCallback(async (line: string): Promise<void> => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)
    const failure = await run(line)
    pendingRef.current = false
    setPending(false)
    setError(failure)
  }, [run])

  const onSelect = (id: string): void => {
    setMenuOpen(false)
    const kind = dialogKind(id)
    if (kind === undefined) {
      void execute('/compact')
      return
    }
    setValue('')
    setError(null)
    setDialog(kind)
  }

  const confirm = (): void => {
    const label = value.trim()
    if (label.length === 0 || dialog === null) return
    const line = dialog === 'skill' ? `/compact --skill ${label}` : `/compact --memory ${label}`
    setDialog(null)
    void execute(line)
  }

  const keepFocus = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }

  return (
    <>
      <Menu
        open={menuOpen}
        anchor={(
          <Tooltip label={t('button.title')} side="top" delayMs={500}>
            <Button
              variant="toolbar"
              size="sm"
              className={css.trigger}
              icon={<IconArchiveOutline20 size={16} />}
              aria-label={t('button.aria')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={pending || running}
              onMouseDown={keepFocus}
              onClick={() => { setMenuOpen(current => !current) }}
            />
          </Tooltip>
        )}
        items={[
          { id: 'compress', label: t('menu.compress') },
          { id: 'skill', label: t('menu.skill') },
          { id: 'memory', label: t('menu.memory') },
        ]}
        onSelect={onSelect}
        onClose={() => { setMenuOpen(false) }}
      />
      <Modal
        open={dialog !== null}
        onClose={() => { setDialog(null) }}
        title={dialog === 'skill' ? t('dialog.skillTitle') : t('dialog.memoryTitle')}
        closeLabel={t('dialog.close')}
        footer={(
          <div className={css.footer}>
            <Button variant="ghost" onClick={() => { setDialog(null) }}>{t('dialog.cancel')}</Button>
            <Button variant="primary" disabled={value.trim().length === 0 || pending} onClick={confirm}>
              {t('dialog.confirm')}
            </Button>
          </div>
        )}
      >
        <Input
          autoFocus
          value={value}
          onChange={(event) => { setValue(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') confirm() }}
          placeholder={dialog === 'skill' ? t('dialog.skillPlaceholder') : t('dialog.memoryPlaceholder')}
        />
      </Modal>
      {error !== null && <span className={css.error} role="status" title={error}>compact failed</span>}
    </>
  )
}
