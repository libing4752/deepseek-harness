# @deepseek-ai/dsh-client-ui-agents-catalog

[English](README.md) | 中文

「技能 + 记忆」目录的浏览器侧：一个侧栏底部触发器与模态面板，列出当前项目的技能与记忆笔记，并在选中时展示一条条目的完整内容。数据通过 [`@deepseek-ai/dsh-agents-catalog`](../../host/agents-catalog/README.md) 的 Remote 命名空间到达。

## 槽位契约

`agentsCatalog` Remote 命名空间通过 [`@deepseek-ai/dsh-api-remotes`](../../api/remotes/README.md) 客户端装配层挂载；本插件在 `inject` 中声明该命名空间，并在 [`dsh-client-ui-sidebar`](../ui-sidebar/README.md) 声明的槽位里注册一个 `sidebar.footer.action` 条目（id `agents-catalog`）。触发器是宽行（「技能与记忆」）或轨道图标；选中后打开一个居中对话框。

对话框列出两个分组——技能与记忆——每行展示名称、副行（技能描述或记忆展示路径），以及技能所带的调用徽标（`模型/用户` / `仅模型` / `仅用户`）。选中某行会调用 `agentsCatalog.read`，用条目的完整内容替换列表，并显示返回控件。关闭路径包括头部按钮、点击遮罩与 Escape。

面板通过框架的 `useSessions` 座位读取当前会话，并以该会话 id 寻址 Remote；无当前会话时打开为空。

## 组合

`dsh-web-app` bundle 将该插件作为 `dsh.client` 行加载，紧挨着它所消费的宿主 `agents-catalog` 行。node 侧是空的 `apply`；浏览器侧通过 `exports["./client"]` 发布。

## Known Limitations and Deferred Work

- **没有实时刷新**——目录在打开时快照；会话中的改动仅在重新打开后出现。
- **单一活动请求**——打开条目会中止进行中的列表请求，除关闭并重开面板外没有重试入口。
- **没有搜索或筛选**——列表已分组排序，但不可筛选。
