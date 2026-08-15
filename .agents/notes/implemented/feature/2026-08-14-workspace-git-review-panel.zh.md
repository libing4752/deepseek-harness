# Agent Note: 通过 Typert Remote 的工作区 git 审视面板

Status: implemented

[English](2026-08-14-workspace-git-review-panel.md) | 中文

## Problem

Web GUI 没有查看工作区未提交改动并回退的办法。一次 `write`/`edit` 调用只内联展示自己的 diff 卡片，`session.rewind` 则把整个回合回退到 git 检查点 —— 两者都不是「列出所有改动文件、逐个读 diff、回退单个或全部」的面板。

## Decision

两个增量包复用 agents-catalog 的「Typert Remote + 客户端面板」模式提供该面板：

- `@deepseek-ai/dsh-git-workspace`（宿主，`packages/host/git-workspace`）—— 一个 `TypertRemoteService`，注册 `ctx.gitWorkspace` 与 `gitWorkspace` Remote 命名空间。`changedFiles` 运行 `git status --porcelain` 并把每条路径分类为 `added` / `modified` / `deleted` / `untracked`（重命名折叠为目标路径下的 `modified`）。`fileDiff` 返回某路径的 HEAD 内容与工作区内容（新建/未跟踪文件 `oldText: null`，删除文件 `newText: ''`）。`revert` 用 `git restore --source=HEAD --staged --worktree` 重置已跟踪路径、用 `git clean -fd` 删除未跟踪路径；空路径列表回退全部，且只触碰当前状态报告过的路径。
- `@deepseek-ai/dsh-client-ui-git-workspace`（客户端，`packages/client/ui-git-workspace`）—— 一个 `sidebar.footer.action` 触发器打开主从式模态：左侧改动文件（每种状态一个圆点与标签）、右侧选中文件的并排 `DiffBlock` diff、逐文件与全部回退（全部回退要求内联确认）。干净工作区、非 git 目录、空会话各自降级为不同提示。

`gitWorkspace` 命名空间通过 `@deepseek-ai/dsh-api-remotes` 客户端装配挂载，与 `agentsCatalog` 完全一致，因此不改任何已发布的契约层。

## Alternatives considered

### 为什么不扩展 `session.rewind`？

Rewind 是回合粒度且面向对话：它从某条用户消息之前分叉子会话、把整棵树回退到检查点分支。逐文件审视与回退需要的是当前工作区，而非历史回合边界。

### 为什么不做模型可用的 git 工具？

需求是用户可见的审视面板，而非模型能力。工具还会把 git 调用经模型沙箱策略路由，而用户发起的宿主动作应当像 apiproxy 检查点助手那样直接作用于真实工作区。

### 为什么用 Typert Remote + 客户端面板？

它是宿主数据到达浏览器、又不扩宽 apiproxy 桶的既定路线：生成器从 `@Remote` 方法推导客户端命名空间与编解码，客户端面板以消费 `agentsCatalog` 相同的方式消费它。

### 为什么用 `git restore` + `git clean`，而不是 apiproxy 的 `workspace-git` 助手？

`workspace-git.ts` 是 apiproxy 内部实现，面向检查点快照与整树回退；逐文件回退需要不同的 plumbing，且 plugin-only 规则要求新代码落在叶子包内。

## Consequences

- **回退天生是破坏性的。** 它是模型沙箱之外的用户发起宿主动作；全部回退按钮在执行前要求内联确认。
- **重命名按新增处理。** `git status --porcelain` 报告 `R  old -> new`；面板以目标路径展示、没有旧侧，因此 diff 渲染为新建文件。
- **暂存与未暂存改动合并。** 回退会连同工作区改动一起丢弃索引改动。
- **无大小或二进制处理。** 二进制文件的 diff 按文本解码，超大文件的完整内容会被无上限下发。
- **行号按 hunk。** diff 复用 `DiffBlock` 的并排/行内切换，其行号按 hunk 而非文件绝对行。

## Testing

宿主：`git-workspace.spec.ts` 在真实临时 git 仓库上驱动 plumbing（状态分类、暂存新增、重命名、前后内容、回退、全部回退、未知路径 no-op），并在 boot 的 `Context` + `SessionStore` 上驱动 Remote 服务（非 git 降级、无 cwd 回退）。客户端：jsdom 组件测试覆盖触发器、每种状态标签、diff 视图、逐文件与全部回退、错误与拒绝路径、以及关闭/无会话/干净/非 git 状态；browser-plugin 测试钉住槽注册、销毁与 inject 解析。单文件覆盖率 100%；`pnpm run test:gui` 与完整构建均为绿色。
