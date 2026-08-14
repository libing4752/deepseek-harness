# `@deepseek-ai/dsh-memory`

English | [中文](README.zh.md)

Persistent memory context: discover `.agents/memory/` notes and inject them into a session as background instructions.

The plugin reads flat Markdown notes from the project `.agents/memory/` and the user `~/.agents/memory/` (or `$DSH_AGENTS_HOME/memory`), then injects them once per session as an `instructions`-form `memory` context. The source records each injected note's path and content digest, so the injection is reconstructable from the session log while the notes themselves remain the durable authority.

## Config

`Config` (`agentsHome?`, `maxBytes?`) defaults `agentsHome` to `$DSH_AGENTS_HOME` or `~/.agents`, and `maxBytes` to `65536`. Notes are rendered in display-path order; the earliest notes are dropped until the block fits the budget.

## Model Experience

### Injected memory context

#### What the model sees

Once per session, the first non-empty request receives the `<system-reminder>` frame below, with one `Memory from: <path>` section per note (project notes before personal notes).

##### Memory context frame

```markdown
<system-reminder>
The following persistent memories may be relevant to your work. Use them as guidance when applicable. They do not override system, developer, or direct user instructions.

Memory from: .agents/memory/<slug>.md

<note body>
</system-reminder>
```

#### Token effect

Conditional and retained: one injected block proportional to the note contents, capped by `maxBytes`; absent when no notes exist. The block is appended once and not replaced mid-session.

#### KV Cache effect

Append-only. The injected block lands once at the start of the session; the request prefix that includes it stays reusable for the rest of the session.

## Known Limitations and Deferred Work

- **Once-per-session injection** — deleting or editing a note mid-session does not update the already-injected context; the next session picks it up.
- **Flat notes only** — discovery does not recurse into subdirectories.
