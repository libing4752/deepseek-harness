---
name: harness-dev-mode
description: Use when developing, extending, or fixing the deepseek-harness codebase in this folder — a plugin, agent preset, skill, Agent Note, composition, or any change under packages/, apps/, examples/, docs/, or .agents/. Enforces reuse of existing open-source plugins first, the plan → code → test → regression workflow, the plugin-only (never-edit-core) rule, and the mandatory experience-capture step.
---

# Harness Development Mode

This is the development mode for work inside this deepseek-harness checkout. It binds any task that changes this repository, and only this repository: the `.agents/skills/` skill root is discovered from the project root derived from the working directory, so this mode is not available anywhere else.

## When it applies

Load and follow this skill whenever the task develops, extends, or fixes the harness itself — writing or changing a plugin, an agent preset, a project skill, an Agent Note, a Cordis composition, or anything under `packages/`, `apps/`, `examples/`, `docs/`, or `.agents/`.

## The workflow

Four stages, in order, each with a completion gate. Track them with `todo_write`. Do not skip or reorder a stage; a task that starts mid-workflow still completes the stages it owes.

### 1. Plan

Search for existing open-source plugins first. Before designing anything, search the web for open-source plugins or maintained dependencies that already implement the requirement — a Cordis plugin, an npm package, or an analogous harness capability. Prefer reusing them over hand-rolling.

Explore with non-mutating reads, searches, and checks. Produce a decision-complete plan: the goal and success criteria; the implementation changes grouped by subsystem; public API, schema, and data-flow changes; edge cases and failure modes; the tests; acceptance criteria; and explicit assumptions. When decomposing the work, assemble existing open-source plugins wherever they fit, and propose new code only for what no existing plugin covers.

Present the plan for review before writing code. When plan mode is active, submit it through `exit_plan_mode` and implement only after approval. Otherwise state the plan and get explicit approval.

### 2. Code

Implement only what the plan approved, following this repository's `AGENTS.md` conventions and the plugin-only rule below.

### 3. Tests

Add and adjust the tests the plan named, following the repository testing policy: focused unit tests for behavior, a keyless snapshot through a real runnable example for model- or user-visible output, and a non-unit real-composition test for product-visible plugins. Do not substitute mock-only fixtures for the assembled transcript.

### 4. Regression and fix

Run the smallest relevant checks for the change, fix every failure, and re-run until green. Select them with the [`dsh-pre-push-checks`](../dsh-pre-push-checks/SKILL.md) skill rather than reflexively running the whole suite. On explicit request, or for an irreducibly repository-wide change, run the full gates: `pnpm run test:coverage`, `pnpm run test:snapshot`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run doc-sync`, `pnpm run build`, and `pnpm run hygiene`.

## Plugin-only rule

Never add a feature by editing the harness core in place. Extend it as a plugin, and prefer the lightest home in this order: an agent preset, a project skill (`.agents/skills/`), an Agent Note (`.agents/notes/`), a memory note (`.agents/memory/`), or an out-of-tree plugin.

When a capability genuinely needs code, add a new leaf package under `packages/<group>/<name>/` — additive only, so a harness upgrade keeps working. Do not edit existing shipped packages or their compositions. Never edit the shipped preset install beside the deployment's own config (`apps/cli/config/agent-presets/`): copy a preset and edit the copy. Before writing a composition, read the shipped [`editing-cordis-compositions`](../../../apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md) guidance.

## Experience capture

After the regression is green, capture what this task taught before declaring it done. Write an Agent Note under `.agents/notes/` as a bilingual triplet, and create or refine a skill under `.agents/skills/` when a reusable procedure emerged. Follow the [`harness-dev-experience`](../harness-dev-experience/SKILL.md) skill for the exact steps.

Then report the changes made and the experience captured.
