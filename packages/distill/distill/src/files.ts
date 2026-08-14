/**
 * Distillation target-path resolution and atomic-enough agent-config writes.
 *
 * Artifacts are agent configuration, not model-requested workspace content, so
 * they are written with the host filesystem directly — the same posture as
 * `settings-file` and `agent-presets`, which must reach `$DSH_HOME` and
 * `~/.agents` outside the workspace sandbox. Project-scope artifacts live under
 * the project's `.agents/`; personal-scope artifacts under the user agents home.
 * @module @deepseek-ai/dsh-distill/files
 */

import { access, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { DistillScope } from './types.ts'

/** Directory name shared by the project and user agent-config roots. */
const AGENTS_DIR = '.agents'

/**
 * Resolve the user agents home for personal-scope artifacts.
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

/**
 * Skill directory for one scope under a project and user agents home.
 * @param scope - project or personal scope.
 * @param projectRoot - absolute project root for project-scope skills.
 * @param agentsHome - user agents home for personal-scope skills.
 * @returns the absolute skill directory.
 */
export function skillDir(scope: DistillScope, projectRoot: string, agentsHome: string): string {
  return scope === 'project'
    ? join(projectRoot, AGENTS_DIR, 'skills')
    : join(agentsHome, 'skills')
}

/**
 * Memory directory for one scope under a project and user agents home.
 * @param scope - project or personal scope.
 * @param projectRoot - absolute project root for project-scope memory.
 * @param agentsHome - user agents home for personal-scope memory.
 * @returns the absolute memory directory.
 */
export function memoryDir(scope: DistillScope, projectRoot: string, agentsHome: string): string {
  return scope === 'project'
    ? join(projectRoot, AGENTS_DIR, 'memory')
    : join(agentsHome, 'memory')
}

/**
 * Write a UTF-8 file, creating parent directories first.
 * @param path - absolute target path.
 * @param content - complete file content.
 * @returns the written path.
 */
export async function writeTextFile(path: string, content: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return path
}
