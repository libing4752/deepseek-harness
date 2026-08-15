/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-web-auth`.
 * @module @deepseek-ai/dsh-host-web-auth/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-web-auth'

/** Cordis companion plugin name. */
export const name = 'host-web-auth-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the owned relation is the deny/allow decision the gate
 * makes over the running HTTP surface, which cannot be probed synchronously
 * from `internal/plugin` teardown — asserting it needs a live request, which
 * the package's real-composition test owns. The gate and route disposers are
 * plain webserver register/dispose pairs, already covered by the webserver
 * companion's symmetry probe.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
