/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-git-workspace`.
 * @module @deepseek-ai/dsh-git-workspace/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-git-workspace'

/** Cordis companion plugin name. */
export const name = 'git-workspace-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the service shells out to git over a caller-supplied
 * workspace and emits no cordis events; its status/diff/revert behavior is
 * asserted by this package's specs against a real temporary git repository.
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
