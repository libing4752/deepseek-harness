# Agent Note: Skills and memory catalog panel over Typert Remote

Status: implemented

English | [中文](2026-08-14-skills-memory-catalog-panel.zh.md)

## Problem

The Web GUI exposes skills and memory only as model-facing surfaces: the `skill` tool loads a skill body into a request, and `dsh-memory` injects `.agents/memory` notes before the first turn. A user had no read-only way to see what skills and memory notes the current project actually contains, or to read one entry's full content outside a conversation.

## Decision

A read-only "Skills & memory" panel lives in the sidebar foot. It is two additive packages wired into the `dsh-web-app` bundle:

- `@deepseek-ai/dsh-agents-catalog` (host, `packages/host/agents-catalog`) — a `TypertRemoteService` registering `ctx.agentsCatalog` and the `agentsCatalog` Remote namespace. `list(agent, signal)` returns skill summaries and memory note rows; `read(agent, ref, signal)` returns one entry's full content. Skill lookup resolves the registry exactly like the apiproxy `skill.list` handler (`presets.serviceFor(agent, 'skills') ?? ctx.get('skills')`, scope = the live agent), and memory discovery reads the project `.agents/memory/` plus the user `~/.agents/memory/` files.
- `@deepseek-ai/dsh-client-ui-agents-catalog` (client, `packages/client/ui-agents-catalog`) — declares the `agentsCatalog` Remote namespace in `inject` and registers one `sidebar.footer.action` entry that renders the trigger and modal.

The `agentsCatalog` Remote namespace mounts through the `@deepseek-ai/dsh-api-remotes` client assembly. This reverses an earlier self-mount in the plugin's own `apply`, which deadlocked boot — see [the fix note](../bug-fix/2026-08-15-remote-namespace-self-mount-inject-deadlock.md).

## Alternatives considered

### Why not add `skill.read` and a `memory.*` domain to apiproxy?

The apiproxy `ApiProxy` is the shared wire-contract barrel, and adding a domain there edits a shipped package that every client shape consumes. A Typert Remote service is the plugin-owned route to the same wire: the generator derives the client namespace and codecs from `@Remote` methods, so a leaf package exposes new read surface without touching the contract layer.

### Why not add a memory listing service to `@deepseek-ai/dsh-memory`?

`dsh-memory` owns only pre-step injection and exposes no list/read service. Adding one there widens a shipped package's contract for a UI consumer. The catalog instead re-reads the same files with its own small loader; the duplication is ~100 lines of stable file discovery.

### Why not render the panel inside the existing Settings shell?

Settings owns user preferences and its own nav/section machinery. The catalog is project content, not a preference, and a self-contained footer action plus modal keeps it independent of the settings section ledger.

## Consequences

- **Memory discovery duplicates `dsh-memory`'s file walk.** The two loaders share the same scope and sort rules but no code; a future `dsh-memory` list/read service would be the consolidation point.
- **The panel snapshots on open.** A skill or memory note written mid-session is not pushed; the panel re-reads on reopen.
- **Skill bodies load on demand.** `list` returns summaries only, so the panel issues one `read` per opened entry rather than shipping every body up front.
- **The Typert Remote pattern is demonstrated for a UI-owned host service.** A leaf host package exposes new read surface; its `/remote` contribution mounts through the shared `api/remotes` assembly and the client plugin declares and reads the namespace.

## Testing

Host: unit specs for `list`/`read` and a real Loader composition booting session + skill + catalog. Client: jsdom component specs for the trigger/list/detail flow and a browser-plugin spec asserting the footer-action registration folds up on fiber disposal.
