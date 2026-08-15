# Agent Note: A client plugin must not self-mount the Remote namespace it declares in inject

Status: implemented

English | [中文](2026-08-15-remote-namespace-self-mount-inject-deadlock.zh.md)

## Problem

The "Skills & memory" sidebar panel shipped with its browser plugin both mounting and consuming the `agentsCatalog` Remote namespace: `apply` awaited `ctx.remote.$mount(agentsCatalogRemote)`, while the footer action's inject closure read `ctx.remote.agentsCatalog`. Clicking the trigger did nothing. The first read threw `cannot get property "remote.agentsCatalog" without inject` — the traceable `remote` service routes `remote.<namespace>` through the ctx property proxy, whose get gate requires the full key in `inject`. Adding `remote.agentsCatalog` to `inject` fixed that read but deadlocked boot: the plugin fiber waits for a service that only its own `apply` provides, so it never activates (`pending (waiting for service: remote.agentsCatalog)`). The existing specs missed it because the component spec feeds the `list`/`read` verbs directly and the browser-plugin spec never invoked the footer action's inject closure.

## Decision

Mount the `/remote` contribution in the `@deepseek-ai/dsh-api-remotes` client assembly — the same home as the commands, goals, and message-feedback contributions — and let the consuming plugin only declare and read the namespace. `ui-agents-catalog` declares `inject = ['remote', 'remote.agentsCatalog', 'slots', 'locale']`, reads `ctx.remote.agentsCatalog`, and no longer calls `$mount`. This reverses the self-mount recorded in [the panel's feature note](../feature/2026-08-14-skills-memory-catalog-panel.md).

## Alternatives considered

- **`ctx.get('remote.agentsCatalog')` in the inject closure** — reads the mounted namespace without the inject gate and keeps the self-mount local. Rejected: it uses the optional-service escape hatch for a namespace the shared assembly already exists to mount, and loses the typed `ctx.remote.agentsCatalog` access every sibling plugin uses.
- **Keep the self-mount and drop the namespace from `inject`** — no deadlock, but `ctx.remote.agentsCatalog` still throws the proxy `without inject` error at first read, so the original bug persists.

## Consequences

- The `agentsCatalog` namespace now mounts for every client that includes `dsh-api-remotes`; its host service stays web-only in the `dsh-web-app` bundle, mirroring how the web-only `message-feedback` contribution is already handled.
- The browser-plugin spec now provides a real `remote` Service plus the `remote.agentsCatalog` namespace and calls the footer action's inject verbs, and asserts the exact `inject` array, so a dropped namespace key fails loudly.
- A live `dsh web` click-through confirms the modal opens and lists the project's skills and memory.
