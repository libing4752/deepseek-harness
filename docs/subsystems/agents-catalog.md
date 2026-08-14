# Agents catalog

English | [中文](agents-catalog.zh.md)

The [agents-catalog](../../packages/host/agents-catalog) service (`ctx.agentsCatalog`) is the read-only skills + memory catalog the Web GUI sidebar panel renders. It lists a project's winning skill summaries and its `.agents/memory` notes, and loads one entry's full content on demand.

Skill lookup reads the host skill registry through the live agent's scope, exactly like the apiproxy `skill.list` handler: the live agent's preset-scoped `skills` service wins over the host registry, so a composition that realm-mounts its own registry still serves the correct catalog. Memory discovery reads the project `.agents/memory/` and the user `~/.agents/memory/` Markdown notes that `@deepseek-ai/dsh-memory` injects, sorted by display path. The service never creates or resumes an agent. Its wire types (`AgentsCatalogList`, `CatalogEntry`, `CatalogRef`) live in `packages/host/agents-catalog/src/types.ts`.

Source: [`packages/host/agents-catalog/src/index.ts`](../../packages/host/agents-catalog/src/index.ts).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentscatalog--agentscatalogruntime"></a>

### `ctx.agentsCatalog` — `AgentsCatalogRuntime`

Read-only catalog service. The skill registry view mirrors the apiproxy `skill.list` resolution: a preset realm may mount its own `skills` service, so the live agent's scoped instance wins over the host registry.

```ts cordis-catalog
/**
 * List the project's skill summaries and memory notes for one agent.
 * @param agent - exact agent whose session cwd and scope select the catalog.
 * @param signal - cancellation forwarded to skill discovery and memory reads.
 * @returns the complete catalog, with an empty skill list when no registry is mounted.
 */
@Remote async list(agent: Agent, signal: AbortSignal): Promise<AgentsCatalogList>

/**
 * Load one entry's full content.
 * @param agent - exact agent whose session cwd and scope select the catalog.
 * @param ref - which skill name or memory display path to load.
 * @param signal - cancellation forwarded to the load.
 * @returns the loaded entry, or `undefined` when it no longer exists.
 */
@Remote async read(agent: Agent, ref: CatalogRef, signal: AbortSignal): Promise<CatalogEntry | undefined>
```

Types: [Agent](core.md)

Source: [`packages/host/agents-catalog/src/index.ts:59`](../../packages/host/agents-catalog/src/index.ts)
<!-- END GENERATED cordis-surface -->
