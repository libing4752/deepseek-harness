/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-agents-catalog`.
 * @module @deepseek-ai/dsh-agents-catalog/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-agents-catalog'

/** Cordis companion plugin name. */
export const name = 'agents-catalog-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a read-only catalog over `ctx.skills` and on-disk
 * memory notes — it emits no cordis events and owns no cross-plugin mutable
 * state; list/read behavior is asserted by this package's specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
