/**
 * Strict parsing of the distillation response protocol.
 *
 * The model is asked to emit a two-line header and then a body, so the parser
 * never has to split free prose:
 *
 * ```text
 * Scope: <project|personal>
 * Description: <one line>   (skill only)
 * ---
 * <body markdown>
 * ```
 *
 * Code remains authoritative over the scope and the one-line summary; the model
 * only supplies prose. A malformed header fails loud so a broken artifact is
 * never written to disk.
 * @module @deepseek-ai/dsh-distill/parse
 */

import type { DistillKind, DistilledDocument, DistillScope } from './types.ts'

const SCOPE_PREFIX = 'Scope:'
const DESCRIPTION_PREFIX = 'Description:'
const SEPARATOR = '---'

/** Failure class for a distillation response that does not follow the protocol. */
export class DistillParseError extends Error {
  override readonly name = 'DistillParseError'
}

/** Read one required `Key: value` header line at the given index. */
function headerValue(lines: readonly string[], index: number, prefix: string, subject: string): string {
  const line = lines[index]
  if (line === undefined || !line.startsWith(prefix)) {
    throw new DistillParseError(`${subject} must start with "${prefix}" on line ${index + 1}`)
  }
  return line.slice(prefix.length).trim()
}

/** Accept only the two closed scope values. */
function parseScope(value: string): DistillScope {
  if (value === 'project' || value === 'personal') return value
  throw new DistillParseError(`unknown scope '${value}'; expected 'project' or 'personal'`)
}

/** Find the separator line and return the trimmed body that follows it. */
function parseBody(lines: readonly string[], headerLines: number, kind: DistillKind): string {
  const separatorIndex = lines.findIndex((line, index) => index >= headerLines && line === SEPARATOR)
  if (separatorIndex < 0) {
    throw new DistillParseError(`distill ${kind} response is missing its '${SEPARATOR}' line`)
  }
  return lines.slice(separatorIndex + 1).join('\n').trim()
}

/**
 * Parse a distillation response into its validated fields and body.
 * @param raw - complete model output.
 * @param kind - which artifact form the response describes.
 * @returns the parsed document.
 * @throws {@link DistillParseError} when the header is malformed.
 */
export function parseDistilledResponse(raw: string, kind: DistillKind): DistilledDocument {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  // Skip a leading blank run so a stray newline before the header is tolerated.
  let cursor = 0
  for (;;) {
    const line = lines[cursor]
    if (line === undefined || line.trim() !== '') break
    cursor += 1
  }
  const scope = parseScope(headerValue(lines, cursor, SCOPE_PREFIX, `distill ${kind} response`))
  cursor += 1
  const summary = kind === 'skill'
    ? headerValue(lines, cursor, DESCRIPTION_PREFIX, 'distill skill response')
    : ''
  const headerLines = kind === 'skill' ? cursor + 1 : cursor
  const body = parseBody(lines, headerLines, kind)
  if (kind === 'skill' && summary.length === 0) {
    throw new DistillParseError('distill skill response has an empty Description')
  }
  if (body.length === 0) {
    throw new DistillParseError(`distill ${kind} response has an empty body`)
  }
  return { scope, summary, body }
}

/**
 * Validate a kebab-case skill name before it becomes a directory or frontmatter value.
 * @param name - candidate skill name to validate.
 */
export function assertSkillName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new DistillParseError(`invalid skill name "${name}": expected lowercase kebab-case`)
  }
}

/**
 * Derive a filesystem-safe slug from a memory title, falling back to a timestamp.
 * @param title - memory title to slugify.
 * @returns a lowercase hyphenated slug, or a timestamp fallback.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : `memory-${Date.now()}`
}
