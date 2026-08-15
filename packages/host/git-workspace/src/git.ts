/**
 * Git plumbing for the workspace review Remote: enumerate working-tree changes,
 * read a file's HEAD-vs-worktree content, and revert paths to HEAD. Every
 * command runs with `execFile` (no shell) against a resolved workspace root,
 * the same posture as the apiproxy workspace-git helpers.
 * @module @deepseek-ai/dsh-git-workspace/git
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ChangedFile, ChangedFileStatus, FileDiffResult } from './types.ts'

const execFileAsync = promisify(execFile)

/** Bound on one git command's captured stdout. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024

/** Run one git command in a workspace, returning its full stdout. */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args as string[], {
    cwd,
    maxBuffer: GIT_MAX_BUFFER,
  })
  return stdout
}

/**
 * Whether `cwd` is inside a git work tree.
 * @param cwd - directory to probe.
 * @returns whether `git rev-parse` reports an inside-work-tree directory.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

/** Classify a two-column porcelain status (X/Y) into one change kind. */
function classify(x: string, y: string): ChangedFileStatus {
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'A' || y === 'A') return 'added'
  return 'modified'
}

/** Parse one `git status --porcelain` line into a changed path + status. */
function parseStatusLine(line: string): ChangedFile {
  // `charAt` returns '' out of range (never undefined), so a short or malformed
  // line degrades to an empty status column that `classify` reads as `modified`.
  const x = line.charAt(0)
  const y = line.charAt(1)
  let path = line.slice(3)
  // A rename reads `R  old -> new`; the review shows the destination path.
  const arrow = path.indexOf(' -> ')
  if (arrow >= 0) path = path.slice(arrow + 4)
  return { path, status: classify(x, y) }
}

/**
 * Enumerate working-tree changes relative to HEAD, sorted by path.
 * @param cwd - repository root.
 * @returns the changed files, or an empty list when the tree is clean.
 */
export async function listChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const status = await git(cwd, ['status', '--porcelain'])
  if (status.trim() === '') return []
  return status
    .split('\n')
    .filter(line => line.length > 0)
    .map(parseStatusLine)
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Read a path's HEAD content, or `null` when the path has no HEAD version. */
async function headContent(cwd: string, path: string): Promise<string | null> {
  try {
    return await git(cwd, ['show', `HEAD:${path}`])
  } catch {
    return null
  }
}

/** Read a path's working-tree content, or `''` when the file does not exist. */
async function workingContent(cwd: string, path: string): Promise<string> {
  try {
    return await readFile(join(cwd, path), 'utf8')
  } catch {
    return ''
  }
}

/**
 * Build one file's diff result: HEAD content vs working-tree content.
 * @param cwd - repository root.
 * @param file - the changed file to read.
 * @returns the before/after content for the diff view.
 */
export async function readFileDiff(cwd: string, file: ChangedFile): Promise<FileDiffResult> {
  const [oldText, newText] = await Promise.all([
    headContent(cwd, file.path),
    workingContent(cwd, file.path),
  ])
  return Object.freeze({ path: file.path, status: file.status, oldText, newText })
}

/**
 * Revert working-tree changes to HEAD. Tracked paths reset their index and
 * worktree with `git restore`; untracked paths are removed with `git clean`.
 * An empty `paths` reverts every changed path. Only paths the current status
 * reports are touched, so an unknown path is a no-op rather than an escape.
 * @param cwd - workspace root.
 * @param paths - repository-relative paths to revert; empty reverts all.
 * @returns the reverted paths, in the order they were reported.
 */
export async function revertPaths(cwd: string, paths: readonly string[]): Promise<string[]> {
  const statuses = await listChangedFiles(cwd)
  const requested = paths.length === 0
    ? statuses
    : statuses.filter(file => paths.includes(file.path))
  const untracked = requested.filter(file => file.status === 'untracked')
  const tracked = requested.filter(file => file.status !== 'untracked')
  if (tracked.length > 0) {
    await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked.map(file => file.path)])
  }
  if (untracked.length > 0) {
    await git(cwd, ['clean', '-fd', '--', ...untracked.map(file => file.path)])
  }
  return requested.map(file => file.path)
}
