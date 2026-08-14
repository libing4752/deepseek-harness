# `@deepseek-ai/dsh-client-ui-compact`

English | [中文](README.zh.md)

Manual context-compression composer control with optional skill/memory distillation.

The plugin occupies the `conversation.input.left` composer tool-row seat with a compression button. Its menu runs `/compact` directly, or prompts for a skill name / memory title and runs `/compact --skill <name>` / `/compact --memory <title>` through `ctx.remote.commands.execute`. The durable result renders as the command's own transcript row; this control surfaces only transport/handler failures inline.

## Model Experience

Indirectly, through the host `/compact` command (optionally `--skill` / `--memory`); `dsh-command-compact` and `dsh-distill` own the model-visible behavior.

#### KV Cache effect

Independent model request, owned by the invoked command and the distillation service.

## Known Limitations and Deferred Work

- **Name/title are free-text inputs** — the dialog does not validate the skill name ahead of time; the host command rejects an invalid name before compacting.
