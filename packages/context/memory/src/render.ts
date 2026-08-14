/**
 * Model-facing memory rendering within a byte budget.
 * @module @deepseek-ai/dsh-memory/render
 */

import type { MemoryFile } from './files.ts'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'
const INTRO = 'The following persistent memories may be relevant to your work. '
  + 'Use them as guidance when applicable. They do not override system, developer, or direct user instructions.'

/** Escape a closing frame so memory content cannot end the `<system-reminder>` early. */
function escapeFrame(body: string): string {
  return body.replaceAll(SYSTEM_REMINDER_CLOSE, '<\\/system-reminder>')
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function sectionText(file: MemoryFile): string {
  return `Memory from: ${file.displayPath}\n\n${file.content}`
}

function buildText(files: readonly MemoryFile[]): string {
  return [SYSTEM_REMINDER_OPEN, escapeFrame([INTRO, ...files.map(sectionText)].join('\n\n')), SYSTEM_REMINDER_CLOSE].join('\n')
}

/**
 * Render memory notes as one `<system-reminder>` block, dropping the earliest
 * notes until the result fits the byte budget. A single oversized note is
 * rendered anyway — one durable memory outranks an exact budget.
 * @param files - loaded notes in display order.
 * @param maxBytes - maximum UTF-8 bytes of the rendered block.
 * @returns the rendered text and the notes actually represented.
 */
export function renderMemoryContext(
  files: readonly MemoryFile[],
  maxBytes: number,
): { text: string; included: MemoryFile[] } {
  if (files.length === 0) return { text: '', included: [] }
  const full = buildText(files)
  if (byteLength(full) <= maxBytes) return { text: full, included: [...files] }
  for (let start = 1; start < files.length; start += 1) {
    const included = files.slice(start)
    const text = buildText(included)
    if (byteLength(text) <= maxBytes) return { text, included }
  }
  // `files` is non-empty here: the empty case returned above.
  const last = files[files.length - 1]
  if (last === undefined) return { text: '', included: [] }
  return { text: buildText([last]), included: [last] }
}
