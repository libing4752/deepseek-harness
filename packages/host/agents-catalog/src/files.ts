/**
 * Memory-note discovery for the catalog. Mirrors `@deepseek-ai/dsh-memory`'s
 * file walk (project `.agents/memory/` plus user `~/.agents/memory/`) because
 * that package exposes no list/read service and its loader is not a public
 * export; the catalog reads the same durable files that plugin injects.
 * @module @deepseek-ai/dsh-agents-catalog/files
 */

import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const AGENTS_DIR = '.agents'
const MEMORY_DIR = 'memory'

/** One loaded memory note. */
export interface MemoryNote {
  /** Note basename, e.g. `harness-dev-mode.md`. */
  readonly name: string
  /** Stable display path, e.g. `.agents/memory/harness-dev-mode.md`. */
  readonly displayPath: string
  /** Complete note content. */
  readonly content: string
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

/** Whether a filesystem error is a missing path rather than a real failure. */
function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
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

/**
 * Load every memory note visible to one session, in deterministic display order.
 * @param cwd - session working directory; project memory resolves from its project root.
 * @param agentsHome - user agents home for personal-scope memory.
 * @param signal - cancellation forwarded to reads.
 * @returns loaded notes, sorted by display path.
 */
export async function loadMemoryNotes(
  cwd: string,
  agentsHome: string,
  signal?: AbortSignal,
): Promise<MemoryNote[]> {
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
  const notes: MemoryNote[] = []
  for (const scope of scopes) {
    for (const name of await listMarkdown(scope.dir)) {
      signal?.throwIfAborted()
      const content = await readFile(join(scope.dir, name), {
        encoding: 'utf8',
        ...signal === undefined ? {} : { signal },
      })
      notes.push({ name, displayPath: scope.display(name), content })
    }
  }
  return notes.sort((left, right) => left.displayPath < right.displayPath ? -1 : 1)
}
