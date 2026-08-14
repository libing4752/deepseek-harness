# 提炼

[English](distill.md) | 中文

[distill](../../packages/distill/distill) 服务（`ctx.distill`，`DistillEngine`）把一段对话转化为可复用的 skill 或 memory 资产。它通过一次辅助 `ctx.llm.stream()` 调用重放会话当前的派生历史，要求模型给出作用域分类与正文，然后把资产写入项目 `.agents/`（项目作用域）或用户 agents home（个人作用域）。skill 变成 `SKILL.md` 文件，由文件系统 skill 提供者发现；memory 笔记变成 Markdown 文件，由 `@deepseek-ai/dsh-memory` 在后续会话中注入。作用域是模型唯一的路由决策；名称或标题、路径与文件框架由代码掌控。

Source: [`packages/distill/distill/src/index.ts`](../../packages/distill/distill/src/index.ts).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdistill--distillengine"></a>

### `ctx.distill` — `DistillEngine`

Concrete distillation service. Subclasses may override summarize to swap the model-backed producer; the parsing and file framing stay fixed so the scope routing and file layout are always code-owned.

```ts cordis-catalog
/**
 * Distill the conversation into a skill file and write it.
 * @param agent - owner of the session being distilled; supplies history and project cwd.
 * @param name - kebab-case skill name (frontmatter name and directory).
 * @param signal - cancellation forwarded to the model call.
 * @returns the written artifact result.
 */
async distillSkill(agent: Agent, name: string, signal: AbortSignal): Promise<DistillResult>

/**
 * Distill the conversation into a memory note and write it.
 * @param agent - owner of the session being distilled.
 * @param title - note title; becomes the file slug and the `#` heading.
 * @param signal - cancellation forwarded to the model call.
 * @returns the written artifact result.
 */
async distillMemory(agent: Agent, title: string, signal: AbortSignal): Promise<DistillResult>
```

Types: [Agent](core.md)

Source: [`packages/distill/distill/src/index.ts:93`](../../packages/distill/distill/src/index.ts)
<!-- END GENERATED cordis-surface -->
