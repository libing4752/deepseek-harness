# @deepseek-ai/dsh-host-web-auth

[English](README.md) | 中文

为 Web 界面提供的用户名/密码登录门。它在 [`dsh-host-webserver`](../webserver/README.md) 上挂载一个路由前的请求门和一个升级门，以及 `/login`、`/logout` 两条路由。每个 HTTP 请求和 WebSocket 升级都必须携带有效的签名会话 Cookie；由于浏览器的 WebSocket API 无法设置 `Authorization` 请求头，同一个 Cookie 同时守卫 SPA、`/api` RPC 桥和两条事件下行流。

只接受一组凭据（`username`/`password`）。密码在激活时用 scrypt 哈希、并以常量时间（`timingSafeEqual`）比对；登录成功后发放带 HMAC-SHA256 签名过期时间的 `HttpOnly`、`SameSite=Strict` Cookie。会话令牌是无状态的：它在过期前始终有效，登出只会在客户端清除它。

## Config

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `username` | string | — | 接受的用户名。 |
| `password` | string | — | 接受的密码，激活时 scrypt 哈希；建议用 `!!js process.env.DSH_WEB_PASSWORD` 让明文不落入提交的配置。 |
| `sessionSecret` | string | `''` | 会话令牌的 HMAC 密钥；为空时生成临时密钥，会话不会跨重启保留。 |
| `sessionTtlMs` | number | `43200000` | 会话有效期（毫秒，默认 12 小时）。 |
| `cookieName` | string | `'dsh_web_session'` | 会话 Cookie 名称。 |
| `cookieSecure` | boolean | `false` | 为 Cookie 设置 `Secure` 标记；在 HTTPS 终止器之后启用。 |
| `loginWindowMs` | number | `60000` | 统计每个客户端登录尝试的固定窗口时长（毫秒）。 |
| `loginMaxAttempts` | number | `5` | 每个窗口内每个客户端允许的登录尝试次数，超出后返回 `429`。 |
| `trustProxyHeaders` | boolean | `false` | 用 `X-Forwarded-For` 作为客户端键；仅在可信代理之后启用。 |

## Behavior

未登录的浏览器 `GET`/`HEAD` 会被重定向（`302`）到 `/login`，后者提供一个自包含的登录表单。`POST /login` 失败会以通用的「凭据错误」提示重新渲染表单；成功则设置会话 Cookie 并重定向到 `/`。`POST /logout` 清除 Cookie 并重定向到 `/login`。未登录的 `/api` 请求和 WebSocket 升级返回 `401`（升级会在原始 socket 上写 `401`）。请求门只放行 `/login` 和 `/logout`，其余路径都需要有效 Cookie。

登录提交按客户端在固定窗口内限流：当客户端在 `loginWindowMs` 内超过 `loginMaxAttempts` 后，后续 `POST /login` 返回 `429 Too Many Requests` 并带 `Retry-After`，直到窗口重置。客户端键是 socket 对端地址，或在启用 `trustProxyHeaders` 时取 `X-Forwarded-For` 的第一项。

## Enabling

该门默认关闭，这样本地使用的默认 `dsh web` 保持开放。将它作为补丁覆盖层挂到 web profile 上，并从环境变量读取凭据：

```yaml
# web-auth.patch.yml — applied with `dsh web --patch web-auth.patch.yml`
- insert:
    - id: web-auth
      name: '@deepseek-ai/dsh-host-web-auth'
      config:
        username: !!js process.env.DSH_WEB_USERNAME
        password: !!js process.env.DSH_WEB_PASSWORD
```

```sh
DSH_WEB_USERNAME=admin \
DSH_WEB_PASSWORD='a-strong-password' \
dsh web --patch web-auth.patch.yml
```

使用默认的空 `sessionSecret` 时，会话不会跨重启保留；设置一个稳定的 `sessionSecret`（同样来自环境变量）即可让登录状态在重启后继续有效。

## Model Experience

None, as the login gate answers browser HTTP and upgrade requests and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **按客户端、仅内存** — 计数器是进程本地、按客户端地址为键的，重启即重置，也无法阻止轮换来源地址的分布式攻击；它约束的是单来源猜测，而非僵尸网络。
- **代理信任由部署自行断言** — `trustProxyHeaders` 关闭时，反向代理后的所有客户端共享代理地址这一个键；启用则信任一个可伪造的请求头，因此只有当代理会覆写客户端自带的 `X-Forwarded-For` 时才应开启。
- **无状态登出** — 会话令牌是 HMAC 签名的、服务端不撤销，因此已签发的令牌在过期前始终有效；令牌被盗（或客户端忽略被清除的 Cookie）仍可继续使用会话直到过期。
- **登录 CSRF** — 登录表单依赖 `SameSite=Strict`，但对于单凭据部署没有单独防御登录 CSRF（把受害者强制登录进攻击者的会话）。
