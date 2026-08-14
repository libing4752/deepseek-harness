# Agent Note: A project-local harness development mode

Status: implemented

English | [中文](2026-08-14-harness-dev-mode.zh.md)

## Problem

Developing and extending this harness — plugins, agent presets, skills, Agent Notes, compositions — needs one stable workflow so that work always moves plan → code → test → regression, never edits core source in place (a harness upgrade must keep working), stays scoped to this checkout, and accumulates reusable experience instead of rediscovering the same lessons each session.

## Decision

The mode lives outside `packages/` core, in a user-authored agent preset plus the project's `.agents/` layer:

- A user-authored agent preset `harness-dev` under the user preset root (`~/.dsh/.agent-presets/`) is the visible entry point: it copies the `standard` composition and changes only the persona to state the mode, so it appears in the new-session mode picker. The shipped preset install is untouched.
- `.agents/skills/harness-dev-mode/SKILL.md` states the mode: the reuse-open-source-plugins-first rule, the four-stage workflow, the plugin-only rule, and the experience-capture step.
- `.agents/skills/harness-dev-experience/SKILL.md` states the capture step: write or update an Agent Note as a bilingual triplet, and create or refine a project skill when a reusable procedure emerged.
- `.agents/memory/harness-dev-mode.md` is a once-per-session reminder to load the mode skill for harness work.

The preset is selectable in any workspace, but the workflow skills and the memory note stay cwd-scoped: the existing `skill-filesystem` provider discovers `.agents/skills/` relative to the project root derived from the working directory, so the mode's guidance is available only inside this checkout. Upgrade safety comes from both homes being separate from `packages/`: a harness upgrade does not touch the user-authored preset or `.agents/`, and the mode is a plugin-style addition rather than an edit to shipped source.

## Alternatives considered

**A Cordis plugin mode with logged per-agent state, a prompt section, and a tool, like plan mode.** This would mechanically enforce the workflow, but it needs a new package or an out-of-tree mount plus a real-composition test and snapshot coverage, and wiring it would touch shipped composition. The guidance the mode requires is fully expressible in the skill/note/memory layer, so the enforcement cost is not yet justified.

**Editing existing shipped packages or the shipped preset install in place.** Rejected: it violates the no-core-edit and upgrade-safety requirements.

**A skill alone, without the memory reminder.** Skills load on demand, so a skill-only mode would not reliably take effect; the once-per-session memory note is what makes it apply to harness work in this folder.

## Consequences

The mode is guidance rather than a mechanical gate: it depends on the model loading and following the skill. That is the accepted trade for zero core changes and upgrade safety; a mechanical enforcement plugin remains a possible later addition.

Skills and memory are single-file English agent instructions, matching the repository convention; the Agent Note is a bilingual triplet, the human-facing record.
