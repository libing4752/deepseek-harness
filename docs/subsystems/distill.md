# Distillation

English | [中文](distill.zh.md)

The [distill](../../packages/distill/distill) service (`ctx.distill`, `DistillEngine`) turns a conversation into a durable skill or memory artifact. It replays the session's current derived history through one auxiliary `ctx.llm.stream()` call, asks the model for a scope classification plus a prose body, and writes the artifact to the project `.agents/` (project scope) or the user agents home (personal scope). Skills become `SKILL.md` files the filesystem skill provider discovers; memory notes become Markdown files that `@deepseek-ai/dsh-memory` injects into later sessions. The scope is the model's one routing decision; code owns the name or title, the path, and the file framing.

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
