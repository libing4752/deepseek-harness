/**
 * ui-agents-catalog browser half on a real cordis Context with a fake Remote
 * carrier and a real slot registry: the plugin body mounts the agentsCatalog
 * Remote namespace and registers the sidebar footer action once its slot is
 * declared, and both fold up on fiber disposal (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

async function bench(): Promise<{ fiber: Awaited<ReturnType<typeof Context.prototype.plugin>>; disposeMount: ReturnType<typeof vi.fn>; slots: Context['slots'] }> {
  const ctx = new Context()
  const disposeMount = vi.fn(async () => {})
  const agentsCatalog = {
    list: () => Promise.resolve({ ok: true as const, value: { skills: [], memory: [] } }),
    read: () => Promise.resolve({ ok: true as const, value: undefined }),
  }
  ctx.provide('remote', { agentsCatalog, $mount: vi.fn(async () => disposeMount) })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { fiber, disposeMount, slots: ctx.slots }
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale'])
  })

  it('mounts the remote, registers the footer action, and folds up on disposal', async () => {
    const { fiber, disposeMount, slots } = await bench()
    expect(slots.entries('sidebar.footer.action').map(entry => entry.options.id)).toEqual(['agents-catalog'])
    await fiber.dispose()
    expect(disposeMount).toHaveBeenCalled()
  })
})
