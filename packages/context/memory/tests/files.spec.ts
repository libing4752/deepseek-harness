import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMemoryFiles } from '@deepseek-ai/dsh-memory/src/files.ts'

let temp: string
let projectRoot: string
let agentsHome: string

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
  projectRoot = join(temp, 'repo')
  agentsHome = join(temp, 'agents')
  await mkdir(join(projectRoot, '.git'), { recursive: true })
  await mkdir(join(agentsHome, 'memory'), { recursive: true })
})

afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})

describe('loadMemoryFiles', () => {
  it('loads project and personal notes in display order', async () => {
    await mkdir(join(projectRoot, '.agents', 'memory'), { recursive: true })
    await writeFile(join(projectRoot, '.agents', 'memory', 'zeta.md'), 'project note', 'utf8')
    await writeFile(join(agentsHome, 'memory', 'alpha.md'), 'personal note', 'utf8')

    const files = await loadMemoryFiles(projectRoot, agentsHome)

    expect(files.map(file => file.displayPath)).toEqual([
      '.agents/memory/zeta.md',
      '~/.agents/memory/alpha.md',
    ])
    expect(files[0]?.content).toBe('project note')
    expect(files[1]?.content).toBe('personal note')
    expect(files[0]?.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ignores non-markdown files and returns empty when no notes exist', async () => {
    await mkdir(join(projectRoot, '.agents', 'memory'), { recursive: true })
    await writeFile(join(projectRoot, '.agents', 'memory', 'notes.txt'), 'not a note', 'utf8')

    expect(await loadMemoryFiles(projectRoot, agentsHome)).toEqual([])
  })

  it('treats a missing memory directory as empty', async () => {
    expect(await loadMemoryFiles(projectRoot, agentsHome)).toEqual([])
  })
})
