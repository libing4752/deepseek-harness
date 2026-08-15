# Agent Note: 通过 Typert Remote 的技能与记忆目录面板

Status: implemented

[English](2026-08-14-skills-memory-catalog-panel.md) | 中文

## Problem

Web GUI 只把技能与记忆作为模型可见面暴露：`skill` 工具把技能正文加载进请求，`dsh-memory` 在首轮前注入 `.agents/memory` 笔记。用户没有只读方式查看当前项目到底有哪些技能与记忆笔记，或在对话之外读取某条条目的完整内容。

## Decision

侧栏底部新增一个只读的「技能与记忆」面板，由两个挂入 `dsh-web-app` bundle 的增量包实现：

- `@deepseek-ai/dsh-agents-catalog`（宿主，`packages/host/agents-catalog`）——一个 `TypertRemoteService`，注册 `ctx.agentsCatalog` 与 `agentsCatalog` Remote 命名空间。`list(agent, signal)` 返回技能摘要与记忆笔记行；`read(agent, ref, signal)` 返回一条条目的完整内容。技能查找与 apiproxy 的 `skill.list` 处理器完全一致地解析注册表（`presets.serviceFor(agent, 'skills') ?? ctx.get('skills')`，scope 为当前 agent），记忆发现读取项目 `.agents/memory/` 与用户 `~/.agents/memory/` 文件。
- `@deepseek-ai/dsh-client-ui-agents-catalog`（客户端，`packages/client/ui-agents-catalog`）——在 `inject` 中声明 `agentsCatalog` Remote 命名空间，并注册一个渲染触发器与模态的 `sidebar.footer.action` 条目。

`agentsCatalog` Remote 命名空间通过 `@deepseek-ai/dsh-api-remotes` 客户端装配层挂载。这推翻了早先「在插件自己的 `apply` 里自行挂载」的做法——后者会让启动死锁，见[修复笔记](../bug-fix/2026-08-15-remote-namespace-self-mount-inject-deadlock.md)。

## Alternatives considered

### 为什么不给 apiproxy 增加 `skill.read` 与 `memory.*` 域？

apiproxy 的 `ApiProxy` 是共享的线上契约桶，在那里加域会编辑每个客户端形态都消费的已发布包。Typert Remote 服务是到达同一线路的插件自有路径：生成器从 `@Remote` 方法推导客户端命名空间与编解码，因此叶子包无需触碰契约层即可暴露新的读取面。

### 为什么不给 `@deepseek-ai/dsh-memory` 增加记忆列表服务？

`dsh-memory` 只负责 pre-step 注入，不暴露 list/read 服务。在那里加服务会为一个 UI 消费者扩宽已发布包的契约。目录改为用自身的小型加载器重读同一批文件；重复约 100 行稳定的文件发现。

### 为什么不在现有 Settings 壳里渲染面板？

Settings 拥有用户偏好及其自身的导航/分节机制。目录是项目内容而非偏好，自包含的 footer action 加模态使其独立于 settings 分节台账。

## Consequences

- **记忆发现重复了 `dsh-memory` 的文件遍历。** 两个加载器共享同样的作用域与排序规则但不共享代码；未来的 `dsh-memory` list/read 服务会是合并点。
- **面板在打开时快照。** 会话进行中写入的技能或记忆笔记不会被推送；面板在重开时重读。
- **技能正文按需加载。** `list` 只返回摘要，因此面板每打开一条条目发起一次 `read`，而不是预先下发全部正文。
- **Typert Remote 模式为 UI 自有的宿主服务做了示范。** 叶子宿主包暴露新的读取面；其 `/remote` 贡献通过共享的 `api/remotes` 装配挂载，客户端插件则声明并读取该命名空间。

## Testing

宿主：`list`/`read` 的单元测试，以及 boot session + skill + catalog 的真实 Loader 组合测试。客户端：触发器/列表/详情流程的 jsdom 组件测试，以及断言 footer-action 注册在 fiber 销毁时回卷的 browser-plugin 测试。
