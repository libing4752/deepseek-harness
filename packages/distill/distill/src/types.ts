/**
 * Distillation vocabulary: the artifact kind, the scope classification, and
 * the result of one completed write.
 * @module @deepseek-ai/dsh-distill/types
 */

import type { DistillId } from './brand.ts'

export type { DistillId }

/** Whether an artifact belongs to the project or the person, chosen by the model. */
export type DistillScope = 'project' | 'personal'

/** The two durable artifact forms distillation can produce. */
export type DistillKind = 'skill' | 'memory'

/** A validated, parsed distillation output before it is written. */
export interface DistilledDocument {
  /** The model-chosen write scope. */
  scope: DistillScope
  /** Skill: the one-line catalog description. Memory: unused (the caller owns the title). */
  summary: string
  /** The artifact body, without the caller-supplied name/title. */
  body: string
}

/** Result of one successful distillation and filesystem write. */
export interface DistillResult {
  /** Stable identity shared by this distillation's lifecycle. */
  distillId: DistillId
  /** Which artifact form was written. */
  kind: DistillKind
  /** Where the artifact landed. */
  scope: DistillScope
  /** Absolute path of the written file. */
  path: string
  /** Skill name (kind `skill`) or memory slug (kind `memory`). */
  name: string
}
