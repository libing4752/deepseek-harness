/**
 * Workspace git review service for the Web GUI, exposed over Typert Remote.
 * Enumerates working-tree changes relative to HEAD, reads one file's
 * before/after content for the diff view, and reverts paths to HEAD. The two
 * read methods never mutate the repository; `revert` is the single write and
 * only touches paths the current git status reports.
 * @module @deepseek-ai/dsh-git-workspace
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isGitRepo, listChangedFiles, readFileDiff, revertPaths } from './git.ts'
import type { ChangedFilesList, FileDiffResult, RevertResult } from './types.ts'

export type * from './types.ts'

export const name = 'gitWorkspace'

declare module '@deepseek-ai/cordis' {
  interface Context {
    gitWorkspace: GitWorkspaceRuntime
  }
}

/** Freeze one changed file for the wire. */
function freezeFile(file: { path: string; status: ChangedFilesList['files'][number]['status'] }) {
  return Object.freeze({ path: file.path, status: file.status })
}

/**
 * Read-only workspace git review. `revert` is a user-initiated host action, not
 * a model-facing tool, so it runs outside the model's sandbox policy on the
 * real workspace — the same trust the apiproxy checkpoint/rewind helpers hold.
 */
export class GitWorkspaceRuntime extends TypertRemoteService {
  /** @param ctx - owning root context (the service registers as `gitWorkspace`). */
  constructor(ctx: Context) {
    super(ctx, 'gitWorkspace')
  }

  /**
   * List the workspace's changed files.
   * @param agent - exact agent whose session cwd selects the workspace.
   * @param signal - cancellation forwarded to the git calls.
   * @returns the changed list, with `git: false` when the cwd is not a git work tree.
   */
  @Remote
  async changedFiles(agent: Agent, signal: AbortSignal): Promise<ChangedFilesList> {
    const cwd = agent.session.header.cwd ?? process.cwd()
    signal.throwIfAborted()
    if (!(await isGitRepo(cwd))) return Object.freeze({ git: false, files: Object.freeze([]) })
    const files = await listChangedFiles(cwd)
    signal.throwIfAborted()
    return Object.freeze({ git: true, files: Object.freeze(files.map(freezeFile)) })
  }

  /**
   * Read one changed file's before/after content.
   * @param agent - exact agent whose session cwd selects the workspace.
   * @param path - repository-relative path, as reported by {@link changedFiles}.
   * @param signal - cancellation forwarded to the git calls.
   * @returns the diff result, or `undefined` when the path is not a changed file.
   */
  @Remote
  async fileDiff(agent: Agent, path: string, signal: AbortSignal): Promise<FileDiffResult | undefined> {
    const cwd = agent.session.header.cwd ?? process.cwd()
    signal.throwIfAborted()
    if (!(await isGitRepo(cwd))) return undefined
    const files = await listChangedFiles(cwd)
    signal.throwIfAborted()
    const file = files.find(candidate => candidate.path === path)
    if (file === undefined) return undefined
    return readFileDiff(cwd, file)
  }

  /**
   * Revert changed paths to HEAD. An empty `paths` reverts every changed path.
   * @param agent - exact agent whose session cwd selects the workspace.
   * @param paths - repository-relative paths to revert; empty reverts all.
   * @param signal - cancellation forwarded to the git calls.
   * @returns the reverted paths.
   */
  @Remote
  async revert(agent: Agent, paths: readonly string[], signal: AbortSignal): Promise<RevertResult> {
    const cwd = agent.session.header.cwd ?? process.cwd()
    signal.throwIfAborted()
    if (!(await isGitRepo(cwd))) return Object.freeze({ reverted: Object.freeze([]) })
    const reverted = await revertPaths(cwd, paths)
    signal.throwIfAborted()
    return Object.freeze({ reverted: Object.freeze(reverted) })
  }
}

export default GitWorkspaceRuntime
