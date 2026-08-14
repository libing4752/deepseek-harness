import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity shared by one distillation transaction. */
export type DistillId = Branded<'DistillId'>

/**
 * Brand an implementation-minted distillation identity.
 * @param id - opaque transaction identity.
 * @returns the same string, branded; no validation is performed.
 */
export function DistillId(id: string): DistillId {
  return id as DistillId
}
