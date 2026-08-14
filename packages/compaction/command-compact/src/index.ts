/**
 * Human-facing `/compact` command over the backend-independent compaction seam,
 * with optional distillation of the conversation into a durable skill or memory.
 * @module @deepseek-ai/dsh-command-compact
 */

import type { Context } from '@deepseek-ai/cordis'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { assertSkillName } from '@deepseek-ai/dsh-distill'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

export const name = 'command-compact'
export const inject = ['commands', 'compaction', 'distill']

const USAGE = 'Usage: /compact [--skill <name>] [--memory <title>]'

/** Parsed optional distillation flags. */
interface CompactArgs {
  /** Kebab-case skill name to distill after compaction. */
  skill?: string
  /** Free-form memory title to distill after compaction. */
  memory?: string
}

/** Parse `/compact`'s optional flags; `--memory` consumes the rest of the line. */
function parseArgs(rawInput: string): CompactArgs | { error: string } {
  const trimmed = rawInput.trim()
  if (trimmed.length === 0) return {}
  const args: CompactArgs = {}
  let rest = trimmed
  while (rest.length > 0) {
    if (rest.startsWith('--skill')) {
      rest = rest.slice('--skill'.length).trimStart()
      const match = /^(\S+)(?:\s+|$)/.exec(rest)
      if (match === null || match[1] === undefined) return { error: USAGE }
      args.skill = match[1]
      rest = rest.slice(match[0].length).trimStart()
    } else if (rest.startsWith('--memory')) {
      rest = rest.slice('--memory'.length).trimStart()
      if (rest.length === 0) return { error: USAGE }
      args.memory = rest
      rest = ''
    } else {
      return { error: USAGE }
    }
  }
  return args
}

/** Fail loudly if a locally closed union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value: never): never {
  throw new TypeError(`unknown manual compaction error code: ${String(value)}`)
}
/* v8 ignore stop */

/** Convert expected capability failures into concise human-only outcomes. */
function expectedFailure(error: ManualCompactionError): CommandResult {
  switch (error.code) {
    case 'busy':
      return {
        kind: 'error',
        text: 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.',
      }
    case 'cancelled':
      return { kind: 'error', text: 'Compaction cancelled.' }
    case 'changed':
      return {
        kind: 'error',
        text: 'The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.',
      }
    case 'summary':
      return {
        kind: 'error',
        text: 'Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.',
      }
    case 'commit':
      return {
        kind: 'error',
        text: 'Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.',
      }
    case 'persistence':
      return {
        kind: 'error',
        text: 'Compaction finished, but the session could not be saved.',
      }
    /* v8 ignore next 2 -- ManualCompactionErrorCode is closed and every member is handled above */
    default: return assertNever(error.code)
  }
}

/** Render an arbitrary distillation failure without trusting its coercion. */
function renderThrown(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '<unrenderable thrown value>'
  }
}

/** Execute one manual compaction request with optional distillation. */
async function executeCompact(
  ctx: Context,
  invocation: CommandInvocation,
): Promise<CommandResult> {
  const parsed = parseArgs(invocation.rawInput)
  if ('error' in parsed) return { kind: 'error', text: parsed.error }
  if (parsed.skill !== undefined) {
    try {
      assertSkillName(parsed.skill)
    } catch {
      return { kind: 'error', text: `Invalid skill name "${parsed.skill}": use lowercase kebab-case.` }
    }
  }
  try {
    const result = await ctx.compaction.compactNow(invocation.agent, invocation.signal, invocation.commandId)
    const lines = [
      result === null
        ? 'No compactable history yet.'
        : `Compacted ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).`,
    ]
    try {
      if (parsed.skill !== undefined) {
        const distilled = await ctx.distill.distillSkill(invocation.agent, parsed.skill, invocation.signal)
        lines.push(`Saved skill "${distilled.name}" (${distilled.scope}) to ${distilled.path}`)
      }
      if (parsed.memory !== undefined) {
        const distilled = await ctx.distill.distillMemory(invocation.agent, parsed.memory, invocation.signal)
        lines.push(`Saved memory "${distilled.name}" (${distilled.scope}) to ${distilled.path}`)
      }
    } catch (distillError: unknown) {
      return {
        kind: 'error',
        text: `${result === null ? 'Nothing was compacted' : 'Compaction succeeded'}, but distillation failed: ${renderThrown(distillError)}`,
      }
    }
    return {
      kind: 'success',
      text: lines.join('\n'),
      ...result === null ? {} : { sourceEventSeq: result.summarySeq },
    }
  } catch (error: unknown) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Compaction cancelled.' }
    if (error instanceof ManualCompactionError) return expectedFailure(error)
    throw error
  }
}

/**
 * Register `/compact` for every composed human-command adapter.
 * @param ctx - context carrying the command registry, compaction seam, and distillation service.
 */
export function apply(ctx: Context): void {
  const active = new Set<Promise<CommandResult>>()
  const handler = (invocation: CommandInvocation): Promise<CommandResult> => {
    const operation = executeCompact(ctx, invocation)
    active.add(operation)
    const retire = (): void => { active.delete(operation) }
    // Both branches retire without rethrowing, so the derived observer promise
    // cannot become an unhandled mirror of an expected handler rejection.
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    // Yield drain before registration: composite teardown is LIFO, so no new
    // invocation can enter while already-started handler promises quiesce.
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      name: 'compact',
      description: 'Compact older conversation history, optionally distilling it into a skill or memory',
      input: { hint: '--skill <name> | --memory <title>' },
      handler,
    })
  }, 'command-compact lifecycle')
}
