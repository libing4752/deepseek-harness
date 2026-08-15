/**
 * Unit tests for the workspace git review: the git plumbing helpers against a
 * real temporary repository, and the Remote service methods over a booted
 * Context + SessionStore. Revert is exercised end-to-end (the file is restored
 * or removed), because that is the whole point of the write path.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { isGitRepo, listChangedFiles, readFileDiff, revertPaths } from '../src/git.ts'
import GitWorkspaceRuntime from '../src/index.ts'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd })
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-git-workspace-'))
  await git(dir, ['init', '-q'])
  await git(dir, ['config', 'user.email', 'test@example.com'])
  await git(dir, ['config', 'user.name', 'Test'])
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Commit a file so the repository has a HEAD. */
async function commit(file: string, content: string): Promise<void> {
  await writeFile(join(dir, file), content)
  await git(dir, ['add', file])
  await git(dir, ['commit', '-qm', 'init'])
}

describe('git plumbing', () => {
  it('detects a git work tree and rejects a non-git directory', async () => {
    expect(await isGitRepo(dir)).toBe(true)
    expect(await isGitRepo(join(dir, 'missing'))).toBe(false)
  })

  it('lists modified, untracked, and deleted files with correct status', async () => {
    await commit('a.txt', 'one\n')
    await commit('gone.txt', 'bye\n')
    await writeFile(join(dir, 'a.txt'), 'one changed\n')
    await writeFile(join(dir, 'new.txt'), 'brand new\n')
    await rm(join(dir, 'gone.txt'))

    expect(await listChangedFiles(dir)).toEqual([
      { path: 'a.txt', status: 'modified' },
      { path: 'gone.txt', status: 'deleted' },
      { path: 'new.txt', status: 'untracked' },
    ])
  })

  it('classifies a staged add as added', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'new.txt'), 'staged\n')
    await git(dir, ['add', 'new.txt'])
    expect(await listChangedFiles(dir)).toEqual([{ path: 'new.txt', status: 'added' }])
  })

  it('classifies a rename as modified under the destination path', async () => {
    await commit('old.txt', 'one\n')
    await git(dir, ['mv', 'old.txt', 'new.txt'])
    expect(await listChangedFiles(dir)).toEqual([{ path: 'new.txt', status: 'modified' }])
  })

  it('reads before/after content for modified, deleted, and untracked files', async () => {
    await commit('a.txt', 'one\n')
    await commit('gone.txt', 'bye\n')
    await writeFile(join(dir, 'a.txt'), 'one changed\n')
    await writeFile(join(dir, 'new.txt'), 'brand new\n')
    await rm(join(dir, 'gone.txt'))

    const byPath = new Map((await listChangedFiles(dir)).map(file => [file.path, file]))
    expect(await readFileDiff(dir, byPath.get('a.txt')!)).toMatchObject({ oldText: 'one\n', newText: 'one changed\n' })
    expect(await readFileDiff(dir, byPath.get('new.txt')!)).toMatchObject({ oldText: null, newText: 'brand new\n' })
    expect(await readFileDiff(dir, byPath.get('gone.txt')!)).toMatchObject({ oldText: 'bye\n', newText: '' })
  })

  it('reverts a modified file to HEAD', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'a.txt'), 'changed\n')
    expect(await revertPaths(dir, ['a.txt'])).toEqual(['a.txt'])
    expect(await readFile(join(dir, 'a.txt'), 'utf8')).toBe('one\n')
    expect(await listChangedFiles(dir)).toEqual([])
  })

  it('removes an untracked file on revert', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'new.txt'), 'brand new\n')
    expect(await revertPaths(dir, ['new.txt'])).toEqual(['new.txt'])
    await expect(readFile(join(dir, 'new.txt'), 'utf8')).rejects.toThrow()
  })

  it('reverts every changed path when paths is empty', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'a.txt'), 'changed\n')
    await writeFile(join(dir, 'new.txt'), 'brand new\n')
    expect(await revertPaths(dir, [])).toEqual(['a.txt', 'new.txt'])
    expect(await listChangedFiles(dir)).toEqual([])
  })

  it('ignores a path that is not currently changed', async () => {
    await commit('a.txt', 'one\n')
    expect(await revertPaths(dir, ['missing.txt'])).toEqual([])
    expect(await listChangedFiles(dir)).toEqual([])
  })
})

describe('GitWorkspaceRuntime', () => {
  async function mount(): Promise<{ ctx: Context; agent: Agent }> {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(GitWorkspaceRuntime)
    const session = ctx.sessions.create(SessionId('git-test'), { meta: { cwd: dir } })
    return { ctx, agent: { id: session.id, session } as Agent }
  }

  it('degrades every method on a non-git workspace', async () => {
    const { ctx } = await mount()
    const signal = new AbortController().signal
    const session = ctx.sessions.create(SessionId('non-git'), { meta: { cwd: join(dir, 'nope') } })
    const nonGit = { id: session.id, session } as Agent
    expect(await ctx.gitWorkspace.changedFiles(nonGit, signal)).toEqual({ git: false, files: [] })
    expect(await ctx.gitWorkspace.fileDiff(nonGit, 'a.txt', signal)).toBeUndefined()
    expect(await ctx.gitWorkspace.revert(nonGit, ['a.txt'], signal)).toEqual({ reverted: [] })
  })

  it('falls back to process.cwd() when the session carries no cwd', async () => {
    const { ctx } = await mount()
    const signal = new AbortController().signal
    const session = ctx.sessions.create(SessionId('no-cwd'), {})
    const noCwd = { id: session.id, session } as Agent
    // The test runs inside the harness checkout, so process.cwd() is a git
    // repository; only the git flag is asserted (the file list is the repo's
    // own uncommitted state). The diff/revert calls use a path that cannot be
    // a changed file, so revert is a no-op.
    const list = await ctx.gitWorkspace.changedFiles(noCwd, signal)
    expect(list.git).toBe(true)
    expect(await ctx.gitWorkspace.fileDiff(noCwd, 'zzz-not-a-real-path', signal)).toBeUndefined()
    expect(await ctx.gitWorkspace.revert(noCwd, ['zzz-not-a-real-path'], signal)).toEqual({ reverted: [] })
  })

  it('lists changed files and reads one file diff through the service', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'a.txt'), 'one changed\n')
    const { ctx, agent } = await mount()
    const signal = new AbortController().signal
    const list = await ctx.gitWorkspace.changedFiles(agent, signal)
    expect(list.git).toBe(true)
    expect(list.files).toEqual([{ path: 'a.txt', status: 'modified' }])
    expect(await ctx.gitWorkspace.fileDiff(agent, 'a.txt', signal)).toMatchObject({ oldText: 'one\n', newText: 'one changed\n' })
    expect(await ctx.gitWorkspace.fileDiff(agent, 'missing.txt', signal)).toBeUndefined()
  })

  it('reverts through the service and reports the reverted paths', async () => {
    await commit('a.txt', 'one\n')
    await writeFile(join(dir, 'a.txt'), 'changed\n')
    const { ctx, agent } = await mount()
    const signal = new AbortController().signal
    expect(await ctx.gitWorkspace.revert(agent, ['a.txt'], signal)).toEqual({ reverted: ['a.txt'] })
    expect(await readFile(join(dir, 'a.txt'), 'utf8')).toBe('one\n')
  })
})
