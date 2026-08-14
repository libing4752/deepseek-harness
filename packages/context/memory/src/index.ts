/**
 * Persistent memory context: inject `.agents/memory/` notes into a session as
 * background instructions.
 *
 * Memory notes are flat Markdown files authored by `@deepseek-ai/dsh-distill`
 * (or by hand) under the project `.agents/memory/` and the user
 * `~/.agents/memory/`. This plugin loads both scopes once per session and
 * injects them as an `instructions`-form `memory` context before the first
 * request. The source records each injected note's path and content digest so
 * the injection is reconstructable from the log; the notes themselves are the
 * durable authority.
 * @module @deepseek-ai/dsh-memory
 */

import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { loadMemoryFiles, userAgentsHome } from './files.ts'
import { renderMemoryContext } from './render.ts'

export const name = 'memory'

/** Default maximum UTF-8 bytes of the rendered memory block. */
const DEFAULT_MAX_BYTES = 65536

/** Durable provenance for one injected memory context. */
export interface MemoryContextSource {
  readonly kind: 'memory'
  readonly form: 'instructions'
  /** The notes this message published, in display order. */
  readonly entries: readonly { readonly path: string; readonly digest: string }[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Injected persistent-memory context published by this plugin. */
    memory: MemoryContextSource
  }
}

/** Memory-context configuration. */
export interface Config {
  /** User agents home for personal-scope memory. Defaults to `$DSH_AGENTS_HOME` or `~/.agents`. */
  agentsHome?: string
  /** Maximum UTF-8 bytes of the rendered memory block. */
  maxBytes?: number
}

/** Whether one message is this plugin's memory context. */
function isMemoryContext(message: UserMessage): boolean {
  return message.source.kind === 'memory'
}

/** Whether the session surface already carries an injected memory context. */
function hasMemoryInSurface(agent: Agent): boolean {
  for (const seq of agent.session.surface.nodes) {
    const event = agent.session.events[seq]
    if (event?.type === 'user/message' && isMemoryContext(event.data)) return true
  }
  return false
}

function samePayload(left: UserMessage, right: UserMessage): boolean {
  return isDeepStrictEqual(left.content, right.content)
    && isDeepStrictEqual(left.source, right.source)
}

/**
 * Register once-per-session memory injection.
 * @param ctx - context whose agent pre-step waterfall this plugin extends.
 * @param config - memory configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const agentsHome = userAgentsHome(config.agentsHome)
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('memory: maxBytes must be a positive integer')
  }

  ctx.on('agent/pre-step', async (
    { agent, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || decision.messages.length === 0) return decision
    if (hasMemoryInSurface(agent)) return decision
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd ?? process.cwd()
    const files = await loadMemoryFiles(cwd, agentsHome, signal)
    signal.throwIfAborted()
    const rendered = renderMemoryContext(files, maxBytes)
    if (rendered.included.length === 0) return decision
    const entries = rendered.included.map(file => ({ path: file.displayPath, digest: file.digest }))
    const message = createUserMessage({
      content: [{ type: 'text', text: rendered.text }],
      source: { kind: 'memory', form: 'instructions', entries },
    })
    // Inject only when this exact payload is not already being supplied, so a
    // re-run of the same step cannot duplicate it.
    if (decision.messages.some(candidate => samePayload(candidate, message))) return decision
    return { kind: 'enter', messages: [...decision.messages, message] }
  })
}

export default apply
