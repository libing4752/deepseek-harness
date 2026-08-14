# Agent Note: 项目本地化的 Harness 开发模式

Status: implemented

[English](2026-08-14-harness-dev-mode.md) | 中文

## 问题

开发和扩展这套 Harness——插件、agent 预设、skill（技能）、Agent Note、组合配置——需要一套稳定的工作流，使工作始终按「方案 → 代码 → 测试 → 回归」推进，绝不在原地修改核心源码（Harness 升级必须继续有效），只在本 checkout 内生效，并不断沉淀可复用的经验，而不是每次会话都重新摸索相同的教训。

## 决策

该模式位于 `packages/` 核心之外，由用户自建的 agent preset 加上项目的 `.agents/` 层组成：

- 位于用户 preset 根（`~/.dsh/.agent-presets/`）下的用户自建 agent preset `harness-dev` 是可见入口：它复制 `standard` 组合、仅把 persona 改为陈述该模式，因此会出现在新建会话的模式选择器中；shipped 预设安装保持不变。
- `.agents/skills/harness-dev-mode/SKILL.md` 陈述模式本身：优先复用开源插件、四阶段工作流、插件化规则和经验沉淀步骤。
- `.agents/skills/harness-dev-experience/SKILL.md` 陈述沉淀步骤：以中英三元组的形式新增或更新 Agent Note，并在出现可复用流程时新增或精炼项目 skill。
- `.agents/memory/harness-dev-mode.md` 是每次会话注入一次的提醒：进行 Harness 开发时先加载模式 skill。

该 preset 可在任意工作区选择，但工作流 skill 与 memory note 仍按 cwd 作用域生效：既有的 `skill-filesystem` provider 根据工作目录向上推导项目根，再相对该根发现 `.agents/skills/`，因此该模式的引导仅在本 checkout 内可用。升级安全性来自两处载体都与 `packages/` 相互独立：Harness 升级不会触碰用户自建 preset 或 `.agents/`，而该模式本身是插件式新增，不是对已发布源码的修改。

## 考虑过的替代方案

**像 plan 模式那样实现一个 Cordis 插件模式：带持久化的每 agent 状态、提示词段和工具。** 这能机械地强制执行工作流，但需要新增一个包或 out-of-tree 挂载，并配真实组合测试与快照覆盖，而且接线会触碰已发布的组合配置。该模式所需的引导完全能在 skill/note/memory 层表达，因此强制执行的成本目前并不合理。

**原地修改已发布包或已发布的预设安装。** 否决：违反「不修改核心源码」与升级安全的要求。

**只用 skill，不要 memory 提醒。** skill 按需加载，仅靠 skill 无法可靠生效；每次会话注入一次的 memory note 才是让它在本目录对 Harness 工作生效的机制。

## 后果

该模式是引导而非机械闸门：它依赖模型加载并遵循 skill。这是为换取零核心改动与升级安全而接受的取舍；机械强制的插件仍可作为后续补充。

skill 与 memory 是单文件英文 agent 指令，符合仓库惯例；Agent Note 是中英三元组，是面向人的记录。
