# `@deepseek-ai/dsh-client-ui-compact`

[English](README.md) | 中文

带可选 skill/memory 提炼的手动上下文压缩输入控件。

插件占据 `conversation.input.left` 输入工具栏座位，提供一个压缩按钮。其菜单直接执行 `/compact`，或提示输入 skill 名称 / memory 标题后通过 `ctx.remote.commands.execute` 执行 `/compact --skill <name>` / `/compact --memory <title>`。持久化结果以命令自身的转录行呈现；此控件只内联呈现传输/处理器失败。

## Model Experience

间接地，通过宿主 `/compact` 命令（可选 `--skill` / `--memory`）；`dsh-command-compact` 与 `dsh-distill` 拥有模型可见行为。

#### KV Cache effect

独立模型请求，由被调用的命令与提炼服务拥有。

## Known Limitations and Deferred Work

- **名称/标题为自由文本输入** —— 对话框不会提前校验 skill 名称；宿主命令会在压缩前拒绝非法名称。
