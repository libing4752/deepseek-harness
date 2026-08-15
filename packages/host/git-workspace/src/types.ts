/**
 * Client-safe wire vocabulary for the workspace git review Remote. Nothing
 * here reaches a Host-only symbol, so the generated client face reads the same
 * shapes the Host emits.
 * @module @deepseek-ai/dsh-git-workspace/types
 */

/** How one working-tree path differs from HEAD. */
export type ChangedFileStatus = 'added' | 'modified' | 'deleted' | 'untracked'

/** One changed path and how it differs from HEAD. */
export interface ChangedFile {
  /** Repository-relative path (the model-facing display path). */
  readonly path: string
  /** How the path differs from HEAD. */
  readonly status: ChangedFileStatus
}

/** The changed-file list for one workspace. */
export interface ChangedFilesList {
  /** Whether the workspace is inside a git work tree at all. */
  readonly git: boolean
  /** Changed paths, sorted by path; empty when clean. */
  readonly files: readonly ChangedFile[]
}

/** One file's before/after content for the diff view. */
export interface FileDiffResult {
  /** Repository-relative path. */
  readonly path: string
  /** How the path differs from HEAD. */
  readonly status: ChangedFileStatus
  /** Prior content (HEAD), or `null` for a new/untracked file. */
  readonly oldText: string | null
  /** Working-tree content, or `''` for a deleted file. */
  readonly newText: string
}

/** The result of a revert: which paths were reverted. */
export interface RevertResult {
  /** Paths that were reverted, in the order they were requested. */
  readonly reverted: readonly string[]
}
