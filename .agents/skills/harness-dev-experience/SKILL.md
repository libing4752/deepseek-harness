---
name: harness-dev-experience
description: Use at the end of a deepseek-harness development task to capture what the work taught — write or update an Agent Note as a bilingual triplet, and create or refine a project skill when a reusable procedure emerged. Keeps harness-plugin development experience accumulating across sessions.
---

# Harness Development Experience

This skill closes a [`harness-dev-mode`](../harness-dev-mode/SKILL.md) task: it turns one finished change into durable experience the next session reuses. It applies only inside this deepseek-harness checkout.

## Step 1 — Agent Note

Write or update one Agent Note under `.agents/notes/` following [`.agents/notes/README.md`](../../notes/README.md):

- Pick the lifecycle and class: a decision that shipped goes under `implemented/`, a substantial future idea under `proposed/`, and the class matches the decision (`feature`, `bug-fix`, `simplification`, `architecture`, `process`, or `testing`).
- Use the exact file format: the `# Agent Note: <title>` / `Status:` header block, the `## Problem` opener, and the sections the chosen lifecycle requires (`## Decision` + `## Consequences` for `implemented/`). Keep the mandatory `## Alternatives considered`.
- Deliver the note as a bilingual triplet: the English file, the `.zh.md` counterpart mirroring its structure, and the `.i18n.yaml` consistency record. Record the pair with `pnpm run verify-translation-pairing --write <note>`.
- When an existing note already owns the decision, update it instead of creating a duplicate; never rewrite a note into a different decision.

Use the [`dsh-archive-agent-notes`](../dsh-archive-agent-notes/SKILL.md) skill when the change supersedes, archives, or prunes existing notes.

## Step 2 — Skill

Create or refine a skill only when a reusable procedure emerged that future harness development would otherwise rediscover:

- A new skill is one directory under `.agents/skills/<name>/` holding a `SKILL.md` with `name` and `description` frontmatter. Name it in kebab-case and state the trigger in `description` ("Use when …").
- Refine an existing skill in the same change that teaches the lesson, instead of starting a parallel skill.
- Follow the prose rules with the [`dsh-prose-standard`](../dsh-prose-standard/SKILL.md) skill; skills are single-file English agent instructions.

## Step 3 — Report

Report the Agent Note path (and any skill changed) as the captured experience, so the next session knows where the lesson lives.
