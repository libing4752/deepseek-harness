/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-compact`.
 * @module @deepseek-ai/dsh-client-ui-compact/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-compact'

/** Cordis companion plugin name. */
export const name = 'client-ui-compact-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this is a pure UI surface plugin; the `/compact`
 * command's behavior and boundaries are audited by dsh-command-compact and
 * dsh-distill, while this control's slot registration is exercised by this
 * package.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
