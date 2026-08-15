# Agent Note: preset 的服务行必须保留其 isolate 键，否则 preset 将无法挂载

Status: implemented

[English](2026-08-14-preset-isolate-realm-omission-blocks-mount.md) | 中文

## Problem

`quant` agent preset 发布时，其 `distill` 行位于 compaction `cordis:group` 之内，但该分组的 `isolate` 映射里却缺了 `distill: true`。所有兄弟 preset（`standard`、`code`、`cordis`）都在那里声明了 `distill`。preset 的服务行必须挂在 entry-local 的 `isolate` realm 之后，否则它会发布进根 realm；`dsh-agent-presets` 的挂载审计（`leakedServices`）会以 `row(s) published process-global service(s) [distill]` 拒绝它。roster 仍把 `quant` 列为可选 —— 发现阶段只检查 YAML 结构 —— 于是每次选择都以 `agent-preset-invalid` 告终。

## Decision

`apps/cli/config/agent-presets/quant/agent.cordis.yml` 在 compaction 分组的 `isolate` 映射中补回 `distill: true`，与其兄弟一致，使 `DistillEngine` 留在分组的 entry-local realm 内。修复只有一行；preset 的工具集与 persona 不变。roster 测试现在期望五个随附 preset，并新增一个组合 `quant` 的 e2e 用例断言 `web_fetch` 存在，从而一旦再次丢掉 isolate 键就会在挂载阶段失败。

## Alternatives considered

- **把 `distill` 移到宿主组合** —— 否决：`distill` 是 preset 自行选择的一项按 agent 能力（如同 compaction），而非宿主平面的单例；其他 preset 已在 realm 之后将其保留在 preset 一侧。
- **从 `quant` 删除 `distill` 行** —— 否决：该 preset 本意是「标准 agent + 全文网页抓取」；删除 distill 会无声地偏离这一契约，而非修复泄漏。

## Consequences

- 根 realm 规则及其失败模式已由 [per-session preset 笔记](../architecture/2026-08-03-per-session-agent-presets.md) 与 [preset 创作校验笔记](2026-08-11-preset-authoring-agent-validates-its-own-composition.md) 所拥有；本笔记记录这一具体实例及其回归防线。
- `dsh-client-ui-agent-preset` 的 locales 新增英文与中文的 `presetQuantName`/`presetQuantDescription`，roster、菜单与创作快照也相应扩展，使第五个随附 preset 呈现本地化文案，而不再在英文选择器里回退到其中文文件元数据。
