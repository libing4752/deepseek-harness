/**
 * Distillation service (`ctx.distill`): turn a conversation into a durable
 * skill or memory artifact.
 *
 * A distillation reads the session's current derived history, asks the model
 * for a scope classification plus prose body, and writes the artifact to the
 * project `.agents/` (project scope) or the user agents home (personal scope).
 * Skills become `SKILL.md` files the filesystem skill provider discovers; memory
 * notes become Markdown files the `@deepseek-ai/dsh-memory` context plugin
 * injects into later sessions. The scope classification is the model's one
 * routing decision; code owns the name/title, the path, and the file framing.
 * @module @deepseek-ai/dsh-distill
 */

import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { BlockAssembler, contentHasImage, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { DistillId } from './brand.ts'
import {
  findProjectRoot,
  memoryDir,
  skillDir,
  userAgentsHome,
  writeTextFile,
} from './files.ts'
import { assertSkillName, parseDistilledResponse, slugify } from './parse.ts'
import type { DistillKind, DistillResult } from './types.ts'

export { DistillId } from './brand.ts'
export { DistillParseError, assertSkillName, slugify } from './parse.ts'
export { findProjectRoot, userAgentsHome } from './files.ts'
export type { DistillKind, DistillResult, DistillScope, DistilledDocument } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    distill: DistillEngine
  }
}

/** Default generation cap for a distillation call. */
const DEFAULT_MAX_TOKENS = 2048

/** Distillation configuration. */
export interface DistillConfig {
  /** User agents home for personal-scope writes. Defaults to `$DSH_AGENTS_HOME` or `~/.agents`. */
  agentsHome?: string
  /** Generation cap for the distillation call. */
  maxTokens?: number
  /** Provider route override for the distillation call. */
  provider?: string
  /** Model override for the distillation call. */
  model?: string
}

const SKILL_INSTRUCTION = [
  'You are distilling the conversation ABOVE into a reusable skill for this AI coding assistant.',
  '',
  'Respond with EXACTLY the structure below and nothing else:',
  '',
  'Scope: <project|personal>',
  'Description: <one-line description of when and why to use this skill>',
  '---',
  '<skill body in Markdown: the reusable, task-specific instructions>',
  '',
  'Rules:',
  '- Choose "project" scope when the skill is specific to this codebase or workspace; choose "personal" scope when it captures the user\'s own reusable preferences or working style.',
  '- Write concise, actionable instructions, not a conversation summary. State the reusable procedure, conventions, and pitfalls.',
  '- Output only the structure above: do not call any tool or take any other action.',
].join('\n')

const MEMORY_INSTRUCTION = [
  'You are distilling the conversation ABOVE into a durable memory note for this AI coding assistant.',
  '',
  'Respond with EXACTLY the structure below and nothing else:',
  '',
  'Scope: <project|personal>',
  '---',
  '<memory body in Markdown: the durable facts, decisions, constraints, and preferences worth remembering>',
  '',
  'Rules:',
  '- Choose "project" scope when the memory is about this codebase or workspace; choose "personal" scope when it captures the user\'s own preferences, habits, or reusable working style.',
  '- Write only durable, reusable facts — decisions, constraints, and preferences — not a transcript of what happened.',
  '- Output only the structure above: do not call any tool or take any other action.',
].join('\n')

/**
 * Concrete distillation service. Subclasses may override {@link summarize} to
 * swap the model-backed producer; the parsing and file framing stay fixed so
 * the scope routing and file layout are always code-owned.
 */
export class DistillEngine extends Service {
  static inject = ['llm']

  private readonly agentsHome: string
  private readonly maxTokens: number
  private readonly target: { provider: string; model: string } | undefined

  constructor(ctx: Context, config: DistillConfig = {}) {
    super(ctx, 'distill')
    this.agentsHome = userAgentsHome(config.agentsHome)
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
    if (!Number.isInteger(this.maxTokens) || this.maxTokens < 1) {
      throw new TypeError('distill: maxTokens must be a positive integer')
    }
    this.target = config.provider !== undefined && config.model !== undefined
      ? { provider: config.provider, model: config.model }
      : undefined
  }

  /**
   * Distill the conversation into a skill file and write it.
   * @param agent - owner of the session being distilled; supplies history and project cwd.
   * @param name - kebab-case skill name (frontmatter name and directory).
   * @param signal - cancellation forwarded to the model call.
   * @returns the written artifact result.
   */
  async distillSkill(agent: Agent, name: string, signal: AbortSignal): Promise<DistillResult> {
    assertSkillName(name)
    const document = parseDistilledResponse(await this.summarize(agent, 'skill', signal), 'skill')
    const projectRoot = await findProjectRoot(agent.session.header.cwd ?? process.cwd())
    const dir = skillDir(document.scope, projectRoot, this.agentsHome)
    const content = [
      '---',
      `name: ${name}`,
      `description: ${document.summary}`,
      '---',
      document.body,
    ].join('\n')
    const path = await writeTextFile(join(dir, name, 'SKILL.md'), `${content}\n`)
    return { distillId: DistillId(`${name}-${Date.now()}`), kind: 'skill', scope: document.scope, path, name }
  }

  /**
   * Distill the conversation into a memory note and write it.
   * @param agent - owner of the session being distilled.
   * @param title - note title; becomes the file slug and the `#` heading.
   * @param signal - cancellation forwarded to the model call.
   * @returns the written artifact result.
   */
  async distillMemory(agent: Agent, title: string, signal: AbortSignal): Promise<DistillResult> {
    if (title.trim().length === 0) {
      throw new Error('distill memory requires a non-empty title')
    }
    const slug = slugify(title)
    const document = parseDistilledResponse(await this.summarize(agent, 'memory', signal), 'memory')
    const projectRoot = await findProjectRoot(agent.session.header.cwd ?? process.cwd())
    const dir = memoryDir(document.scope, projectRoot, this.agentsHome)
    const content = [`# ${title.trim()}`, '', document.body].join('\n')
    const path = await writeTextFile(join(dir, `${slug}.md`), `${content}\n`)
    return { distillId: DistillId(`${slug}-${Date.now()}`), kind: 'memory', scope: document.scope, path, name: slug }
  }

  /**
   * Run the model-backed distillation: replay the derived history, append the
   * kind-specific instruction, and return the raw text output.
   * @param agent - supplies routed-model history, fallback model, and history.
   * @param kind - which artifact form is requested.
   * @param signal - cancellation forwarded to the adapter.
   * @returns the complete raw model output.
   */
  protected async summarize(agent: Agent, kind: DistillKind, signal?: AbortSignal): Promise<string> {
    const target = resolveTarget(agent, this.target)
    const instruction = kind === 'skill' ? SKILL_INSTRUCTION : MEMORY_INSTRUCTION
    const messages: Message[] = [
      ...agent.session.deriveMessages(),
      createUserMessage({
        content: [{ type: 'text', text: instruction }],
        source: { kind: 'plugin', plugin: 'dsh-distill' },
      }),
    ]
    const options: GenerateOptions = {
      provider: target.provider,
      model: target.model,
      messages,
      maxTokens: this.maxTokens,
      sessionId: agent.session.id,
      ...signal === undefined ? {} : { signal },
    }
    const assembler = new BlockAssembler()
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const error = finishError(assembler.finish)
    if (error !== undefined) throw error
    const rawOutput = assembler.blocks()
    const text = textOnly(rawOutput)
    if (text.length === 0) throw new Error(`distill ${kind} produced no text output`)
    return text
  }
}

/** Resolve the exact provider/model for the distillation call. */
function resolveTarget(agent: Agent, override: { provider: string; model: string } | undefined): { provider: string; model: string } {
  if (override !== undefined) return override
  const routed = agent.session.requestHeader()?.config
  if (routed !== undefined && routed.provider.length > 0 && routed.model.length > 0) {
    return { provider: routed.provider, model: routed.model }
  }
  if (agent.options.provider !== undefined && agent.options.provider.length > 0
    && agent.options.model !== undefined && agent.options.model.length > 0) {
    return { provider: agent.options.provider, model: agent.options.model }
  }
  throw new Error('no provider/model available for distillation: route one request or set both AgentOptions fields')
}

/** Map a terminal distillation finish to its fail-closed error. */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message) as Error & { code?: string }
      error.code = finish.failure.code
      return error
    }
    case 'max-tokens': {
      const error = new Error('distillation truncated at the token cap (incomplete artifact)') as Error & { code?: string }
      error.code = 'MAX_TOKENS'
      return error
    }
    default:
      return undefined
  }
}

/** Reject visual output and keep only text blocks. */
function textOnly(blocks: readonly ContentBlock[]): string {
  if (contentHasImage(blocks)) {
    throw new LlmError('distillation output cannot contain image content', 'UNSUPPORTED_CONTENT')
  }
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

export default DistillEngine
