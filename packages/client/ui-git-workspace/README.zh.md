# @deepseek-ai/dsh-client-ui-git-workspace

[English](README.md) | 中文

工作区改动审视的浏览器半：一个侧栏底部触发器加主从式模态，左侧列出工作区的改动文件、右侧显示选中文件的并排 diff（共享的 [`DiffBlock`](../ui-primitives/README.md) 原语），支持逐文件与全部回退。数据通过 [`@deepseek-ai/dsh-git-workspace`](../../host/git-workspace/README.md) Remote 命名空间到达。

## 槽契约

`gitWorkspace` Remote 命名空间通过 [`@deepseek-ai/dsh-api-remotes`](../../api/remotes/README.md) 客户端装配挂载；本插件在 `inject` 中声明该命名空间，并向 [`dsh-client-ui-sidebar`](../ui-sidebar/README.md) 声明的槽注册一个 `sidebar.footer.action` 条目（id 为 `git-workspace`）。触发器是宽行（「改动」）或轨道图标；点击打开居中对话框。

对话框左侧列出改动文件 —— 每行一个状态圆点与标签（`added` / `modified` / `deleted` / `untracked`）加悬停可见的逐文件回退 —— 右侧是选中文件的 diff。头部摘要统计文件数，「全部回退」在回退前要求内联确认。干净工作区、非 git 目录、空会话各自降级为不同提示。关闭路径是头部按钮、遮罩点击与 Escape。

面板从框架 `useSessions` 座读取当前会话并以该会话 id 寻址 Remote；无当前会话时打开为空。

## 组合

`dsh-web-app` bundle 以 `dsh.client` 行加载此插件，与它消费的宿主 `git-workspace` 行并列。节点半是空的 `apply`；浏览器半通过 `exports["./client"]` 发布。

## 已知限制与后续工作

- **无实时刷新** —— 面板在打开与每次回退后快照；外部改动需重开面板才可见。
- **单活动请求** —— 打开文件或回退会中止在途请求，除关闭重开外没有重试入口。
- **无逐文件 diff 上下文** —— diff 视图复用 `DiffBlock` 的并排/行内切换与行号，但行号按 hunk 而非文件绝对行。
