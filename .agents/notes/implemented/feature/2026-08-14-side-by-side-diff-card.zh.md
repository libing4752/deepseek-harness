# Agent Note: 文件改动的并排对比卡片

Status: implemented

[English](2026-08-14-side-by-side-diff-card.md) | 中文

## Problem

Web GUI 的 `DiffBlock` 原语（`@deepseek-ai/dsh-client-ui-primitives`）把一次 `write`/`edit` 改动画成堆叠列表——旧侧所有行在 `-` 下、新侧所有行在 `+` 下——没有行级对齐、没有行号、没有语法高亮。由于 hunk 的旧/新文本包含宿主下发的三行上下文，footer 把这些上下文行也计为改动。没有 VS Code 那样的并排对比。

## Decision

`DiffBlock` 现在用 `diff` 包的 `diffLines` 为每个 hunk 推导一份行级对齐的 diff，并以共享同一模型的两种视图渲染：

- **并排（默认）**——一个 `<table>`，列为 `左行号 | 左 | 右行号 | 右`，两个 pane 因此对齐并一起横向滚动。改动单元格带低透明度的 error/success 背景色与着色行号；未变的上下文保持对齐。删除行与新增行相邻的编辑渲染为一行配对的 `mod` 行。
- **行内**——带行号的统一 ` ` / `-` / `+` 视图，通过 `并排` / `行内` 分段控件从并排切换。

语法高亮按行复用 CodeBlock 的 shiki 路径（`highlightLines`），当文件扩展名映射到已知语法时生效；一侧超过 `HIGHLIGHT_MAX_CHARS`（64 KB）时以纯文本渲染，避免大型 create/overwrite diff 卡住同步分词器。`langFromPath` 是 read 工具扩展名映射的客户端镜像。footer 现在只统计真正的增删行（排除上下文），复制控件无论当前视图如何都写入统一 diff 文本。

`diff`（`^9.0.0`）作为 `ui-primitives` 依赖加入——它本就在树内，是 `tool-fs` 同主版本的依赖。

## Alternatives considered

### 为什么不采用 `@git-diff-view/react` + shiki？

它专为 diff 而生但很重，其 React wrapper 出现弃用/迁移迹象，且主题必须映射到 `--dsw-*` 令牌体系。`diff` 包已在 workspace 内、极小且同构，因此基于 `diffLines` 手写双 pane 布局比引入第三方 diff 组件删掉更多自有代码。

### 为什么不用 CodeMirror `@codemirror/merge` 或 Monaco 的 DiffEditor？

两者都是面向编辑器场景的真编辑器，而不是内联聊天卡片；bundle 与集成成本超过保真收益。

### 为什么不用 `diff2html` / `react-diff-viewer`？

`diff2html` 输出 HTML 字符串（注入风险、非 React），`react-diff-viewer` 已陈旧。

### 为什么并排视图用 `<table>`？

列对齐加上同步横向滚动正是 diff 所需的性质；逐行 flex/grid 布局无法在长行滚动时保持两个 pane 对齐。

### 为什么不改线上 `FileDiff { path, oldText, newText }` 契约？

上下文 hunk 契约已足够在客户端重新对齐。为展示层的关切加 `lang` 字段或全文件载荷会扩宽已发布的核心契约；语言改由路径推导。

## Consequences

- **footer 语义改变。** 上下文行不再计入增删，因此带上下文的 hunk 报告的 `+A -R` 比对齐前的渲染更小。
- **行号按 hunk 而非绝对。** hunk 不携带起始行，因此两个 pane 在 hunk 内都从 1 编号。
- **`langFromPath` 重复了 read 工具的扩展名映射。** 两个映射必须保持一致；read 卡片从宿主收到语言提示，而 diff 卡片在客户端推导。
- **diff 跑了两次。** 宿主 `structuredPatch` 生成 hunk，客户端 `diffLines` 重新对齐。除 create/overwrite 外 hunk 都很小，其高亮由预算门控。
- **高度上限按对齐后的行计数。** 对同一改动，并排与行内隐藏的行数可能不同（不均衡的 `mod` 在并排中给较短一侧补空，而行内逐行列出）。

## Testing

`packages/client/ui-primitives/tests/diff-block.client.spec.tsx`（32 个用例）覆盖对齐（上下文、删除、新增、含不均衡补空的修改）、并排/行内切换、各侧行号、footer 计数、统一复制文本、两种视图的 head/tail 上限、语法高亮（已知扩展名、未知扩展名与 64 KB 预算）以及 `langFromPath` 边界。单文件覆盖率 100%；`pnpm run test:gui` 与 `DSH_SNAPSHOT=replay pnpm run test:web` 均为绿色。

## Related

- [Web diff card](2026-07-30-web-diff-card.md) —— 本次渲染升级所取代的原始 `DiffBlock` 消费者决策；它仍拥有 `diff` 渲染意图如何到达浏览器、`diffCardModel` 如何推导 props 的部分。
- [Tagged render-intent union for tool-call presentation](../architecture/2026-07-02-tool-render-intent-union.md) —— diff 臂所消费的 `card` 标签词汇。
