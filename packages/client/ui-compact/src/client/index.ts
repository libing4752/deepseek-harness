/**
 * Compact control plugin, browser half: occupies the composer's
 * `conversation.input.left` seat with an always-visible compression button. A
 * click opens a menu whose entries run `/compact` (plain), or prompt for a
 * skill name / memory title and run `/compact --skill <name>` /
 * `/compact --memory <title>` through `command.execute`. The durable result
 * renders as the command's own transcript row; this control surfaces only
 * transport/handler failures inline.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CompactControl } from './CompactControl.tsx'
import { en, zh, type CompactKey } from './locales.ts'

export type { CompactKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer compression control's copy. */
    compact: CompactKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'compact'

/** Injected business face of the composer compression seat. */
export interface CompactInjected {
  /**
   * Execute one `/compact` command line against the session's agent.
   * @returns null on admitted execution; a user-visible failure line otherwise.
   */
  run: (line: string) => Promise<string | null>
}

/** Required services: the seat's slot registry, commands Remote, and locale registry. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Client plugin body: register the compression control over the command channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-compact: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'compact',
    order: 20,
    locale: NS,
    inject: (sessionId: SessionId): CompactInjected => ({
      run: async (line) => {
        const result = await ctx.remote.commands.execute(sessionId, line)
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (result.value === undefined) return `unknown command: ${line}`
        const outcome = result.value.result
        return outcome.kind === 'error' ? outcome.text : null
      },
    }),
  }, CompactControl))
}
