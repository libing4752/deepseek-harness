# `@deepseek-ai/dsh-distill`

[English](README.md) | 中文

提炼服务：把一段对话转化为可复用的 skill 或 memory 资产。

`ctx.distill`（`DistillEngine extends Service`）重放会话的派生历史，通过一次辅助 `ctx.llm.stream()` 调用产出并写入结果。模型只提供一项路由判断——`Scope: project | personal`——外加一行描述（skill）与 Markdown 正文。名称/标题、目标路径与文件框架全部由代码掌控，因此作用域只在两个封闭值之间校验，畸形响应会在写盘前响亮失败。

## Service

`DistillEngine` 以键 `distill` 继承 Cordis `Service`，`static inject = ['llm']`。公开方法：

- `distillSkill(agent, name, signal)` —— 写入 `<scope-root>/.agents/skills/<name>/SKILL.md`，带 `name`/`description` frontmatter 与返回正文。`name` 必须为小写 kebab-case。
- `distillMemory(agent, title, signal)` —— 写入 `<scope-root>/.agents/memory/<slug>.md`，带 `# title` 标题与返回正文。
- `protected summarize(agent, kind, signal)` —— 模型支撑的钩子；子类可覆写，解析与框架保持不变。

作用域决定写入路径：`project` 写入会话项目根下的 `.agents/`，`personal` 写入 `~/.agents/`（或 `$DSH_AGENTS_HOME`）。写入直接使用宿主文件系统（与 `settings-file`/`agent-presets` 一致），因为用户主目录路径位于工作区沙箱之外。

## Model Experience

间接地，通过 `/compact --skill <name>` / `/compact --memory <title>` 调用本服务的独立辅助提炼请求并持久化返回的资产。

#### KV Cache effect

独立模型请求。提炼调用重放会话的派生历史并追加一条最终指令消息；它从不改变会话自身的请求前缀。

## Known Limitations and Deferred Work

- **无上限的提炼输入** —— 辅助调用未单独设预算；超长对话会先被压缩，但提炼输入本身没有上限。
- **单一模型目标** —— 调用复用会话路由的 provider/model（或显式 config 覆盖）；没有专门的摘要模型拆分。
