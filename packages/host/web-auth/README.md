# @deepseek-ai/dsh-host-web-auth

English | [中文](README.zh.md)

A username/password login gate for the Web GUI. It mounts a pre-routing request gate and an upgrade gate over [`dsh-host-webserver`](../webserver/README.md), plus the `/login` and `/logout` routes. Every HTTP request and WebSocket upgrade must carry a valid signed session cookie; because the browser WebSocket API cannot set an `Authorization` header, the same cookie gates the SPA, the `/api` RPC bridge, and the two event downlinks.

One credential (`username`/`password`) is accepted. The password is scrypt-hashed at activation and compared in constant time (`timingSafeEqual`); a correct login issues an `HttpOnly`, `SameSite=Strict` cookie carrying an HMAC-SHA256-signed expiry. The session token is stateless: it stays valid until its expiry, and logout only clears it client-side.

## Config

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `username` | string | — | The accepted username. |
| `password` | string | — | The accepted password, scrypt-hashed at activation; prefer `!!js process.env.DSH_WEB_PASSWORD` so the literal stays out of committed config. |
| `sessionSecret` | string | `''` | HMAC key for session tokens; empty generates an ephemeral key so sessions do not survive a restart. |
| `sessionTtlMs` | number | `43200000` | Session lifetime in milliseconds (12 hours). |
| `cookieName` | string | `'dsh_web_session'` | Session-cookie name. |
| `cookieSecure` | boolean | `false` | Set the cookie `Secure` flag; enable behind an HTTPS terminator. |
| `loginWindowMs` | number | `60000` | Fixed window over which login attempts are counted per client, in milliseconds. |
| `loginMaxAttempts` | number | `5` | Login attempts allowed per client per window before `429`. |
| `trustProxyHeaders` | boolean | `false` | Honor `X-Forwarded-For` for the client key; enable only behind a trusted proxy. |

## Behavior

An unauthenticated browser `GET`/`HEAD` is redirected (`302`) to `/login`, which serves a self-contained login form. A failed `POST /login` re-renders the form with a generic invalid-credential message; a correct one sets the session cookie and redirects to `/`. `POST /logout` clears the cookie and redirects to `/login`. Unauthenticated `/api` requests and WebSocket upgrades are answered `401` (the upgrade writes `401` on the raw socket). The gate allowlists only `/login` and `/logout`; every other path requires a valid cookie.

Login submissions are rate-limited per client in a fixed window: once a client exceeds `loginMaxAttempts` within `loginWindowMs`, further `POST /login` answers `429 Too Many Requests` with `Retry-After` until the window resets. The client key is the socket peer address, or the first `X-Forwarded-For` entry when `trustProxyHeaders` is enabled.

## Enabling

The gate ships opt-in, so the default `dsh web` stays open for local use. Mount it as a patch overlay over the web profile and take the credential from environment variables:

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

With the default empty `sessionSecret`, sessions do not survive a restart; set a stable `sessionSecret` (also from an env var) to keep logged-in browsers signed in across restarts.

## Model Experience

None, as the login gate answers browser HTTP and upgrade requests and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Per-client, in-memory limit** — the counter is process-local and keyed by client address, so it resets on restart and does not stop a distributed attacker rotating source addresses; it bounds single-source guessing, not a botnet.
- **Proxy trust is the deployment's to assert** — with `trustProxyHeaders` off, every client behind a reverse proxy shares the proxy's address as one key; enabling it trusts a spoofable header, so only do so when the proxy overwrites client-supplied `X-Forwarded-For`.
- **Stateless logout** — the session token is HMAC-signed and never revoked server-side, so an already-issued token stays valid until its expiry even after logout; a stolen token (or a client that ignores the cleared cookie) can keep using the session until then.
- **Login CSRF** — the login form relies on `SameSite=Strict`, but login CSRF (forcing a victim into the attacker's session) is not separately defended for a single-credential deployment.
