# @deepseek-ai/dsh-client-ui-git-workspace

English | [中文](README.zh.md)

Browser half of the workspace-changes review: a sidebar-foot trigger and master-detail modal that lists the working tree's changed files and shows the selected file's side-by-side diff (the shared [`DiffBlock`](../ui-primitives/README.md) primitive), with per-file and all-files revert. Data arrives through the [`@deepseek-ai/dsh-git-workspace`](../../host/git-workspace/README.md) Remote namespace.

## Slot contract

The `gitWorkspace` Remote namespace mounts through the [`@deepseek-ai/dsh-api-remotes`](../../api/remotes/README.md) client assembly; this plugin declares that namespace in `inject` and registers one `sidebar.footer.action` entry (id `git-workspace`) into the slot declared by [`dsh-client-ui-sidebar`](../ui-sidebar/README.md). The trigger is a wide row ("Changes") or a rail icon; selecting it opens a centered dialog.

The dialog lists the changed files on the left — each row a status dot and label (`added` / `modified` / `deleted` / `untracked`) plus a hover reveal per-file revert — and the selected file's diff on the right. A header summary counts the files, and "Revert all" asks for inline confirmation before reverting. A clean workspace, a non-git directory, and an empty session each degrade to a distinct message. Close paths are the header button, a mask click, and Escape.

The panel reads the current session from the framework `useSessions` seat and addresses the Remote by that session id; with no current session it opens empty.

## Composition

The `dsh-web-app` bundle loads this plugin as a `dsh.client` row alongside the host `git-workspace` row it consumes. The node half is an empty `apply`; the browser half ships via `exports["./client"]`.

## Known Limitations and Deferred Work

- **No live refresh** — the panel snapshots on open and after each revert; an external edit appears only after reopening.
- **Single active request** — opening a file or reverting aborts an in-flight request, and there is no retry surface beyond closing and reopening the panel.
- **No per-file diff context** — the diff view reuses `DiffBlock`'s side-by-side/inline toggle and line numbers, but line numbers are per-hunk, not absolute file lines.
