# @deepseek-ai/dsh-agents-catalog

[English](README.md) | 中文

通过 Typert Remote 暴露给 Web GUI 的只读「技能 + 记忆」目录。浏览器插件 [`dsh-client-ui-agents-catalog`](../../client/ui-agents-catalog/README.md) 把它渲染为侧栏底部的「技能与记忆」面板。技能查找读取宿主机技能注册表（预置层通过当前 agent 解析），并且从不创建或恢复 agent；记忆发现读取 `@deepseek-ai/dsh-memory` 所注入的同一批持久化 `.agents/memory` 笔记。

## 服务契约

服务以 `ctx.agentsCatalog`（`@deepseek-ai/dsh-agents-catalog` 默认导出）注册，并绑定 `agentsCatalog` Remote 命名空间。

`list(agent, signal)` 返回 `{ skills, memory }`。skills 是注册表针对该 agent 会话 cwd 与作用域选出的最终摘要，投影为 `name`/`description`/`whenToUse`/`modelInvocable`/`userInvocable`/`source`/`provider`；列表包含全部技能，而不仅是用户可调用的。memory 条目是项目 `.agents/memory/` 与用户 `~/.agents/memory/` 下的 Markdown 笔记，按展示路径排序。

`read(agent, ref, signal)` 针对 `ref = { kind: 'skill', id }`（技能名）或 `ref = { kind: 'memory', id }`（记忆展示路径）加载一条条目的完整内容；当条目已不存在时返回 `undefined`。

技能注册表的解析方式与 apiproxy 的 `skill.list` 处理器一致：当前 agent 的预置作用域 `skills` 服务优先于宿主注册表，因此即使某个组合在 realm 内挂载了自己的注册表，也仍能返回正确的目录。

## 组合

`dsh-web-app` bundle 挂载该服务（宿主平面）以及浏览器面板（`dsh.client`）。它依赖 `ctx.skills` 与 `ctx.agentPresets` 解析技能，并直接读取记忆文件；二者均不对模型可见。

## Known Limitations and Deferred Work

- **记忆发现重复了 `@deepseek-ai/dsh-memory` 的文件遍历**——该包没有暴露 list/read 服务，其加载器也不是公共导出，因此目录重新读取同一批文件，而不是共享同一个加载器。
- **没有实时刷新**——面板在打开时快照目录；会话进行中写入的技能或记忆笔记，在面板重新打开前不会被推送。
- **技能正文按需加载**——`list` 只返回摘要；面板每打开一条条目发起一次 `read`。
