# 技能与记忆目录

[English](agents-catalog.md) | 中文

[agents-catalog](../../packages/host/agents-catalog) 服务（`ctx.agentsCatalog`）是 Web GUI 侧栏面板渲染的只读「技能 + 记忆」目录。它列出项目的最终技能摘要与 `.agents/memory` 笔记，并按需加载一条条目的完整内容。

技能查找通过当前 agent 的作用域读取宿主技能注册表，与 apiproxy 的 `skill.list` 处理器完全一致：当前 agent 的预置作用域 `skills` 服务优先于宿主注册表，因此即使某个组合在 realm 内挂载了自己的注册表，也仍能返回正确的目录。记忆发现读取项目 `.agents/memory/` 与用户 `~/.agents/memory/` 下由 `@deepseek-ai/dsh-memory` 注入的 Markdown 笔记，按展示路径排序。该服务从不创建或恢复 agent。其线上类型（`AgentsCatalogList`、`CatalogEntry`、`CatalogRef`）位于 `packages/host/agents-catalog/src/types.ts`。

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
