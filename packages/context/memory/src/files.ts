/**
 * Memory-file discovery and reads. Memory notes are flat Markdown files under
 * `.agents/memory/` (project scope) and `<agents-home>/memory/` (personal
 * scope), produced by `@deepseek-ai/dsh-distill` or edited by hand.
 * @module @deepseek-ai/dsh-memory/files
 */

import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const AGENTS_DIR = '.agents'
const MEMORY_DIR = 'memory'

/** One loaded memory note plus its provenance and content identity. */
export interface MemoryFile {
  /** Absolute host path of the note. */
  absolutePath: string
  /** Stable model-facing path: `.agents/memory/<name>` or `~/.agents/memory/<name>`. */
  displayPath: string
  /** Complete note content. */
  content: string
  /** SHA-256 hex digest of the content, used to detect change without re-rendering. */
  digest: string
}

/**
 * Resolve the user agents home for personal-scope memory.
 * @param configured - explicit override; falls back to `$DSH_AGENTS_HOME`, then `~/.agents`.
 * @returns the absolute user agents home.
 */
export function userAgentsHome(configured?: string): string {
  return resolve(configured ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), AGENTS_DIR))
}

/**
 * Walk upward from `cwd` to the first directory containing a `.git` marker.
 * @param cwd - absolute session working directory where the walk begins.
 * @returns the discovered project root, or `cwd` when no marker exists.
 */
export async function findProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd)
  for (;;) {
    try {
      await access(join(current, '.git'))
      return current
    } catch {
      // Not a project root; continue walking upward.
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/** List `.md` basenames in one memory directory, ignoring a missing directory. */
async function listMarkdown(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) return []
    throw error
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort()
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/**
 * Load every memory note visible to one session, in deterministic display order.
 * @param cwd - session working directory; project memory resolves from its project root.
 * @param agentsHome - user agents home for personal-scope memory.
 * @param signal - cancellation forwarded to reads.
 * @returns loaded notes, sorted by display path.
 */
export async function loadMemoryFiles(
  cwd: string,
  agentsHome: string,
  signal?: AbortSignal,
): Promise<MemoryFile[]> {
  const projectRoot = await findProjectRoot(cwd)
  const scopes: Array<{ dir: string; display: (name: string) => string }> = [
    {
      dir: join(projectRoot, AGENTS_DIR, MEMORY_DIR),
      display: name => `${AGENTS_DIR}/${MEMORY_DIR}/${name}`,
    },
    {
      dir: join(agentsHome, MEMORY_DIR),
      display: name => `~/${AGENTS_DIR}/${MEMORY_DIR}/${name}`,
    },
  ]
  const files: MemoryFile[] = []
  for (const scope of scopes) {
    for (const name of await listMarkdown(scope.dir)) {
      signal?.throwIfAborted()
      const content = await readFile(join(scope.dir, name), { encoding: 'utf8', ...signal === undefined ? {} : { signal } })
      files.push({
        absolutePath: join(scope.dir, name),
        displayPath: scope.display(name),
        content,
        digest: createHash('sha256').update(content).digest('hex'),
      })
    }
  }
  return files.sort((left, right) => left.displayPath < right.displayPath ? -1 : 1)
}
