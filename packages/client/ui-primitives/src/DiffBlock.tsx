// DiffBlock: the file-mutation diff surface for a write/edit — a copy control
// and a side-by-side ↔ inline toggle over one or more per-file hunks. Each hunk
// opens with a bold path header (a `⋯` gap repeats a same-file second hunk); the
// body draws the change either side-by-side (VS Code-style: a left pane and a
// right pane with per-side line numbers and changed-line tinting) or inline (a
// unified ` ` / `-` / `+` view with line numbers), and a dim `└ +A -R · N file(s)`
// footer closes the card. Both views share ONE line-aligned diff computed with
// the `diff` package's `diffLines`, so unchanged context stays aligned and only
// genuinely removed/added lines count in the footer (the pre-alignment render
// counted context lines as changed). Syntax highlighting reuses CodeBlock's
// shiki path (highlight.ts) at per-line granularity when the file extension maps
// to a known grammar; a side past the highlight budget renders plain so a large
// create/overwrite diff cannot jank the synchronous tokenizer. Output never
// soft-wraps — an aligned source line keeps its indentation and scrolls
// horizontally. Colors resolve through --dsw-*/--shiki-* tokens; geometry
// mirrors CodeBlock.

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { diffLines } from 'diff'
import { writeClipboard } from './clipboard.ts'
import {
  grammarLoadCount,
  highlightLines,
  subscribeGrammarLoaded,
  type HighlightSpan,
} from './markdown/highlight.ts'
import css from './DiffBlock.module.css'

/**
 * Output lines shown before the height cap collapses the middle. Matches
 * {@link DEFAULT_TERMINAL_MAX_LINES} so a diff card and a terminal card cut a
 * long body at the same place.
 */
export const DEFAULT_DIFF_MAX_LINES = 16

/**
 * Max chars on one diff side that still get syntax highlighting. A side at or
 * above this bound renders plain: a create/overwrite diff carries the whole
 * file as one hunk, and tokenizing an unbounded file synchronously would jank
 * the row. This is a robustness bound, not a deployment choice — same posture
 * as the read tool's fixed byte/line caps.
 */
const HIGHLIGHT_MAX_CHARS = 64 * 1024

/**
 * One file's change, in the shape {@link DiffBlock} draws. Structurally the
 * render-intent contract's `FileDiff`, redeclared here so this primitive stays
 * free of the tool contract (the terminal card's decoupling, applied to diffs).
 */
export interface DiffHunk {
  /** The changed file's path, drawn verbatim as the hunk's header (the tool's model-facing path). */
  path: string
  /** Prior content, or `null` for a new file / an overwrite (nothing on the removed side). */
  oldText: string | null
  /** Content after the change (the added side). */
  newText: string
}

export interface DiffBlockProps {
  /** One entry per applied hunk, in file order; empty renders nothing. */
  diffs: DiffHunk[]
  /** Height cap in body rows before the middle collapses (default {@link DEFAULT_DIFF_MAX_LINES}). */
  maxLines?: number | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
}

/** Lowercased file-extension to syntax-highlighting language hint (mirrors the read tool's `langFromPath` map). */
const LANG_BY_EXTENSION = new Map<string, string>([
  ['ts', 'ts'], ['tsx', 'tsx'], ['mts', 'ts'], ['cts', 'ts'],
  ['js', 'js'], ['jsx', 'jsx'], ['mjs', 'js'], ['cjs', 'js'],
  ['json', 'json'], ['jsonc', 'json'],
  ['py', 'py'], ['rb', 'rb'], ['go', 'go'], ['rs', 'rs'], ['java', 'java'],
  ['c', 'c'], ['h', 'c'], ['cc', 'cpp'], ['cpp', 'cpp'], ['hpp', 'cpp'], ['cxx', 'cpp'],
  ['cs', 'cs'], ['kt', 'kotlin'], ['swift', 'swift'], ['php', 'php'],
  ['sh', 'sh'], ['bash', 'sh'], ['zsh', 'sh'],
  ['yaml', 'yaml'], ['yml', 'yaml'], ['toml', 'toml'], ['ini', 'ini'],
  ['md', 'md'], ['markdown', 'md'], ['mdx', 'mdx'],
  ['html', 'html'], ['htm', 'html'], ['css', 'css'], ['scss', 'scss'], ['less', 'less'],
  ['sql', 'sql'], ['xml', 'xml'], ['lua', 'lua'],
])

/**
 * Derive a syntax-highlighting language hint from a changed file's extension.
 * Pure and case-insensitive on the extension; a dotfile with no extension
 * (`.gitignore`) and an unknown extension both yield `undefined`. A `Map` (not
 * an object) keeps a filename whose extension is an Object.prototype key
 * (`foo.constructor`) from resolving to an inherited member.
 * @param path - the model-facing path the hunk reports.
 * @returns the language hint for {@link LANG_BY_EXTENSION}, or `undefined` when the extension maps to none.
 */
export function langFromPath(path: string): string | undefined {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  // A leading dot is a dotfile (no extension), not an empty extension.
  if (dot <= 0) return undefined
  return LANG_BY_EXTENSION.get(base.slice(dot + 1).toLowerCase())
}

/** A side-by-side cell: a side's line number, text, and optional highlighted runs. */
interface Cell {
  number: number
  text: string
  spans: HighlightSpan[] | undefined
}

/** The change a body row belongs to: context, removed, added, or a paired modification. */
type ChangeKind = 'ctx' | 'del' | 'add' | 'mod'

/** A side-by-side body row: a left and right cell plus the change they express. */
interface SplitRow {
  kind: 'split'
  change: ChangeKind
  left: Cell | null
  right: Cell | null
}

/** An inline (unified) body row: a prefix, one line number, its text, and optional runs. */
interface InlineRow {
  kind: 'inline'
  change: 'ctx' | 'del' | 'add'
  prefix: ' ' | '-' | '+'
  number: number
  text: string
  spans: HighlightSpan[] | undefined
}

/** A chrome row: a file header or a same-file second-hunk separator. */
type ChromeRow = { kind: 'path'; text: string } | { kind: 'gap' }

/** The flat rows for the side-by-side view (chrome + split body rows). */
type SplitFlatRow = ChromeRow | SplitRow
/** The flat rows for the inline view (chrome + inline body rows). */
type InlineFlatRow = ChromeRow | InlineRow

/** A normalized diff operation: aligned left/right line arrays for one change. */
interface NormalizedOp {
  kind: ChangeKind
  left: string[]
  right: string[]
}

/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side draws nothing), and a
 * single trailing newline is a line terminator rather than an extra empty line —
 * the same terminator rule TerminalBlock applies to command output. An interior
 * blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * Normalize {@link diffLines} chunks into aligned operations, pairing a removed
 * chunk immediately followed by an added chunk into one `mod` operation (the
 * side-by-side replacement the two lines express). A lone removed/added chunk
 * stays `del`/`add`; an unchanged chunk is `ctx` with identical left and right.
 * @param chunks - the line diff of one hunk's old/new text.
 * @returns the normalized operations in order.
 */
function normalizeOps(chunks: ReturnType<typeof diffLines>): NormalizedOp[] {
  const ops: NormalizedOp[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const lines = contentLines(chunk.value)
    if (chunk.removed && chunks[i + 1]?.added) {
      ops.push({ kind: 'mod', left: lines, right: contentLines(chunks[i + 1].value) })
      i += 1
    } else if (chunk.removed) {
      ops.push({ kind: 'del', left: lines, right: [] })
    } else if (chunk.added) {
      ops.push({ kind: 'add', left: [], right: lines })
    } else {
      ops.push({ kind: 'ctx', left: lines, right: lines })
    }
  }
  return ops
}

/**
 * Build side-by-side rows from normalized operations, tracking each side's
 * per-hunk 1-based line number and highlighted-run index. A `mod` op pairs its
 * left and right lines positionally (padding the shorter side with empty
 * cells); `ctx` pairs equal lines; `del`/`add` leave the other side empty.
 * @param ops - the hunk's normalized operations.
 * @param oldSpans - per-line highlighted runs of the old side, or undefined for plain.
 * @param newSpans - per-line highlighted runs of the new side, or undefined for plain.
 * @returns the rows and the genuine added/removed counts (context excluded).
 */
function buildSplitRows(
  ops: NormalizedOp[],
  oldSpans: HighlightSpan[][] | undefined,
  newSpans: HighlightSpan[][] | undefined,
): { rows: SplitRow[]; added: number; removed: number } {
  let oldIndex = 0
  let newIndex = 0
  let oldNum = 1
  let newNum = 1
  let added = 0
  let removed = 0
  const rows: SplitRow[] = []
  for (const op of ops) {
    const height = Math.max(op.left.length, op.right.length)
    for (let k = 0; k < height; k++) {
      const leftText = op.left[k]
      const rightText = op.right[k]
      const left = leftText === undefined ? null : { number: oldNum++, text: leftText, spans: oldSpans?.[oldIndex++] }
      const right = rightText === undefined ? null : { number: newNum++, text: rightText, spans: newSpans?.[newIndex++] }
      rows.push({ kind: 'split', change: op.kind, left, right })
      if (op.kind === 'del' || op.kind === 'mod') { if (leftText !== undefined) removed++ }
      if (op.kind === 'add' || op.kind === 'mod') { if (rightText !== undefined) added++ }
    }
  }
  return { rows, added, removed }
}

/**
 * Build inline (unified) rows from normalized operations: `ctx` as one ` `
 * line, then a `mod`/`del` op's removed lines as `-`, then its added lines as
 * `+`, in chunk order. Line numbers track the old side for `-`/context and the
 * new side for `+`.
 * @param ops - the hunk's normalized operations.
 * @param oldSpans - per-line highlighted runs of the old side, or undefined for plain.
 * @param newSpans - per-line highlighted runs of the new side, or undefined for plain.
 * @returns the unified rows.
 */
function buildInlineRows(
  ops: NormalizedOp[],
  oldSpans: HighlightSpan[][] | undefined,
  newSpans: HighlightSpan[][] | undefined,
): InlineRow[] {
  let oldIndex = 0
  let newIndex = 0
  let oldNum = 1
  let newNum = 1
  const rows: InlineRow[] = []
  for (const op of ops) {
    if (op.kind === 'ctx') {
      for (const text of op.left) {
        rows.push({ kind: 'inline', change: 'ctx', prefix: ' ', number: oldNum++, text, spans: oldSpans?.[oldIndex++] })
        newNum++
        newIndex++
      }
    } else {
      for (const text of op.left) {
        rows.push({ kind: 'inline', change: 'del', prefix: '-', number: oldNum++, text, spans: oldSpans?.[oldIndex++] })
      }
      for (const text of op.right) {
        rows.push({ kind: 'inline', change: 'add', prefix: '+', number: newNum++, text, spans: newSpans?.[newIndex++] })
      }
    }
  }
  return rows
}

/** The built body rows and footer counts for both views. */
interface DiffModel {
  split: SplitFlatRow[]
  inline: InlineFlatRow[]
  added: number
  removed: number
  files: number
}

/**
 * Build the diff model: per hunk, a path/gap chrome row, the hunk's highlighted
 * sides (plain past {@link HIGHLIGHT_MAX_CHARS} or for an empty side), and the
 * aligned side-by-side and inline rows. Footer counts accumulate the genuine
 * added/removed lines across hunks; the file count is distinct paths.
 * @param diffs - the hunks to render.
 * @returns the two flat row arrays plus the footer counts.
 */
function buildModel(diffs: DiffHunk[]): DiffModel {
  const split: SplitFlatRow[] = []
  const inline: InlineFlatRow[] = []
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  let prevPath: string | undefined
  for (const diff of diffs) {
    paths.add(diff.path)
    const chrome: ChromeRow = diff.path !== prevPath ? { kind: 'path', text: diff.path } : { kind: 'gap' }
    prevPath = diff.path
    split.push(chrome)
    inline.push(chrome)

    const lang = langFromPath(diff.path)
    const oldText = diff.oldText ?? ''
    const newText = diff.newText
    const oldLines = contentLines(oldText)
    const newLines = contentLines(newText)
    const oldSpans = oldLines.length === 0 || oldText.length > HIGHLIGHT_MAX_CHARS ? undefined : highlightLines(oldText, lang)
    const newSpans = newLines.length === 0 || newText.length > HIGHLIGHT_MAX_CHARS ? undefined : highlightLines(newText, lang)

    const ops = normalizeOps(diffLines(oldText, newText))
    const splitResult = buildSplitRows(ops, oldSpans, newSpans)
    added += splitResult.added
    removed += splitResult.removed
    for (const row of splitResult.rows) split.push(row)
    for (const row of buildInlineRows(ops, oldSpans, newSpans)) inline.push(row)
  }
  return { split, inline, added, removed, files: paths.size }
}

/**
 * The diff text a reader copies: each inline row's ` ` / `-` / `+` prefix and
 * its content, with the path headers keeping a multi-file copy attributable.
 * The inline view is the canonical unified-diff text for both views.
 * @param rows - the flat inline rows.
 * @returns the diff as plain text.
 */
function copyText(rows: InlineFlatRow[]): string {
  return rows.map((row) => {
    switch (row.kind) {
      case 'path': return row.text
      case 'gap': return '⋯'
      case 'inline': return row.change === 'ctx' ? ` ${row.text}` : `${row.prefix} ${row.text}`
      /* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
      default: return assertNever(row)
    }
  }).join('\n')
}

/**
 * Render one line's highlighted runs as styled spans (the css-variables theme
 * colors every run), so a highlighted line reads through shiki's token colors.
 * @param spans - the line's styled runs.
 * @returns the line's children.
 */
function renderSpans(spans: readonly HighlightSpan[]) {
  return spans.map((span, index) => <span key={index} style={span.style}>{span.text}</span>)
}

/** The cell body: highlighted runs, or the plain text for an unknown language. */
function cellBody(cell: Cell) {
  return cell.spans === undefined ? cell.text : renderSpans(cell.spans)
}

/** A side-by-side row as a four-column table row (left gutter, left, right gutter, right). */
function SplitRowView({ row }: { row: SplitFlatRow }) {
  if (row.kind === 'path') return <tr><td colSpan={4} className={css.path}>{row.text}</td></tr>
  if (row.kind === 'gap') return <tr><td colSpan={4} className={css.gap}>⋯</td></tr>
  const leftChanged = row.change === 'del' || row.change === 'mod'
  const rightChanged = row.change === 'add' || row.change === 'mod'
  return (
    <tr className={css.splitRow} data-role={row.change}>
      <td className={clsx(css.gutter, leftChanged && css.removed)} data-gutter="left" aria-hidden>{row.left?.number ?? ''}</td>
      <td className={clsx(css.cell, leftChanged && css.removed)} data-side="left">{row.left === null ? '' : cellBody(row.left)}</td>
      <td className={clsx(css.gutter, rightChanged && css.added)} data-gutter="right" aria-hidden>{row.right?.number ?? ''}</td>
      <td className={clsx(css.cell, rightChanged && css.added)} data-side="right">{row.right === null ? '' : cellBody(row.right)}</td>
    </tr>
  )
}

/** An inline (unified) row as a flex line: prefix, line number, content. */
function InlineRowView({ row }: { row: InlineFlatRow }) {
  if (row.kind === 'path') return <div className={css.path}>{row.text}</div>
  if (row.kind === 'gap') return <div className={css.gap}>⋯</div>
  const changed = row.change === 'del' ? css.removed : row.change === 'add' ? css.added : undefined
  return (
    <div className={clsx(css.inlineRow, changed)} data-role={row.change}>
      <span className={css.prefix} aria-hidden>{row.prefix}</span>
      <span className={css.gutter} aria-hidden>{row.number}</span>
      <span className={css.content}>{row.spans === undefined ? row.text : renderSpans(row.spans)}</span>
    </div>
  )
}

/** The expand/collapse control a capped body shows between its head and tail. */
function ExpandControl({ hidden, expanded, onToggle }: { hidden: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={css.expand}
      aria-expanded={expanded}
      aria-label={expanded ? '收起差异' : `展开其余 ${hidden} 行差异`}
      onClick={onToggle}
    >
      {expanded ? '收起' : `… 其余 ${hidden} 行`}
    </button>
  )
}

/**
 * Render a file mutation as an inline diff surface with a side-by-side ↔ inline
 * toggle, syntax-highlighted code lines, copy, and a height-capped body.
 * @param props - see {@link DiffBlockProps}.
 * @returns the diff block element.
 */
export function DiffBlock({ diffs, maxLines = DEFAULT_DIFF_MAX_LINES, className }: DiffBlockProps) {
  // Re-render when a lazy grammar finishes loading, so a diff that showed plain
  // text while its language's grammar imported picks up highlighting.
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const model = useMemo(() => buildModel(diffs), [diffs, loaded])
  const [mode, setMode] = useState<'split' | 'inline'>('split')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const rows = mode === 'split' ? model.split : model.inline

  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(copyText(model.inline)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [copied, model.inline])

  const onToggle = useCallback(() => { setExpanded(value => !value) }, [])
  const onSplit = useCallback(() => { setMode('split') }, [])
  const onInline = useCallback(() => { setMode('inline') }, [])

  if (rows.length === 0) return null

  const hidden = rows.length - maxLines
  const capped = hidden > 0 && !expanded
  // Same split arithmetic as TerminalBlock and the TUI transcript's collapsed
  // card, so a body's head and tail slices agree across the front ends.
  const headLines = Math.ceil(maxLines / 2)
  const tailLines = maxLines - headLines
  const head = capped ? rows.slice(0, headLines) : rows
  const tail = capped ? rows.slice(rows.length - tailLines) : []

  const body = mode === 'split'
    ? (
      <table className={css.splitTable}>
        <tbody>
          {head.map((row, index) => <SplitRowView key={index} row={row} />)}
          {hidden > 0 && (
            <tr className={css.expandRow}>
              <td colSpan={4}><ExpandControl hidden={hidden} expanded={expanded} onToggle={onToggle} /></td>
            </tr>
          )}
          {tail.map((row, index) => <SplitRowView key={`tail-${index}`} row={row} />)}
        </tbody>
      </table>
    )
    : (
      <>
        {head.map((row, index) => <InlineRowView key={index} row={row} />)}
        {hidden > 0 && <ExpandControl hidden={hidden} expanded={expanded} onToggle={onToggle} />}
        {tail.map((row, index) => <InlineRowView key={`tail-${index}`} row={row} />)}
      </>
    )

  return (
    <div className={clsx(css.block, className)} data-diff="" data-mode={mode}>
      <div className={css.controls}>
        <div className={css.toggle} role="group" aria-label="对比方式">
          <button type="button" className={css.toggleButton} aria-pressed={mode === 'split'} onClick={onSplit}>并排</button>
          <button type="button" className={css.toggleButton} aria-pressed={mode === 'inline'} onClick={onInline}>行内</button>
        </div>
        <button type="button" className={css.copyButton} onClick={onCopy}>
          {copied ? '复制成功' : '复制'}
        </button>
      </div>
      <div className={css.body}>
        {body}
      </div>
      <div className={css.footer}>└ +{model.added} -{model.removed} · {model.files} file{model.files === 1 ? '' : 's'}</div>
    </div>
  )
}
