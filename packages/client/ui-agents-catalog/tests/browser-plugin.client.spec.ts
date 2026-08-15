/**
 * ui-agents-catalog browser half on a real cordis Context with a real `remote`
 * Service and a real slot registry: the plugin registers the sidebar footer
 * action once its slot is declared, the footer action's inject resolves its
 * list/read verbs through the `remote.agentsCatalog` namespace (mounted by the
 * api-remotes assembly in the shipped composition, provided directly here), and
 * the contribution folds up on fiber disposal (HMR safety).
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { CatalogPanelInjected } from '../src/client/CatalogPanel.tsx'
import { apply, inject } from '../src/client/index.ts'

const sid = (k: string): SessionId => k as SessionId

async function bench(): Promise<{
  fiber: Awaited<ReturnType<typeof Context.prototype.plugin>>
  slots: Context['slots']
  calls: { method: string; args: unknown[] }[]
}> {
  const ctx = new Context()
  const calls: { method: string; args: unknown[] }[] = []
  const agentsCatalog = {
    list: (...args: unknown[]) => {
      calls.push({ method: 'list', args })
      return Promise.resolve({ ok: true as const, value: { skills: [], memory: [] } })
    },
    read: (...args: unknown[]) => {
      calls.push({ method: 'read', args })
      return Promise.resolve({ ok: true as const, value: undefined })
    },
  }
  // A real `remote` Service (not a plain object): its `associate: 'remote'`
  // tracker makes `ctx.remote.agentsCatalog` resolve through the ctx proxy, so
  // this bench fails loud if the namespace is ever dropped from `inject`.
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
  }
  new RemoteService(ctx)
  ctx.provide('remote.agentsCatalog', agentsCatalog)
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
    expect(inject).toEqual(['remote', 'remote.agentsCatalog', 'slots', 'locale'])
  })

  it('registers the footer action and folds it up on disposal', async () => {
    const { fiber, slots } = await bench()
    expect(slots.entries('sidebar.footer.action').map(entry => entry.options.id)).toEqual(['agents-catalog'])
    await fiber.dispose()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
  })

  it('the footer action inject resolves its list/read verbs through the mounted namespace', async () => {
    const { slots, calls } = await bench()
    const entry = slots.entries('sidebar.footer.action')[0]!
    const injectEntry = entry.inject as unknown as () => CatalogPanelInjected
    const injected = injectEntry()
    expect(await injected.list(sid('s1'))).toEqual({ ok: true, value: { skills: [], memory: [] } })
    expect(await injected.read(sid('s1'), { kind: 'skill', id: 'example-skill' })).toEqual({ ok: true, value: undefined })
    expect(calls.map(call => call.method)).toEqual(['list', 'read'])
    expect(calls[0]?.args[0]).toBe('s1')
    expect(calls[1]?.args[0]).toBe('s1')
    expect(calls[1]?.args[1]).toEqual({ kind: 'skill', id: 'example-skill' })
  })
})
