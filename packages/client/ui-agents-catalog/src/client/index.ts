/**
 * Skills + memory catalog UI plugin, browser half: mounts the agentsCatalog
 * Remote namespace, then registers the `sidebar.footer.action` trigger row and
 * modal panel that lists the current project's skills and memory notes.
 */
import agentsCatalogRemote from '@deepseek-ai/dsh-agents-catalog/remote'
// Type-only: pulls the ctx.remote merge (TypertClientRemote) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { CatalogPanel } from './CatalogPanel.tsx'
import type { CatalogPanelInjected } from './CatalogPanel.tsx'
import { en, zh, type CatalogKey } from './locales.ts'

export type { CatalogPanelInjected, CatalogPanelProps } from './CatalogPanel.tsx'
export type { CatalogKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The skills + memory panel's copy. */
    agentsCatalog: CatalogKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'agentsCatalog'

/** Required services: the remote carrier, the slot registry, and the locale registry. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Mount the catalog Remote, then register the footer action once its slot is
 * declared by ui-sidebar.
 * @param ctx - client root context.
 * @returns disposer that unmounts the catalog Remote namespace.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-agents-catalog: dictionaries')
  const disposeMount = await ctx.remote.$mount(agentsCatalogRemote)
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'agents-catalog',
    order: 0,
    locale: NS,
    inject: (): CatalogPanelInjected => ({
      list: (sessionId, signal) => ctx.remote.agentsCatalog.list(sessionId, signal),
      read: (sessionId, ref, signal) => ctx.remote.agentsCatalog.read(sessionId, ref, signal),
    }),
  }, CatalogPanel))
  return disposeMount
}
