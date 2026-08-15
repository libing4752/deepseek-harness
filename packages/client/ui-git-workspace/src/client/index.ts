/**
 * Workspace-changes UI plugin, browser half: registers the `sidebar.footer.action`
 * trigger and modal panel that lists the workspace's changed files and shows one
 * file's side-by-side diff, with per-file and all-files revert. The gitWorkspace
 * Remote namespace itself mounts through the `@deepseek-ai/dsh-api-remotes`
 * client assembly, so this plugin only consumes it.
 */
// Type-only: pulls the generated Remote API and ctx.remote merge (including the
// gitWorkspace namespace) through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { GitWorkspacePanel } from './GitWorkspacePanel.tsx'
import type { GitWorkspacePanelInjected } from './GitWorkspacePanel.tsx'
import { en, zh, type GitWorkspaceKey } from './locales.ts'

export type { GitWorkspacePanelInjected, GitWorkspacePanelProps } from './GitWorkspacePanel.tsx'
export type { GitWorkspaceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The workspace-changes panel's copy. */
    gitWorkspace: GitWorkspaceKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'gitWorkspace'

/** Required services: the remote carrier and its gitWorkspace namespace, the slot registry, and the locale registry. */
export const inject = ['remote', 'remote.gitWorkspace', 'slots', 'locale']

/**
 * Register the footer action once its slot is declared by ui-sidebar.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-git-workspace: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'git-workspace',
    order: 1,
    locale: NS,
    inject: (): GitWorkspacePanelInjected => ({
      changedFiles: (sessionId, signal) => ctx.remote.gitWorkspace.changedFiles(sessionId, signal),
      fileDiff: (sessionId, path, signal) => ctx.remote.gitWorkspace.fileDiff(sessionId, path, signal),
      revert: (sessionId, paths, signal) => ctx.remote.gitWorkspace.revert(sessionId, paths, signal),
    }),
  }, GitWorkspacePanel))
}
