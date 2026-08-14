/**
 * Client-safe wire vocabulary for the skills + memory catalog Remote. Nothing
 * here reaches a Host-only symbol, so the generated client face reads the same
 * shapes the Host emits.
 * @module @deepseek-ai/dsh-agents-catalog/types
 */

/** Which catalog entry a read request addresses. */
export interface CatalogRef {
  /** `skill` reads a skill name; `memory` reads a note's display path. */
  readonly kind: 'skill' | 'memory'
  /** Skill kebab-case name, or memory note display path (`<scope>/.agents/memory/<name>.md`). */
  readonly id: string
}

/** One skill summary row. */
export interface SkillItem {
  /** Kebab-case skill identifier. */
  readonly name: string
  /** Short routing description. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Whether the model-facing catalog advertises this skill. */
  readonly modelInvocable: boolean
  /** Whether a human-facing command catalog advertises this skill. */
  readonly userInvocable: boolean
  /** Discovery source that produced this winning skill. */
  readonly source: string
  /** Provider that owns this skill body. */
  readonly provider: string
}

/** One memory note row. */
export interface MemoryItem {
  /** Note basename, e.g. `harness-dev-mode.md`. */
  readonly name: string
  /** Stable display path, e.g. `.agents/memory/harness-dev-mode.md`. */
  readonly displayPath: string
}

/** The complete catalog for one project scope: skills plus memory notes. */
export interface AgentsCatalogList {
  /** Skill summaries in the registry's display order. */
  readonly skills: readonly SkillItem[]
  /** Memory notes sorted by display path. */
  readonly memory: readonly MemoryItem[]
}

/** One fully-loaded entry: a skill body or a memory note's content. */
export interface CatalogEntry {
  /** Which catalog this entry came from. */
  readonly kind: 'skill' | 'memory'
  /** Skill name or memory note basename. */
  readonly name: string
  /** Display path when the entry came from disk. */
  readonly displayPath?: string
  /** Complete Markdown content (skill body or note text). */
  readonly content: string
}
