import { describe, expect, it } from 'vitest'
import { DistillParseError } from '@deepseek-ai/dsh-distill'
import { assertSkillName, parseDistilledResponse, slugify } from '@deepseek-ai/dsh-distill/src/parse.ts'

describe('parseDistilledResponse', () => {
  it('parses a skill response with scope, description, and body', () => {
    const raw = [
      'Scope: project',
      'Description: Reusable build and test procedure',
      '---',
      '# Steps',
      '1. run the thing',
    ].join('\n')
    expect(parseDistilledResponse(raw, 'skill')).toEqual({
      scope: 'project',
      summary: 'Reusable build and test procedure',
      body: '# Steps\n1. run the thing',
    })
  })

  it('parses a personal-scope memory response without a description line', () => {
    const raw = [
      'Scope: personal',
      '---',
      'The user prefers concise diffs.',
    ].join('\n')
    expect(parseDistilledResponse(raw, 'memory')).toEqual({
      scope: 'personal',
      summary: '',
      body: 'The user prefers concise diffs.',
    })
  })

  it('tolerates a leading blank line before the header', () => {
    const raw = [
      '',
      'Scope: project',
      'Description: desc',
      '---',
      'body',
    ].join('\n')
    expect(parseDistilledResponse(raw, 'skill').body).toBe('body')
  })

  it('tolerates CRLF line endings', () => {
    const raw = 'Scope: project\r\nDescription: desc\r\n---\r\nbody'
    expect(parseDistilledResponse(raw, 'skill')).toMatchObject({ scope: 'project', body: 'body' })
  })

  it('rejects an unknown scope', () => {
    const raw = 'Scope: somewhere\nDescription: desc\n---\nbody'
    expect(() => parseDistilledResponse(raw, 'skill')).toThrow(DistillParseError)
  })

  it('rejects a skill response missing its description line', () => {
    const raw = 'Scope: project\n---\nbody'
    expect(() => parseDistilledResponse(raw, 'skill')).toThrow(DistillParseError)
  })

  it('rejects an empty skill description', () => {
    const raw = 'Scope: project\nDescription: \n---\nbody'
    expect(() => parseDistilledResponse(raw, 'skill')).toThrow(DistillParseError)
  })

  it('rejects a response missing the separator', () => {
    const raw = 'Scope: project\nDescription: desc\nbody without separator'
    expect(() => parseDistilledResponse(raw, 'skill')).toThrow(DistillParseError)
  })

  it('rejects an empty body', () => {
    const raw = 'Scope: project\nDescription: desc\n---\n'
    expect(() => parseDistilledResponse(raw, 'skill')).toThrow(DistillParseError)
  })
})

describe('assertSkillName', () => {
  it('accepts lowercase kebab-case', () => {
    expect(() => { assertSkillName('my-skill') }).not.toThrow()
    expect(() => { assertSkillName('a0-b1-c2') }).not.toThrow()
  })

  it('rejects invalid names', () => {
    expect(() => { assertSkillName('MySkill') }).toThrow(DistillParseError)
    expect(() => { assertSkillName('my_skill') }).toThrow(DistillParseError)
    expect(() => { assertSkillName('-leading') }).toThrow(DistillParseError)
    expect(() => { assertSkillName('trailing-') }).toThrow(DistillParseError)
  })
})

describe('slugify', () => {
  it('kebab-cases a title', () => {
    expect(slugify('Coding Preferences')).toBe('coding-preferences')
    expect(slugify('  My   Notes!  ')).toBe('my-notes')
  })

  it('falls back to a timestamp-shaped slug for a non-alphanumeric title', () => {
    expect(slugify('!!!')).toMatch(/^memory-\d+$/)
  })
})
