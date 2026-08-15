/**
 * ui-git-workspace browser half on a real cordis Context with a real `remote`
 * Service and a real slot registry: the plugin registers the sidebar footer
 * action once its slot is declared, the footer action's inject resolves its
 * list/diff/revert verbs through the `remote.gitWorkspace` namespace (mounted
 * by the api-remotes assembly in the shipped composition, provided directly
 * here), and the contribution folds up on fiber disposal (HMR safety).
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { GitWorkspacePanelInjected } from '../src/client/GitWorkspacePanel.tsx'
import { apply, inject } from '../src/client/index.ts'

const sid = (k: string): SessionId => k as SessionId

async function bench(): Promise<{
  fiber: Awaited<ReturnType<typeof Context.prototype.plugin>>
  slots: Context['slots']
  calls: { method: string; args: unknown[] }[]
}> {
  const ctx = new Context()
  const calls: { method: string; args: unknown[] }[] = []
  const gitWorkspace = {
    changedFiles: (...args: unknown[]) => {
      calls.push({ method: 'changedFiles', args })
      return Promise.resolve({ ok: true as const, value: { git: true, files: [] } })
    },
    fileDiff: (...args: unknown[]) => {
      calls.push({ method: 'fileDiff', args })
      return Promise.resolve({ ok: true as const, value: undefined })
    },
    revert: (...args: unknown[]) => {
      calls.push({ method: 'revert', args })
      return Promise.resolve({ ok: true as const, value: { reverted: [] } })
    },
  }
  // A real `remote` Service (not a plain object): its `associate: 'remote'`
  // tracker makes `ctx.remote.gitWorkspace` resolve through the ctx proxy, so
  // this bench fails loud if the namespace is ever dropped from `inject`.
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
  }
  new RemoteService(ctx)
  ctx.provide('remote.gitWorkspace', gitWorkspace)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { fiber, slots: ctx.slots, calls }
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['remote', 'remote.gitWorkspace', 'slots', 'locale'])
  })

  it('registers the footer action and folds it up on disposal', async () => {
    const { fiber, slots } = await bench()
    expect(slots.entries('sidebar.footer.action').map(entry => entry.options.id)).toEqual(['git-workspace'])
    await fiber.dispose()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
  })

  it('the footer action inject resolves its verbs through the mounted namespace', async () => {
    const { slots, calls } = await bench()
    const entry = slots.entries('sidebar.footer.action')[0]!
    const injectEntry = entry.inject as unknown as () => GitWorkspacePanelInjected
    const injected = injectEntry()
    expect(await injected.changedFiles(sid('s1'))).toEqual({ ok: true, value: { git: true, files: [] } })
    expect(await injected.fileDiff(sid('s1'), 'a.txt')).toEqual({ ok: true, value: undefined })
    expect(await injected.revert(sid('s1'), ['a.txt'])).toEqual({ ok: true, value: { reverted: [] } })
    expect(calls.map(call => call.method)).toEqual(['changedFiles', 'fileDiff', 'revert'])
    expect(calls[0]?.args[0]).toBe('s1')
    expect(calls[1]?.args.slice(0, 2)).toEqual(['s1', 'a.txt'])
    expect(calls[2]?.args.slice(0, 2)).toEqual(['s1', ['a.txt']])
  })
})
