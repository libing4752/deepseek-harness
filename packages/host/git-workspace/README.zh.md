# @deepseek-ai/dsh-git-workspace

[English](README.md) | 中文

通过 Typert Remote 暴露给 Web GUI 的工作区 git 审视。[`dsh-client-ui-git-workspace`](../../client/ui-git-workspace/README.md) 浏览器插件把它渲染成侧栏底部的「工作区改动」面板。它枚举相对 HEAD 的工作区改动、读取单个文件的前后内容、并把路径回退到 HEAD。两个读方法绝不修改仓库；`revert` 是唯一的写操作，且只触碰当前 git 状态报告过的路径。

## 服务契约

服务注册为 `ctx.gitWorkspace`（`@deepseek-ai/dsh-git-workspace` 默认导出）并绑定 `gitWorkspace` Remote 命名空间。

`changedFiles(agent, signal)` 返回 `{ git, files }`。当会话 cwd 不在 git 工作树内时 `git` 为 `false`；否则 `files` 列出每条 `git status --porcelain` 条目，按 `added` / `modified` / `deleted` / `untracked` 分类、按路径排序。

`fileDiff(agent, path, signal)` 对某个改动路径返回 `{ path, status, oldText, newText }` —— `oldText` 是 HEAD 内容（新建/未跟踪文件为 `null`），`newText` 是工作区内容（删除文件为 `''`）。当路径当前未改动时返回 `undefined`。

`revert(agent, paths, signal)` 把给定路径回退到 HEAD 并返回 `{ reverted }`。已跟踪路径用 `git restore --source=HEAD --staged --worktree` 重置索引与工作区；未跟踪路径用 `git clean -fd` 删除。`paths` 为空时回退所有改动路径。

## 组合

`dsh-web-app` bundle 挂载此服务（宿主面）与浏览器面板（`dsh.client`）。它在会话 cwd 上调用 git；所读内容均非模型可见。

## 已知限制与后续工作

- **重命名按新增处理** —— `git status` 的重命名（`R  old -> new`）以目标路径报告、没有旧侧，因此其 diff 显示为新建文件。
- **暂存与未暂存改动合并** —— porcelain 状态对两者一视同仁，因此回退会同时丢弃索引中的改动。
- **无大小或二进制处理** —— 二进制文件的 diff 按文本解码，超大文件的完整内容会被无上限地下发。
