/**
 * Real Loader composition for the agents-catalog service: boots a cordis.yml
 * mounting the session store, skill registry, and catalog, then asserts the
 * catalog lists a registered skill and the on-disk memory notes for a live
 * agent.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import AgentsCatalogRuntime from '@deepseek-ai/dsh-agents-catalog'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('agents-catalog real Loader composition', () => {
  it('lists skills and memory through the assembled service plane', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-agents-catalog-loader-'))
    await mkdir(join(root, '.agents', 'memory'), { recursive: true })
    await writeFile(join(root, '.agents', 'memory', 'note.md'), '# note body', 'utf8')
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-skill'",
      "- name: '@deepseek-ai/dsh-agents-catalog'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-skill', SkillRegistry],
      ['@deepseek-ai/dsh-agents-catalog', AgentsCatalogRuntime],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const session = context.sessions.create(SessionId('loader-catalog'), { meta: { cwd: root } })
    const agent = { id: session.id, session } as Agent
    context.skills.register({
      name: 'example-skill',
      description: 'an example skill',
      source: 'project-dsh',
      content: 'do the example',
    })

    const catalog = await context.agentsCatalog.list(agent, new AbortController().signal)
    expect(catalog.skills.map(skill => skill.name)).toEqual(['example-skill'])
    expect(catalog.memory.map(note => note.displayPath)).toEqual(['.agents/memory/note.md'])

    const entry = await context.agentsCatalog.read(agent, { kind: 'skill', id: 'example-skill' }, new AbortController().signal)
    expect(entry).toMatchObject({ kind: 'skill', name: 'example-skill', content: 'do the example' })
  })
})
