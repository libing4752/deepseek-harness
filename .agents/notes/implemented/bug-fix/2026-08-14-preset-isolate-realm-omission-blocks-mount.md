# Agent Note: A preset service row must keep its isolate key or the preset stops mounting

Status: implemented

English | [中文](2026-08-14-preset-isolate-realm-omission-blocks-mount.zh.md)

## Problem

The `quant` agent preset shipped with its `distill` row inside the compaction `cordis:group` but without `distill: true` in that group's `isolate` map. Every sibling preset (`standard`, `code`, `cordis`) declares `distill` there. A preset service row must sit behind an entry-local `isolate` realm, or it publishes into the root realm; `dsh-agent-presets`' mount audit (`leakedServices`) rejects that as `row(s) published process-global service(s) [distill]`. The roster still listed `quant` as selectable — discovery only checks the YAML shape — so every selection attempt answered `agent-preset-invalid`.

## Decision

`apps/cli/config/agent-presets/quant/agent.cordis.yml` restores `distill: true` in the compaction group's `isolate` map, matching its siblings, so `DistillEngine` stays in the group's entry-local realm. The fix is one line; the preset's tool set and persona are otherwise unchanged. The roster test now expects five shipped presets, and a new e2e case composes `quant` and asserts `web_fetch` is present, so a regression that drops the isolate key fails at mount again.

## Alternatives considered

- **Move `distill` to the host composition** — rejected: `distill` is a per-agent capability a preset chooses (like compaction), not a host-plane singleton, and the other presets already keep it preset-side behind the realm.
- **Drop the `distill` row from `quant`** — rejected: the preset is meant to be the standard agent plus full-text web fetch; removing distill would silently diverge from that contract instead of fixing the leak.

## Consequences

- The root-realm rule and its failure mode were already owned by the [per-session preset note](../architecture/2026-08-03-per-session-agent-presets.md) and the [preset-authoring validation note](2026-08-11-preset-authoring-agent-validates-its-own-composition.md); this note records the concrete instance and its regression guard.
- `dsh-client-ui-agent-preset` locales gained `presetQuantName`/`presetQuantDescription` for both English and Chinese, and the roster, menu, and authoring snapshots were extended, so the fifth shipped preset presents localised copy instead of falling back to its Chinese file metadata in the English picker.
