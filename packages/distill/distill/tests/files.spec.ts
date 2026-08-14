import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findProjectRoot,
  memoryDir,
  skillDir,
  userAgentsHome,
  writeTextFile,
} from '@deepseek-ai/dsh-distill/src/files.ts'

let temp: string
let originalAgentsHome: string | undefined

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'dsh-distill-'))
  originalAgentsHome = process.env.DSH_AGENTS_HOME
})

afterEach(async () => {
  if (originalAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
  else process.env.DSH_AGENTS_HOME = originalAgentsHome
  await rm(temp, { recursive: true, force: true })
})

describe('userAgentsHome', () => {
  it('honors an explicit override', () => {
    expect(userAgentsHome('/custom/agents')).toBe('/custom/agents')
  })

  it('honors DSH_AGENTS_HOME', () => {
    process.env.DSH_AGENTS_HOME = '/env/agents'
    expect(userAgentsHome()).toBe('/env/agents')
  })
})

describe('findProjectRoot', () => {
  it('finds the nearest .git marker', async () => {
    const nested = join(temp, 'a', 'b')
    await mkdir(join(temp, '.git'), { recursive: true })
    await mkdir(nested, { recursive: true })
    expect(await findProjectRoot(nested)).toBe(temp)
  })

  it('falls back to cwd when no marker exists', async () => {
    const leaf = join(temp, 'leaf')
    await mkdir(leaf, { recursive: true })
    expect(await findProjectRoot(leaf)).toBe(leaf)
  })
})

describe('skillDir / memoryDir', () => {
  it('routes project and personal scopes to their roots', () => {
    expect(skillDir('project', '/repo', '/agents')).toBe(join('/repo', '.agents', 'skills'))
    expect(skillDir('personal', '/repo', '/agents')).toBe(join('/agents', 'skills'))
    expect(memoryDir('project', '/repo', '/agents')).toBe(join('/repo', '.agents', 'memory'))
    expect(memoryDir('personal', '/repo', '/agents')).toBe(join('/agents', 'memory'))
  })
})

describe('writeTextFile', () => {
  it('creates parent directories and writes UTF-8', async () => {
    const path = join(temp, 'nested', 'dirs', 'file.md')
    await writeTextFile(path, 'hello\n')
    expect(await readFile(path, 'utf8')).toBe('hello\n')
  })

  it('overwrites an existing file', async () => {
    const path = join(temp, 'file.md')
    await writeFile(path, 'old', 'utf8')
    await writeTextFile(path, 'new')
    expect(await readFile(path, 'utf8')).toBe('new')
  })
})
