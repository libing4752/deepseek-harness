/**
 * Workspace git checkpoint / rewind helpers for the `session.rewind` feature.
 *
 * The model's file mutations reach disk through two paths: the first-class
 * `write`/`edit`/`str_replace_editor` tools (via `ctx.fs`) and arbitrary
 * `bash` commands (opaque to the fs seam). A git snapshot is therefore the
 * only complete catch-all for "restore the workspace to before a turn", and it
 * also matches the branch workflow the feature exposes: each turn boundary is
 * snapshotted onto a hidden checkpoint ref, and a rewind checks out a new
 * branch rooted at the checkpoint so a later merge-back is a plain `git merge`.
 *
 * Snapshotting never mutates the user's index or working branch: it stages
 * into a throwaway `GIT_INDEX_FILE`, writes a tree, commits it with
 * `commit-tree`, and records the commit on the hidden ref. Non-git workspaces
 * are detected up front and skipped.
 * @module @deepseek-ai/dsh-apiproxy/workspace-git
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Bound on a single git command's captured stdout (porcelain listings can be large). */
const GIT_MAX_BUFFER = 64 * 1024 * 1024

/** Run one git command in a workspace, returning its trimmed stdout. */
async function git(cwd: string, args: readonly string[], env?: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync('git', args as string[], {
    cwd,
    env: env === undefined ? process.env : { ...process.env, ...env },
    maxBuffer: GIT_MAX_BUFFER,
  })
  return stdout
}

/**
 * Whether a workspace directory is inside a git work tree.
 * @param cwd - workspace root to test.
 * @returns whether `git rev-parse --is-inside-work-tree` succeeds.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the current HEAD commit sha for a workspace.
 * @param cwd - workspace root.
 * @returns the trimmed HEAD sha.
 */
export async function headSha(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim()
}

/**
 * Snapshot the workspace working tree as a commit recorded on `refName`
 * (a `refs/heads/dsh/checkpoints/<sessionId>`-style hidden branch). A clean
 * tree records HEAD itself instead of minting an empty commit.
 * @param cwd - workspace root.
 * @param refName - full ref path to update (e.g. `refs/heads/dsh/checkpoints/<id>`).
 * @param message - commit message for the snapshot commit.
 * @returns the checkpoint commit sha (HEAD when the tree was clean).
 */
export async function snapshotWorkspace(cwd: string, refName: string, message: string): Promise<string> {
  const status = await git(cwd, ['status', '--porcelain'])
  if (status.trim() === '') {
    const head = await headSha(cwd)
    await git(cwd, ['update-ref', refName, head])
    return head
  }
  const indexDir = await mkdtemp(join(tmpdir(), 'dsh-git-index-'))
  const indexFile = join(indexDir, 'index')
  try {
    const env = { GIT_INDEX_FILE: indexFile }
    await git(cwd, ['read-tree', 'HEAD'], env)
    await git(cwd, ['add', '-A'], env)
    const tree = (await git(cwd, ['write-tree'], env)).trim()
    const head = await headSha(cwd)
    const commit = (await git(cwd, ['commit-tree', tree, '-p', head, '-m', message], env)).trim()
    await git(cwd, ['update-ref', refName, commit])
    return commit
  } finally {
    await rm(indexDir, { recursive: true, force: true })
  }
}

/**
 * Force-reset `branchName` to `commitSha` and check it out, restoring the
 * working tree to that snapshot. The caller must supply a fresh branch name
 * (never the currently checked-out branch): force-checkout discards any
 * uncommitted work since the checkpoint, which is exactly what a rewind asks.
 * @param cwd - workspace root.
 * @param branchName - short branch name (e.g. `dsh/rewind/<sessionId>-<n>`).
 * @param commitSha - checkpoint commit to root the branch at.
 * @returns the checked-out branch name.
 */
export async function checkoutRewindBranch(cwd: string, branchName: string, commitSha: string): Promise<string> {
  await git(cwd, ['branch', '-f', branchName, commitSha])
  await git(cwd, ['checkout', '-f', branchName])
  // `checkout -f` reverts tracked files only; remove untracked files created
  // after the checkpoint so the workspace is a byte-exact restoration of it.
  await git(cwd, ['clean', '-fd'])
  return branchName
}

/**
 * Mint a unique rewind branch name for one session.
 * @param sessionId - session the branch belongs to.
 * @returns a branch name unique to this rewind.
 */
export function rewindBranchName(sessionId: string): string {
  return `dsh/rewind/${sessionId}-${randomUUID()}`
}

/**
 * Hidden checkpoint ref for one session.
 * @param sessionId - session the checkpoint belongs to.
 * @returns the full ref path.
 */
export function checkpointRef(sessionId: string): string {
  return `refs/heads/dsh/checkpoints/${sessionId}`
}
