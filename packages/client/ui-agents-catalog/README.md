# @deepseek-ai/dsh-client-ui-agents-catalog

English | [中文](README.zh.md)

Browser half of the skills + memory catalog: a sidebar-foot trigger and modal panel that lists the current project's skills and memory notes and shows one entry's full content on selection. Data arrives through the [`@deepseek-ai/dsh-agents-catalog`](../../host/agents-catalog/README.md) Remote namespace.

## Slot contract

The plugin mounts the `agentsCatalog` Remote namespace and registers one `sidebar.footer.action` entry (id `agents-catalog`) into the slot declared by [`dsh-client-ui-sidebar`](../ui-sidebar/README.md). The trigger is a wide row ("Skills & memory") or a rail icon; selecting it opens a centered dialog.

The dialog lists two groups — Skills and Memory — each row showing the name, a secondary line (skill description or memory display path), and, for skills, an invocation badge (`model/user`/`model only`/`user only`). Selecting a row calls `agentsCatalog.read` and replaces the list with the entry's full content plus a back control. Close paths are the header button, a mask click, and Escape.

The panel reads the current session from the framework `useSessions` seat and addresses the Remote by that session id; with no current session it opens empty.

## Composition

The `dsh-web-app` bundle loads this plugin as a `dsh.client` row alongside the host `agents-catalog` row it consumes. The node half is an empty `apply`; the browser half ships via `exports["./client"]`.

## Known Limitations and Deferred Work

- **No live refresh** — the catalog snapshots on open; edits mid-session appear only after reopening.
- **Single active request** — opening an entry aborts an in-flight list, and there is no retry surface beyond closing and reopening the panel.
- **No search or filtering** — the list is grouped and ordered but not filterable.
