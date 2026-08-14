# `@deepseek-ai/dsh-distill`

English | [中文](README.zh.md)

Distillation service: turn a conversation into a durable skill or memory artifact.

`ctx.distill` (`DistillEngine extends Service`) replays the session's derived history through one auxiliary `ctx.llm.stream()` call and writes the result. The model supplies one routing fact — `Scope: project | personal` — plus a one-line description (skill) and a Markdown body. Code owns the name/title, the target path, and the file framing, so the scope is validated against the two closed values and a malformed response fails loud before anything is written.

## Service

`DistillEngine` extends Cordis `Service` under the key `distill`, with `static inject = ['llm']`. Public methods:

- `distillSkill(agent, name, signal)` — write `<scope-root>/.agents/skills/<name>/SKILL.md` with `name`/`description` frontmatter and the returned body. `name` must be lowercase kebab-case.
- `distillMemory(agent, title, signal)` — write `<scope-root>/.agents/memory/<slug>.md` with a `# title` heading and the returned body.
- `protected summarize(agent, kind, signal)` — the model-backed hook; subclasses may override it while the parse and framing stay fixed.

Scope routes the write: `project` writes under the session's project root `.agents/`, `personal` under `~/.agents/` (or `$DSH_AGENTS_HOME`). Writes use the host filesystem directly (the `settings-file`/`agent-presets` posture) because user-home paths sit outside the workspace sandbox.

## Model Experience

Indirectly, through `/compact --skill <name>` / `/compact --memory <title>`, which invoke this service's independent auxiliary distillation request and persist the returned artifact.

#### KV Cache effect

Independent model request. The distillation call replays the session's derived history plus one final instruction message; it never alters the session's own request prefix.

## Known Limitations and Deferred Work

- **Unbounded distillation input** — the auxiliary call is not separately budgeted; a very long conversation is compacted first, but the distillation input itself has no cap.
- **Single model target** — the call reuses the session's routed provider/model (or an explicit config override); there is no dedicated summarizer-model split.
