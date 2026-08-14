# Agent Note: 手动压缩并可选提炼为 skill / memory

Status: implemented

[English](2026-08-14-manual-compaction-skill-memory-distillation.md) | 中文

## Problem

`/compact` 已经能把对话压缩到自动压力阈值以下，但压缩产物只有会话表面内的一份检查点。用户在 Web GUI 里没有一键压缩的入口，也没有任何方式把一段已完成的对话沉淀为可复用的资产——技能目录已经能加载的 skill，或未来会话应当自动回忆的轻量 memory。仓库里此前根本没有「memory」运行时概念：最接近的候选是 Agent Note（一种带门禁的双语决策记录，从不注入模型上下文）和 `agent-instructions`（`AGENTS.md` 风格的注入规则）。

## Decision

手动压缩新增一个可选的提炼步骤，拆成两个新包加一个 UI 表面：

- **`@deepseek-ai/dsh-distill`** —— `ctx.distill` 服务（`DistillEngine extends Service`），重放会话的派生历史，通过一次辅助 `ctx.llm.stream()` 调用产出并写入持久化资产。模型只做一项路由判断——`Scope: project | personal`——外加一行描述（skill）和 Markdown 正文；名称/标题、目标路径与文件框架全部由代码掌控。project 作用域写入项目的 `.agents/`，personal 作用域写入 `~/.agents/`（或 `$DSH_AGENTS_HOME`），并直接使用宿主文件系统写入（与 `settings-file`/`agent-presets` 一致，因为用户主目录路径位于工作区沙箱之外）。skill 落盘为 `.agents/skills/<name>/SKILL.md`（frontmatter `name` + `description`，随后是正文），由现有文件系统技能提供方发现；memory 落盘为 `.agents/memory/<slug>.md`。
- **`@deepseek-ai/dsh-memory`** —— 上下文插件，发现 `.agents/memory/*.md`（项目）与 `~/.agents/memory/*.md`（个人），并在每个会话注入一次 `instructions` 形式的 `memory` 上下文。source 记录每条笔记的路径与内容摘要，使注入可从日志重建；笔记本身才是持久化权威。
- **`/compact` 标志** —— `command-compact` 现在接受 `--skill <name>` 与 `--memory <title>`（title 取该行剩余部分），校验 skill 名称，压缩后再提炼。失败被区分：压缩失败是 `ManualCompactionError`；提炼失败则报告「压缩已成功但提炼失败」。
- **`@deepseek-ai/dsh-client-ui-compact`** —— 输入工具栏按钮（`conversation.input.left`），其菜单执行 `/compact`，或提示输入名称/标题后通过 `ctx.remote.commands.execute` 执行 `/compact --skill …` / `/compact --memory …`。

作用域分类是 LLM 唯一的路由判断，因为「项目还是个人」正是模型擅长、且用户要求自动分类的判断；解析边界会拒绝两个封闭值之外的任何内容。

## Alternatives considered

- **把提炼折叠进 `command-compact` 单独实现** —— 拒绝：写资产是可复用的独立能力（未来的模型工具或跨会话变体复用 `ctx.distill` 而不依赖该命令）。
- **把 memory 写成 Agent Note** —— 拒绝：Agent Note 是带门禁的双语决策记录，从不注入模型上下文；用户要的是轻量自动注入的 memory。
- **模型生成名称/标题并解析自由文本** —— 拒绝：指针与身份必须精确，故由代码掌控；recallable-compaction 笔记记录了同样的 fail-closed 姿态。
- **用 `ctx.fs` 写入** —— 对 personal 作用域拒绝：用户主目录路径位于工作区沙箱之外，因此采用 `settings-file`/`agent-presets` 的宿主文件系统姿态。
- **通过 skill 机制实现 memory** —— 拒绝：用户要的是与 skill 区分开的、自动注入的 memory，而非不可调用的 skill。

## Consequences

- memory 注入为**每会话一次**：会话中途删除或修改笔记不会更新已注入的上下文，下一次会话才会生效。这是已文档化的 v1 边界，并满足「未来会话回忆 memory」的要求。
- 提炼调用是一次无输入预算上限的辅助模型请求；超长对话会先被压缩，但输入未单独设预算。
- 每个新包都携带标准的空实现 invariant 伴生插件，且 `command-compact` 现在注入 `distill`，因此任何挂载它的组合也必须挂载该服务（随附的 base bundle 与 standard/code/cordis/quant 预设均已挂载）。
