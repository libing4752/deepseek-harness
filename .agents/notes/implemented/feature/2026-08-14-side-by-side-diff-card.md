# Agent Note: Side-by-side diff card for file mutations

Status: implemented

English | [中文](2026-08-14-side-by-side-diff-card.zh.md)

## Problem

The Web GUI's `DiffBlock` primitive (`@deepseek-ai/dsh-client-ui-primitives`) drew a `write`/`edit` change as a stacked list — every old-side line under `-`, then every new-side line under `+` — with no line alignment, no line numbers, and no syntax highlighting. Because the hunk's old/new text includes the three context lines the host emits, the footer counted those context lines as changed. There was no VS Code-style side-by-side comparison.

## Decision

`DiffBlock` now derives one line-aligned diff per hunk with the `diff` package's `diffLines`, and renders it in two views that share that single model:

- **Side-by-side (default)** — a `<table>` with columns `left gutter | left | right gutter | right`, so both panes align and scroll together. Changed cells carry a low-alpha error/success background tint and colored line numbers; unchanged context stays aligned. An edit whose removed and added runs are adjacent renders as one paired `mod` row.
- **Inline** — a unified ` ` / `-` / `+` view with per-line numbers, toggled from side-by-side by a `并排` / `行内` segmented control.

Syntax highlighting reuses CodeBlock's shiki path (`highlightLines`) per line when the file extension maps to a known grammar; a side past `HIGHLIGHT_MAX_CHARS` (64 KB) renders plain so a large create/overwrite diff cannot jank the synchronous tokenizer. `langFromPath` is a client-side mirror of the read tool's extension map. The footer now counts only genuine added/removed lines (context excluded), and the copy control writes the unified text regardless of the active view.

`diff` (`^9.0.0`) is added as a `ui-primitives` dependency — it was already in the tree as `tool-fs`'s dependency at the same major.

## Alternatives considered

### Why not adopt `@git-diff-view/react` + shiki?

It is purpose-built but heavy, its React wrapper shows deprecation/migration signs, and its theming must be mapped onto the `--dsw-*` token system. The `diff` package was already in the workspace, tiny, and isomorphic, so hand-rolling the two-pane layout on `diffLines` deletes more owned code than a third-party diff component adds.

### Why not CodeMirror `@codemirror/merge` or Monaco's DiffEditor?

Both are real editors sized for an editor surface, not an inline chat card; the bundle and integration cost outweighs the fidelity gain.

### Why not `diff2html` / `react-diff-viewer`?

`diff2html` emits HTML strings (injection risk, non-React), and `react-diff-viewer` is stale.

### Why a `<table>` for the side-by-side view?

Column alignment plus synchronized horizontal scroll is the property a diff needs; a per-row flex/grid layout cannot keep both panes aligned as one long line scrolls.

### Why leave the wire `FileDiff { path, oldText, newText }` contract unchanged?

The contextual-hunk contract already carries enough to re-align client-side. Adding a `lang` field or a full-file payload would widen a shipped core contract for a presentation-layer concern; the language is derived from the path instead.

## Consequences

- **Footer semantics changed.** Context lines are no longer counted as added/removed, so a hunk with context reports a smaller `+A -R` than the pre-alignment render.
- **Line numbers are per-hunk, not absolute.** A hunk carries no start line, so both panes number from 1 within the hunk.
- **`langFromPath` duplicates the read tool's extension map.** The two maps must stay in step; the read card receives its language hint from the host while the diff card derives it client-side.
- **The diff runs twice.** The host `structuredPatch` produces the hunk, and the client `diffLines` re-aligns it. Hunks are small except create/overwrite, whose highlighting the budget gates.
- **The height cap counts aligned rows.** Split and inline can hide a different number of rows for the same change (an uneven `mod` pads its shorter side in split, but inline lists its lines separately).

## Testing

`packages/client/ui-primitives/tests/diff-block.client.spec.tsx` (32 specs) covers alignment (context, removed, added, modified including uneven padding), the side-by-side/inline toggle, per-side line numbers, footer counts, the unified copy text, the head/tail cap in both views, syntax highlighting (known extension, unknown extension, and the 64 KB budget), and `langFromPath` edge cases. Per-file coverage is 100%; `pnpm run test:gui` and `DSH_SNAPSHOT=replay pnpm run test:web` are green.

## Related

- [Web diff card](2026-07-30-web-diff-card.md) — the original `DiffBlock` consumer decision this rendering upgrade supersedes; it still owns how the `diff` render intent reaches the browser and how `diffCardModel` derives the props.
- [Tagged render-intent union for tool-call presentation](../architecture/2026-07-02-tool-render-intent-union.md) — the `card`-tagged vocabulary the diff arm consumes.
