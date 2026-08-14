/**
 * Read-only skills + memory catalog for the Web GUI, exposed over Typert
 * Remote. Lists a project's skill catalog and memory notes and loads one
 * entry's full content on demand. Read-only: skill lookup never creates or
 * resumes an agent, and memory discovery only reads the durable files
 * `@deepseek-ai/dsh-memory` injects.
 * @module @deepseek-ai/dsh-agents-catalog
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Type-only: pulls the `ctx.agentPresets` Context merge for scoped service lookup.
import type {} from '@deepseek-ai/dsh-agent-presets'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { loadMemoryNotes, userAgentsHome } from './files.ts'
import type {
  AgentsCatalogList, CatalogEntry, CatalogRef, MemoryItem, SkillItem,
} from './types.ts'

export type * from './types.ts'

export const name = 'agentsCatalog'

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentsCatalog: AgentsCatalogRuntime
  }
}

/** Project one skill summary to the client-safe wire row. */
function skillItem(skill: SkillSummary): SkillItem {
  return Object.freeze({
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    modelInvocable: skill.invocation.modelInvocable,
    userInvocable: skill.invocation.userInvocable,
    source: skill.source,
    provider: skill.provider,
  })
}

/** Project one loaded skill body to a client-safe entry. */
function skillEntry(definition: SkillDefinition): CatalogEntry {
  return Object.freeze({
    kind: 'skill',
    name: definition.name,
    ...definition.path === undefined ? {} : { displayPath: definition.path },
    content: definition.content,
  })
}

/**
 * Read-only catalog service. The skill registry view mirrors the apiproxy
 * `skill.list` resolution: a preset realm may mount its own `skills` service,
 * so the live agent's scoped instance wins over the host registry.
 */
export class AgentsCatalogRuntime extends TypertRemoteService {
  /** @param ctx - owning root context (the service registers as `agentsCatalog`). */
  constructor(ctx: Context) {
    super(ctx, 'agentsCatalog')
  }

  /** Resolve the effective skill registry for one agent. */
  private skillRegistry(agent: Agent): Context['skills'] | undefined {
    const presets = this.ctx.get('agentPresets')
    return presets?.serviceFor(agent, 'skills') ?? this.ctx.get('skills')
  }

  /**
   * List the project's skill summaries and memory notes for one agent.
   * @param agent - exact agent whose session cwd and scope select the catalog.
   * @param signal - cancellation forwarded to skill discovery and memory reads.
   * @returns the complete catalog, with an empty skill list when no registry is mounted.
   */
  @Remote
  async list(agent: Agent, signal: AbortSignal): Promise<AgentsCatalogList> {
    const cwd = agent.session.header.cwd ?? process.cwd()
    const registry = this.skillRegistry(agent)
    const skills: SkillItem[] = []
    if (registry !== undefined) {
      const summaries = await registry.list({ cwd, scope: agent, signal })
      for (const summary of summaries) skills.push(skillItem(summary))
    }
    const notes = await loadMemoryNotes(cwd, userAgentsHome(), signal)
    signal.throwIfAborted()
    const memory: MemoryItem[] = notes.map(note => Object.freeze({
      name: note.name,
      displayPath: note.displayPath,
    }))
    return Object.freeze({ skills: Object.freeze(skills), memory: Object.freeze(memory) })
  }

  /**
   * Load one entry's full content.
   * @param agent - exact agent whose session cwd and scope select the catalog.
   * @param ref - which skill name or memory display path to load.
   * @param signal - cancellation forwarded to the load.
   * @returns the loaded entry, or `undefined` when it no longer exists.
   */
  @Remote
  async read(agent: Agent, ref: CatalogRef, signal: AbortSignal): Promise<CatalogEntry | undefined> {
    const cwd = agent.session.header.cwd ?? process.cwd()
    if (ref.kind === 'skill') {
      const registry = this.skillRegistry(agent)
      if (registry === undefined) return undefined
      const definition = await registry.get(ref.id, { cwd, scope: agent, signal })
      return definition === undefined ? undefined : skillEntry(definition)
    }
    const notes = await loadMemoryNotes(cwd, userAgentsHome(), signal)
    signal.throwIfAborted()
    const note = notes.find(candidate => candidate.displayPath === ref.id)
    if (note === undefined) return undefined
    return Object.freeze({
      kind: 'memory',
      name: note.name,
      displayPath: note.displayPath,
      content: note.content,
    })
  }
}

export default AgentsCatalogRuntime
