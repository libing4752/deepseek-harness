# @deepseek-ai/dsh-agents-catalog

English | [中文](README.zh.md)

Read-only skills + memory catalog exposed to the Web GUI over Typert Remote. The [`dsh-client-ui-agents-catalog`](../../client/ui-agents-catalog/README.md) browser plugin renders it as the sidebar-foot "Skills & memory" panel. Skill lookup reads the host skill registry (preset layers resolve through the live agent) and never creates or resumes an agent; memory discovery reads the same durable `.agents/memory` notes that `@deepseek-ai/dsh-memory` injects.

## Service contract

The service registers as `ctx.agentsCatalog` (`@deepseek-ai/dsh-agents-catalog` default export) and binds the `agentsCatalog` Remote namespace.

`list(agent, signal)` returns `{ skills, memory }`. Skills are the registry's winning summaries for the agent's session cwd and scope, projected to `name`/`description`/`whenToUse`/`modelInvocable`/`userInvocable`/`source`/`provider`; the list includes every skill, not only user-invocable ones. Memory entries are the Markdown notes under the project `.agents/memory/` and the user `~/.agents/memory/`, sorted by display path.

`read(agent, ref, signal)` loads one entry's full content for `ref = { kind: 'skill', id }` (a skill name) or `ref = { kind: 'memory', id }` (a memory display path), and returns `undefined` when the entry no longer exists.

The skill registry is resolved the same way the apiproxy `skill.list` handler does: the live agent's preset-scoped `skills` service wins over the host registry, so a composition that realm-mounts its own registry still serves the correct catalog.

## Composition

The `dsh-web-app` bundle mounts this service (host plane) and the browser panel (`dsh.client`). It depends on `ctx.skills` and `ctx.agentPresets` for skill resolution and reads memory files directly; neither is model-visible.

## Known Limitations and Deferred Work

- **Memory discovery duplicates `@deepseek-ai/dsh-memory`'s file walk** — that package exposes no list/read service and its loader is not a public export, so the catalog re-reads the same files rather than sharing one loader.
- **No live refresh** — the panel snapshots the catalog when it opens; a skill or memory note written mid-session is not pushed until the panel reopens.
- **Skill bodies load on demand** — `list` returns summaries only; the panel issues one `read` per opened entry.
