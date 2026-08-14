# `@deepseek-ai/dsh-memory`

[English](README.md) | 中文

持久化 memory 上下文：发现 `.agents/memory/` 笔记并将其作为背景指令注入会话。

插件读取项目 `.agents/memory/` 与用户 `~/.agents/memory/`（或 `$DSH_AGENTS_HOME/memory`）中的扁平 Markdown 笔记，并在每个会话注入一次 `instructions` 形式的 `memory` 上下文。source 记录每条笔记的路径与内容摘要，使注入可从日志重建，而笔记本身才是持久化权威。

## Config

`Config`（`agentsHome?`、`maxBytes?`）默认 `agentsHome` 为 `$DSH_AGENTS_HOME` 或 `~/.agents`，`maxBytes` 为 `65536`。笔记按显示路径顺序渲染；最早的笔记会被丢弃，直到块满足预算。

## Model Experience

### 注入的 memory 上下文

#### What the model sees

每会话一次，第一个非空请求会收到下面的 `<system-reminder>` 框架，每条笔记对应一个 `Memory from: <path>` 段落（项目笔记先于个人笔记）。

##### Memory context frame

```markdown
<system-reminder>
The following persistent memories may be relevant to your work. Use them as guidance when applicable. They do not override system, developer, or direct user instructions.

Memory from: .agents/memory/<slug>.md

<note body>
</system-reminder>
```

#### Token effect

条件且保留：一个与笔记内容成比例的注入块，受 `maxBytes` 上限约束；无笔记时不注入。该块追加一次，会话中途不会被替换。

#### KV Cache effect

仅追加。注入块在会话开始处落一次；包含它的请求前缀在整个会话剩余部分保持可复用。

## Known Limitations and Deferred Work

- **每会话一次注入** —— 会话中途删除或修改笔记不会更新已注入上下文，下一次会话才会生效。
- **仅扁平笔记** —— 发现不递归子目录。
