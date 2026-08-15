# Agent Note: Workspace git review panel over Typert Remote

Status: implemented

English | [中文](2026-08-14-workspace-git-review-panel.zh.md)

## Problem

The Web GUI had no way to review the working tree's uncommitted changes and revert them. A `write`/`edit` call shows only its own diff card inline, and `session.rewind` rolls a whole turn back to a git checkpoint — neither is a "show me every changed file, let me read each diff, and revert one or all of them" surface.

## Decision

Two additive packages provide that surface, reusing the agents-catalog Typert-Remote-plus-client-panel pattern:

- `@deepseek-ai/dsh-git-workspace` (host, `packages/host/git-workspace`) — a `TypertRemoteService` registering `ctx.gitWorkspace` and the `gitWorkspace` Remote namespace. `changedFiles` runs `git status --porcelain` and classifies each path `added` / `modified` / `deleted` / `untracked` (renames fold to `modified` under the destination path). `fileDiff` returns one path's HEAD content versus its working-tree content (`oldText: null` for a new/untracked file, `newText: ''` for a deletion). `revert` resets tracked paths with `git restore --source=HEAD --staged --worktree` and removes untracked paths with `git clean -fd`; an empty path list reverts everything, and only paths the current status reports are ever touched.
- `@deepseek-ai/dsh-client-ui-git-workspace` (client, `packages/client/ui-git-workspace`) — a `sidebar.footer.action` trigger opening a master-detail modal: the changed files on the left (status dot + label per kind), the selected file's side-by-side `DiffBlock` diff on the right, and per-file plus all-files revert (all-files asks for inline confirmation). A clean workspace, a non-git directory, and an empty session each degrade to a distinct message.

The `gitWorkspace` namespace mounts through the `@deepseek-ai/dsh-api-remotes` client assembly, exactly like `agentsCatalog`, so no shipped contract layer changes.

## Alternatives considered

### Why not extend `session.rewind`?

Rewind is turn-granularity and conversation-oriented: it forks a child from before a user message and reverts the whole tree to a checkpoint branch. A per-file review-and-revert surface needs the current working tree, not a historical turn boundary.

### Why not a model-facing git tool?

The ask is a user-visible review surface, not a model capability. A tool would also route its git calls through the model's sandbox policy, while a user-initiated host action should operate on the real workspace the way the apiproxy checkpoint helpers already do.

### Why Typert Remote + client panel?

It is the established route for host data to reach the browser without widening the apiproxy barrel: the generator derives the client namespace and codecs from `@Remote` methods, and the client panel consumes it the same way the skills + memory panel consumes `agentsCatalog`.

### Why `git restore` + `git clean`, not the apiproxy `workspace-git` helpers?

`workspace-git.ts` is apiproxy-internal and built for checkpoint snapshots and whole-tree rewind; per-file revert needs different plumbing, and the plugin-only rule keeps the new code in a leaf package.

## Consequences

- **Revert is destructive by design.** It is a user-initiated host action outside the model sandbox; the all-files button asks for inline confirmation before running.
- **Renames read as added.** `git status --porcelain` reports `R  old -> new`; the panel shows the destination path with no old side, so the diff renders as a new file.
- **Staged and unstaged changes are merged.** A revert discards the index change together with the worktree change.
- **No size or binary handling.** A binary file's diff is decoded as text, and a very large file's content is sent whole.
- **Line numbers are per-hunk.** The diff reuses `DiffBlock`'s side-by-side/inline toggle, whose numbers are per-hunk rather than absolute file lines.

## Testing

Host: `git-workspace.spec.ts` drives the plumbing against real temporary git repositories (status classification, staged add, rename, before/after content, revert, revert-all, unknown-path no-op) and the Remote service over a booted `Context` + `SessionStore` (non-git degrade, no-cwd fallback). Client: jsdom component specs cover the trigger, every status badge, the diff view, per-file and all-files revert, the error and rejection paths, and the close/no-session/clean/non-git states; a browser-plugin spec pins the slot registration, disposal, and inject resolution. Per-file coverage is 100%; `pnpm run test:gui` and the full build are green.
