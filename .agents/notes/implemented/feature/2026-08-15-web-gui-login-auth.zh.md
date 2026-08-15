# Agent Note: Web 界面的用户名/密码登录（一个请求门 + 一个 opt-in 的 web-auth 插件）

Status: implemented

[English](2026-08-15-web-gui-login-auth.md) | 中文

## Problem

`dsh web` 提供一个浏览器界面，其 `/api` RPC 桥能以宿主进程身份执行任意命令。现有的浏览器信任围栏（`trustedHosts` 以及 `dsh-client-connection` 中的 `Origin`/`Host` 检查）明确只是 DNS 重绑定与跨站防御，而非认证，代码中也写明它一直「撑到真正的认证层出现为止」。启动器甚至拒绝 `dsh web --host 0.0.0.0`，认为它不安全。因此，把界面公开到公网的部署需要在任何请求到达路由之前加一道用户名/密码门——SPA、`/api` RPC 以及两条 WebSocket 事件下行流（`/api/events.mux`、`/api/events.host`）都必须被覆盖，否则这道门旁边仍有一扇开着的门。

有两个事实决定了设计。webserver 没有请求级钩子：`register`/`registerUpgrade`/`registerFallback`/`tapIndex` 都在路由匹配时或之后运行，所以插件无法在没有新扩展点的情况下在路由前统一拦截请求。而且浏览器的 `WebSocket` 构造函数无法设置 `Authorization` 请求头，因此 HTTP Basic Auth 能认证页面与 fetch，却会让事件下行流一直 401——Cookie 是浏览器在 HTTP 与 WebSocket 握手时都会携带的唯一凭据通道。

## Decision

### webserver 上的一个路由前 gate 扩展点，加上一个 opt-in 的 `web-auth` 叶子包

该功能由两个加法式部分构成：

1. **`packages/host/webserver`** 新增 `registerGate(WebRequestGate)` 与 `registerUpgradeGate(WebUpgradeGate)`。gate 是 `handle(req, res|socket) → boolean | Promise<boolean>` 谓词，按注册顺序在路由匹配前（以及升级分发前）运行；返回 `false` 即短路，由该 gate 负责应答。没有注册任何 gate 时行为不变，因此现有消费方不受影响。这是对已发布包的唯一一处编辑，是在用户明确同意下进行的，因为 webserver 是路由前钩子唯一能存在的地方。

2. **`packages/host/web-auth`**（`@deepseek-ai/dsh-host-web-auth`）是一个新的函数插件（`inject: ['webServer']`），注册一个请求 gate、一个升级 gate，以及 `/login`、`/logout` 两条精确路由。它接受一组 `username`/`password`：密码在激活时用 scrypt 哈希、以常量时间比对；用户名以常量时间比对，且密码始终参与派生，使两个分支在时间上不可区分。登录成功会签一个无状态会话令牌——`base64url(JSON {exp})` 加上对载荷的 HMAC-SHA256——并作为 `HttpOnly; SameSite=Strict`、带 `Max-Age` 的 Cookie 返回。`verifySession` 以常量时间校验签名与过期，并把任何非法的 base64url 或非 JSON 载荷视为无效令牌而非抛错。

### Gate 行为是默认拒绝，加上一条两路径白名单

请求 gate 只有在 Cookie 校验通过、或路径为 `/login`/`/logout`（好让这两条路由响应未登录请求）时才放行；否则拦截：`/api` 与 `/api/*` 返回 `401`，浏览器 `GET`/`HEAD` 返回 `302` 跳转到 `/login`，其它方法返回 `401`。升级 gate 只放行校验通过的 Cookie，否则在原始 socket 上写 `401`。`/login` 在 `GET`/`HEAD` 时提供一个自包含表单，在 `POST` 时解析 `application/x-www-form-urlencoded` 请求体（上限 8 KiB），成功后设置 Cookie，否则用一条通用的「凭据错误」提示重新渲染表单。`/logout` 清除 Cookie 并跳转。通用提示刻意不透露是用户名还是密码出错。

### 凭据与会话密钥都是配置，推荐用 `!!js` 环境变量引用

### 登录提交按客户端在固定窗口内限流

`POST /login` 在读取请求体之前先过一道固定窗口计数器。键是 socket 对端地址，或在启用 `trustProxyHeaders` 时取 `X-Forwarded-For` 的第一项；缺失、非字符串或空白的转发值回退到对端地址。当客户端在 `loginWindowMs` 内超过 `loginMaxAttempts` 后，后续提交返回 `429 Too Many Requests` 并带 `Retry-After`（距窗口重置的秒数），且根本不会进入 scrypt，因此昂贵的派生不是 DoS 攻击面。内存 Map 在访问时惰性清理，并受 `MAX_TRACKED_KEYS` 上限约束（淘汰最旧项），这是一个内存边界而非请求行为。`trustProxyHeaders` 默认为 `false`，因为信任一个可伪造的请求头只有在代理会覆写客户端自带 `X-Forwarded-For` 时才安全。

`Config` 为 `{ username, password, sessionSecret, sessionTtlMs, cookieName, cookieSecure, loginWindowMs, loginMaxAttempts, trustProxyHeaders }`。`username`/`password` 必填；README 建议用 `!!js process.env.DSH_WEB_USERNAME`/`DSH_WEB_PASSWORD`，让明文不落入提交的文件。`sessionSecret` 默认为空，激活时生成临时密钥（会话不跨重启保留）；稳定密钥则让登录状态跨重启保留。`cookieSecure` 为 Cookie 设置 `Secure` 标记，用于 HTTPS 终结的部署。`loginWindowMs`/`loginMaxAttempts` 默认 `60000`/`5`；`trustProxyHeaders` 默认 `false`。

### opt-in 组合，而非随包默认开启

该门只有挂载该行时才启用——随包的 `web-app` bundle 只声明该包为依赖（好让 `--patch` 覆盖层能解析它），但不插入任何行，从而让默认的 `dsh web` 对本地使用保持开放。部署通过覆盖层和环境变量启用（见包 README 的「Enabling」一节）。

## Alternatives considered

- **HTTP Basic Auth（浏览器原生弹窗）** —— 否决：浏览器 WebSocket API 无法附带 `Authorization` 请求头，事件下行流会一直 401；把 Basic Auth 桥接成 Cookie 又会重新引入大部分同样的机制，同时保留更粗糙的体验。
- **用反向代理叶子包代替 webserver 钩子** —— 否决：第二个监听器先认证再代理 HTTP 与 WebSocket，代码量大得多，还会改变端口/拓扑，而相对一个小的加法式 gate 钩子没有任何正确性收益。
- **有状态的服务端会话撤销** —— 否决：带过期时间的无状态 HMAC 签名令牌让插件零依赖、且对重启友好；登出只在客户端清除 Cookie，被盗令牌在过期前仍有效，已记录为已知限制。
- **部署级反向代理（nginx/caddy `basic_auth`）** —— 无需改代码的有效加固替代方案；仓库内 gate 是给那些希望把登录做进 harness 本身的部署的选择。

## Consequences

- **Webserver API**：新增两个方法和两个导出接口（`WebRequestGate`、`WebUpgradeGate`）；`handle` 闭包和新的 `handleUpgrade` 方法在路由前运行 gate，两个分发器都会 await gate 结果。
- **新包**：`packages/host/web-auth` 提供 `src/index.ts`、`src/invariant.ts`（一个记录在案的空 installer——其拥有的 deny/allow 关系是 HTTP 表层行为，由真实组合测试覆盖，而非同步 teardown 探测）、README 对，以及一个真实组合 spec。
- **接线**：`packages/bundle/web-app/package.json` 把 `@deepseek-ai/dsh-host-web-auth` 加为依赖；`tsconfig.host.json` 增加该包引用；`scripts/verify-package-readme-model-experience.ts` 增加它的 `None` 句子条目。
- **已知限制**（README）：限流是按客户端、仅内存的（重启即重置，无法阻止分布式攻击）；`trustProxyHeaders` 的代理信任由部署自行断言；无状态登出；登录 CSRF 仅依赖 `SameSite=Strict`。

## Testing

- **真实组合**：`packages/host/web-auth/tests/web-auth.spec.ts` 通过 vendored Loader 启动一个仅测试用的 `cordis.yml`（webserver + web-auth），并驱动 HTTP 表层——302/401/升级拒绝 gate、完整登录/登出流程、针对缺少分隔符、错误签名、非 JSON 载荷、非数字 `exp`、过期等情况的会话令牌校验，以及非法表单、缺失字段、超大请求体、方法（405/HEAD）边界。临时密钥与 `Secure` Cookie 分支在第二个组合下运行。限流被单独钉住：每窗口上限与 `429`+`Retry-After`、`X-Forwarded-For` 键控（不同转发地址是独立键、取第一项、缺失/空白值回退到对端）、以及窗口过期后重置。两个源文件覆盖率均为 100%。
- **Webserver gate**：`packages/host/webserver/tests/webserver.spec.ts` 新增请求 gate 与升级 gate 用例，断言短路、注册顺序、disposer 对称性，以及拦截升级 gate 不经分发就应答 socket。
