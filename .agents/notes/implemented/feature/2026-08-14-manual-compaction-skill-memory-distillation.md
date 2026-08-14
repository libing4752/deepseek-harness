# Agent Note: Manual compaction with optional skill/memory distillation

Status: implemented

English | [中文](2026-08-14-manual-compaction-skill-memory-distillation.zh.md)

## Problem

`/compact` already reduced a conversation below the automatic pressure threshold, but the reduction was the only product: a session checkpoint inside the live surface. Users had no one-click way to compress from the Web GUI, and nothing turned a finished conversation into something durable and reusable — the skills the catalog already loads, or lightweight memories a later session should automatically recall. The repo had no "memory" runtime concept at all: the closest candidates were Agent Notes (a gated bilingual decision record, never injected into model context) and `agent-instructions` (`AGENTS.md`-style injected rules).

## Decision

Manual compression gains an optional distillation step, split into two new packages plus a UI surface:

- **`@deepseek-ai/dsh-distill`** — a `ctx.distill` service (`DistillEngine extends Service`) that replays the session's derived history through one auxiliary `ctx.llm.stream()` call and writes a durable artifact. The model chooses one routing fact — `Scope: project | personal` — plus a one-line description (skill) and a Markdown body; code owns the name/title, the target path, and the file framing. Project scope writes under the project `.agents/`; personal scope under `~/.agents/` (or `$DSH_AGENTS_HOME`), using host filesystem writes directly (the `settings-file`/`agent-presets` posture, because user-home paths sit outside the workspace sandbox). Skills land as `.agents/skills/<name>/SKILL.md` (frontmatter `name` + `description`, then body), discovered by the existing filesystem skill provider; memories land as `.agents/memory/<slug>.md`.
- **`@deepseek-ai/dsh-memory`** — a context plugin that discovers `.agents/memory/*.md` (project) and `~/.agents/memory/*.md` (personal) and injects them once per session as an `instructions`-form `memory` context. The source records each note's path and content digest so the injection is reconstructable from the log; the notes themselves are the durable authority.
- **`/compact` flags** — `command-compact` now accepts `--skill <name>` and `--memory <title>` (title takes the rest of the line), validates the skill name, compacts, then distills. Failures are split: a compaction failure is a `ManualCompactionError`; a distillation failure reports "compaction succeeded but distillation failed".
- **`@deepseek-ai/dsh-client-ui-compact`** — a composer tool-row button (`conversation.input.left`) whose menu runs `/compact`, or prompts for a name/title and runs `/compact --skill …` / `/compact --memory …` through `ctx.remote.commands.execute`.

Scope classification is the LLM's only routing decision because "project vs personal" is a judgment the model is well-placed to make and the user asked for automatic classification; the parse boundary rejects anything outside the two closed values.

## Alternatives considered

- **Fold distillation into `command-compact` alone** — rejected: writing artifacts is a distinct, reusable capability (a future model-facing tool or a cross-session variant reuses `ctx.distill` without the command).
- **Write memory as an Agent Note** — rejected: Agent Notes are gated bilingual decision records, never injected into model context; the user asked for lightweight auto-injected memory.
- **Model-authored name/title and free-text parsing** — rejected: pointers and identity must be exact, so code owns them; the recallable-compaction note records the same fail-closed posture.
- **Use `ctx.fs` for writes** — rejected for personal scope: user-home paths sit outside the workspace sandbox, so the `settings-file`/`agent-presets` host-fs posture applies.
- **Memory via the skill mechanism** — rejected: the user wanted distinct, auto-injected memory rather than a non-invocable skill.

## Consequences

- Memory injection is **once per session**: deleting or changing a note mid-session does not update the already-injected context; the next session picks it up. This is the documented v1 boundary and satisfies the "future sessions recall memory" requirement.
- The distillation call is an auxiliary, uncapped-input model request; very long conversations are compacted first, but the input is not separately budgeted.
- Every new package carries the standard no-op invariant companion, and `command-compact` now injects `distill`, so any composition mounting it must also mount the service (the shipped base bundle and standard/code/cordis/quant presets do).
