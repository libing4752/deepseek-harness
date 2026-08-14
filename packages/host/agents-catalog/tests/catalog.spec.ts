/**
 * Unit tests for the read-only agents-catalog service: skill listing/reading
 * through the registry and memory-note discovery from a temp project root.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import AgentsCatalogRuntime from '@deepseek-ai/dsh-agents-catalog'

/** Boot a real context with the session store, skill registry, and catalog. */
async function mount(cwd: string): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(AgentsCatalogRuntime)
  const session = ctx.sessions.create(SessionId('catalog-test'), { meta: { cwd } })
  const agent = { id: session.id, session } as Agent
  return { ctx, agent }
}

/** Create a temp project root with one memory note. */
async function tempProject(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-agents-catalog-'))
  await mkdir(join(cwd, '.agents', 'memory'), { recursive: true })
  await writeFile(join(cwd, '.agents', 'memory', 'note.md'), '# note body', 'utf8')
  return cwd
}

describe('AgentsCatalogRuntime', () => {
  it('lists registered skills and on-disk memory notes', async () => {
    const cwd = await tempProject()
    try {
      const { ctx, agent } = await mount(cwd)
      ctx.skills.register({
        name: 'example-skill',
        description: 'an example skill',
        source: 'project-dsh',
        content: 'do the example',
      })
      const signal = new AbortController().signal
      const catalog = await ctx.agentsCatalog.list(agent, signal)
      expect(catalog.skills.map(skill => skill.name)).toEqual(['example-skill'])
      expect(catalog.skills[0]?.modelInvocable).toBe(true)
      expect(catalog.skills[0]?.userInvocable).toBe(true)
      expect(catalog.memory.map(note => note.displayPath)).toEqual(['.agents/memory/note.md'])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('reads a skill body and a memory note on demand', async () => {
    const cwd = await tempProject()
    try {
      const { ctx, agent } = await mount(cwd)
      ctx.skills.register({
        name: 'example-skill',
        description: 'an example skill',
        source: 'project-dsh',
        content: 'do the example',
      })
      const signal = new AbortController().signal
      const skill = await ctx.agentsCatalog.read(agent, { kind: 'skill', id: 'example-skill' }, signal)
      expect(skill).toMatchObject({ kind: 'skill', name: 'example-skill', content: 'do the example' })
      const memory = await ctx.agentsCatalog.read(agent, { kind: 'memory', id: '.agents/memory/note.md' }, signal)
      expect(memory).toMatchObject({ kind: 'memory', name: 'note.md', content: '# note body' })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('returns undefined for an unknown entry', async () => {
    const cwd = await tempProject()
    try {
      const { ctx, agent } = await mount(cwd)
      const signal = new AbortController().signal
      expect(await ctx.agentsCatalog.read(agent, { kind: 'skill', id: 'missing' }, signal)).toBeUndefined()
      expect(await ctx.agentsCatalog.read(agent, { kind: 'memory', id: '.agents/memory/missing.md' }, signal)).toBeUndefined()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
