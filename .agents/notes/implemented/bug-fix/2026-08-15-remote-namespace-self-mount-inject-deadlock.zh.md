# Agent Note: 客户端插件不得自行挂载它在 inject 中声明的 Remote 命名空间

Status: implemented

[English](2026-08-15-remote-namespace-self-mount-inject-deadlock.md) | 中文

## Problem

「技能与记忆」侧栏面板发布时，其浏览器插件既挂载又消费 `agentsCatalog` Remote 命名空间：`apply` 里 `await ctx.remote.$mount(agentsCatalogRemote)`，而 footer action 的 inject 闭包读取 `ctx.remote.agentsCatalog`。点击触发器毫无反应。首次读取抛出 `cannot get property "remote.agentsCatalog" without inject`——可追踪的 `remote` 服务把 `remote.<namespace>` 路由进 ctx 属性代理，其 get 门要求完整键必须出现在 `inject` 里。把 `remote.agentsCatalog` 加进 `inject` 能修好那次读取，却让启动死锁：插件 fiber 等待一个只有它自己的 `apply` 才提供的服务，于是永远无法激活（`pending (waiting for service: remote.agentsCatalog)`）。现有测试漏掉了它——组件测试直接喂 `list`/`read` 动词，浏览器插件测试从未调用 footer action 的 inject 闭包。

## Decision

把 `/remote` 贡献挂到 `@deepseek-ai/dsh-api-remotes` 客户端装配层——与 commands、goals、message-feedback 贡献同处——让消费插件只声明并读取命名空间。`ui-agents-catalog` 声明 `inject = ['remote', 'remote.agentsCatalog', 'slots', 'locale']`、读取 `ctx.remote.agentsCatalog`，不再调用 `$mount`。这推翻了[面板功能笔记](../feature/2026-08-14-skills-memory-catalog-panel.md)里记录的自行挂载。

## Alternatives considered

- **在 inject 闭包里用 `ctx.get('remote.agentsCatalog')`** —— 绕过 inject 门读取已挂载的命名空间，保持自行挂载的局部性。否决：它为一个共享装配层本就该挂载的命名空间使用可选服务逃生口，还丢掉了所有兄弟插件都在用的类型化 `ctx.remote.agentsCatalog` 访问。
- **保留自行挂载并从 `inject` 去掉该命名空间** —— 不再死锁，但 `ctx.remote.agentsCatalog` 首次读取仍会抛代理的 `without inject` 错误，原 bug 依旧。

## Consequences

- `agentsCatalog` 命名空间现在为每个包含 `dsh-api-remotes` 的客户端挂载；其宿主服务仍是 web-only，留在 `dsh-web-app` bundle 里，与 web-only 的 `message-feedback` 贡献处理方式一致。
- 浏览器插件测试现在提供一个真实的 `remote` Service 加 `remote.agentsCatalog` 命名空间，并调用 footer action 的 inject 动词、断言精确的 `inject` 数组，于是丢掉命名空间键会大声失败。
- 一次真实的 `dsh web` 点击走查确认模态框打开并列出项目的技能与记忆。
