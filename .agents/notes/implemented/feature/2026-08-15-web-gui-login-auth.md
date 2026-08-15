# Agent Note: Web GUI username/password login (a request gate + an opt-in web-auth plugin)

Status: implemented

English | [中文](2026-08-15-web-gui-login-auth.zh.md)

## Problem

`dsh web` serves a browser interface whose `/api` RPC bridge can run arbitrary commands as the host process. The existing browser-trust fence (`trustedHosts`, `Origin`/`Host` checks in `dsh-client-connection`) is explicitly a DNS-rebinding and cross-site defense, not authentication, and the code documented it as standing "until a real authentication layer exists." `dsh web --host 0.0.0.0` is even refused by the launcher as unsafe. A deployment that exposes the GUI publicly therefore needs a username/password gate before any request reaches routing — the SPA, the `/api` RPC, and the two WebSocket event downlinks (`/api/events.mux`, `/api/events.host`) must all be covered, or the gate is beside an open path.

Two facts shape the design. The webserver had no request-level hook: `register`/`registerUpgrade`/`registerFallback`/`tapIndex` all run at or after route matching, so a plugin could not uniformly intercept requests before routing without a new extension point. And the browser `WebSocket` constructor cannot set an `Authorization` header, so HTTP Basic Auth would authenticate the page and fetches but leave the event downlinks 401 — the cookie route is the one credential transport the browser sends on both HTTP and WebSocket handshakes.

## Decision

### A pre-routing gate extension point on the webserver, plus an opt-in `web-auth` leaf package

The feature is two additive pieces:

1. **`packages/host/webserver`** gains `registerGate(WebRequestGate)` and `registerUpgradeGate(WebUpgradeGate)`. A gate is a `handle(req, res|socket) → boolean | Promise<boolean>` predicate that runs in registration order before route matching (and before upgrade dispatch); returning `false` short-circuits and the gate owns the answer. No gates registered means behavior is unchanged, so existing consumers are unaffected. This is the one edit to a shipped package, made with explicit user sign-off because the webserver is the only place a pre-routing hook can live.

2. **`packages/host/web-auth`** (`@deepseek-ai/dsh-host-web-auth`) is a new function plugin (`inject: ['webServer']`) that registers one request gate, one upgrade gate, and the `/login` and `/logout` exact routes. It accepts a single `username`/`password`: the password is scrypt-hashed at activation and compared in constant time; the username is compared in constant time and the password is always derived so the two branches are timing-indistinguishable. A successful login signs a stateless session token — `base64url(JSON {exp})` plus an HMAC-SHA256 over the payload — and returns it as an `HttpOnly; SameSite=Strict` cookie with `Max-Age`. `verifySession` checks the signature and expiry in constant time and treats any malformed base64url or non-JSON payload as an invalid token rather than a throw.

### Gate behavior is deny-by-default with a two-path allowlist

The request gate admits a request only when its cookie verifies, or when the path is `/login` or `/logout` (so those routes answer unauthenticated requests). Otherwise it blocks: `/api` and `/api/*` get `401`, browser `GET`/`HEAD` gets a `302` to `/login`, and any other method gets `401`. The upgrade gate admits only a verified cookie and writes `401` on the raw socket otherwise. `/login` serves a self-contained form on `GET`/`HEAD`, and on `POST` parses an `application/x-www-form-urlencoded` body (capped at 8 KiB), sets the cookie on success, or re-renders the form with one generic invalid-credential message. `/logout` clears the cookie and redirects. The generic message deliberately does not reveal whether the username or the password failed.

### Credentials and the session key are config, recommended through `!!js` env refs

### Login submissions are rate-limited per client in a fixed window

`POST /login` passes a fixed-window counter before the body is read. The key is the socket peer address, or the first `X-Forwarded-For` entry when `trustProxyHeaders` is enabled; an absent, non-string, or blank forwarded value falls back to the peer. Once a client exceeds `loginMaxAttempts` within `loginWindowMs`, further submissions answer `429 Too Many Requests` with `Retry-After` (seconds until the window resets) and never reach scrypt, so the expensive derivation is not the DoS surface. The in-memory map is lazily pruned on access and capped at `MAX_TRACKED_KEYS` (oldest evicted), a memory bound rather than request behavior. `trustProxyHeaders` defaults to `false` because honoring a spoofable header is only safe behind a proxy that overwrites client-supplied `X-Forwarded-For`.

`Config` is `{ username, password, sessionSecret, sessionTtlMs, cookieName, cookieSecure, loginWindowMs, loginMaxAttempts, trustProxyHeaders }`. `username`/`password` are required; the README recommends `!!js process.env.DSH_WEB_USERNAME`/`DSH_WEB_PASSWORD` so the literal never lands in a committed file. `sessionSecret` defaults to empty, which generates an ephemeral key at activation (sessions do not survive a restart); a stable secret keeps logins across restarts. `cookieSecure` sets the cookie `Secure` flag for HTTPS-terminated deployments. `loginWindowMs`/`loginMaxAttempts` default to `60000`/`5`; `trustProxyHeaders` defaults to `false`.

### Opt-in composition, not a shipped default

The gate is enabled only by mounting the row — the shipped `web-app` bundle declares the package as a dependency (so a `--patch` overlay can resolve it) but inserts no row, keeping the default `dsh web` open for local use. A deployment enables it with an overlay and environment variables (see the package README's "Enabling" section).

## Alternatives considered

- **HTTP Basic Auth (the browser's native prompt)** — rejected: the browser WebSocket API cannot attach an `Authorization` header, so the event downlinks would 401; bridging Basic Auth to a cookie would reintroduce most of the same machinery while keeping the cruder UX.
- **A reverse-proxy leaf package instead of a webserver hook** — rejected: a second listener that authenticates then proxies HTTP and WebSocket is substantially more code and changes the port/topology, for no correctness gain over a small additive gate hook.
- **Stateful server-side session revocation** — rejected: a stateless HMAC-signed token with expiry keeps the plugin dependency-free and restart-friendly; logout clears the cookie client-side and a stolen token stays valid until expiry, recorded as a Known Limitation.
- **A deployment-level reverse proxy (nginx/caddy `basic_auth`)** — a valid hardening alternative that needs no code change; the in-repo gate is the choice for deployments that want the login in the harness itself.

## Consequences

- **Webserver API**: two new methods and two exported interfaces (`WebRequestGate`, `WebUpgradeGate`); the `handle` closure and the new `handleUpgrade` method run gates before routing, and both dispatchers await the gate result.
- **New package**: `packages/host/web-auth` ships `src/index.ts`, `src/invariant.ts` (a documented empty installer — the owned deny/allow relation is HTTP-surface behavior, covered by the real-composition test rather than a synchronous teardown probe), README pair, and a real-composition spec.
- **Wiring**: `packages/bundle/web-app/package.json` adds `@deepseek-ai/dsh-host-web-auth` as a dependency; `tsconfig.host.json` adds the package reference; `scripts/verify-package-readme-model-experience.ts` adds its `None` sentence entry.
- **Known limitations** (README): the rate limiter is per-client and in-memory (resets on restart, does not stop a distributed attacker); `trustProxyHeaders` trust is the deployment's to assert; stateless logout; login CSRF relies on `SameSite=Strict` only.

## Testing

- **Real composition**: `packages/host/web-auth/tests/web-auth.spec.ts` boots a test-only `cordis.yml` through the vendored Loader (webserver + web-auth) and drives the HTTP surface — the 302/401/upgrade denial gate, the full login/logout flow, session-token verification against a missing separator, a bad signature, a non-JSON payload, a non-numeric `exp`, and expiry, plus the malformed-form, missing-field, oversized-body, and method (405/HEAD) bounds. The ephemeral-secret and `Secure`-cookie branches run under a second composition. Rate limiting is pinned separately: the per-window cap and `429`+`Retry-After`, the `X-Forwarded-For` keying (distinct forwarded addresses are independent keys, the first entry counts, missing/blank values fall back to the peer), and window reset after expiry. Coverage is 100% for both source files.
- **Webserver gates**: `packages/host/webserver/tests/webserver.spec.ts` adds request-gate and upgrade-gate cases asserting short-circuit, registration order, disposer symmetry, and that a blocking upgrade gate answers the socket without dispatch.
