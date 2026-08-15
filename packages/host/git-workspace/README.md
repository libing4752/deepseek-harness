# @deepseek-ai/dsh-git-workspace

English | [中文](README.zh.md)

Workspace git review exposed to the Web GUI over Typert Remote. The [`dsh-client-ui-git-workspace`](../../client/ui-git-workspace/README.md) browser plugin renders it as the sidebar-foot "Workspace changes" panel. It enumerates working-tree changes relative to HEAD, reads one file's before/after content, and reverts paths to HEAD. The two read methods never mutate the repository; `revert` is the single write and only touches paths the current git status reports.

## Service contract

The service registers as `ctx.gitWorkspace` (`@deepseek-ai/dsh-git-workspace` default export) and binds the `gitWorkspace` Remote namespace.

`changedFiles(agent, signal)` returns `{ git, files }`. `git` is `false` when the session cwd is not inside a git work tree; otherwise `files` lists every `git status --porcelain` entry classified as `added` / `modified` / `deleted` / `untracked`, sorted by path.

`fileDiff(agent, path, signal)` returns `{ path, status, oldText, newText }` for one changed path — `oldText` is the HEAD content (`null` for a new/untracked file) and `newText` is the working-tree content (`''` for a deleted file). It returns `undefined` when the path is not currently changed.

`revert(agent, paths, signal)` reverts the given paths to HEAD and returns `{ reverted }`. Tracked paths reset their index and worktree with `git restore --source=HEAD --staged --worktree`; untracked paths are removed with `git clean -fd`. An empty `paths` reverts every changed path.

## Composition

The `dsh-web-app` bundle mounts this service (host plane) and the browser panel (`dsh.client`). It shells out to git over the session cwd; nothing it reads is model-visible.

## Known Limitations and Deferred Work

- **Renames read as added** — a `git status` rename (`R  old -> new`) is reported under the destination path with no old side, so its diff renders as a new file.
- **Staged and unstaged changes are merged** — the porcelain status treats both alike, so a revert discards the index change too.
- **No size or binary handling** — a binary file's diff is decoded as text, and a very large file's whole content is sent uncapped.
