/**
 * @deepseek-ai/dsh-host-web-auth — a username/password login gate for the Web
 * GUI. It registers a pre-routing gate over the webserver that admits only
 * requests carrying a valid signed session cookie, plus the `/login` (form and
 * submit) and `/logout` routes. One username/password is scrypt-hashed at
 * activation and compared in constant time; a successful login issues an
 * HttpOnly, SameSite=Strict cookie carrying an HMAC-signed expiry. Browser
 * WebSocket handshakes cannot set an Authorization header, so the same cookie
 * gates both HTTP requests and the upgrade downlinks through a matching
 * upgrade gate. Login submissions are rate-limited per client (a fixed window
 * keyed by peer address, or by `X-Forwarded-For` behind a trusted proxy),
 * answering `429` with `Retry-After` once the per-window attempt cap is hit.
 * @module @deepseek-ai/dsh-host-web-auth
 */

import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'

const scryptAsync = promisify(scrypt)

/** Stable Cordis plugin name. */
export const name = 'web-auth'

/** Service required before the gate and login routes can mount. */
export const inject = ['webServer']

/** Default session lifetime (12 hours). */
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
/** Default session-cookie name. */
const DEFAULT_COOKIE_NAME = 'dsh_web_session'
/** scrypt key length in bytes. */
const SCRYPT_KEY_LEN = 64
/** Login form body cap; a larger POST answers 400 through the webserver's containment. */
const MAX_LOGIN_BODY_BYTES = 8 * 1024
/** Default fixed window (60s) over which login attempts are counted per client. */
const DEFAULT_LOGIN_WINDOW_MS = 60 * 1000
/** Default login attempts allowed per client per window before 429. */
const DEFAULT_LOGIN_MAX_ATTEMPTS = 5
/** Memory cap on tracked client keys; the oldest entry is evicted when exceeded. */
const MAX_TRACKED_KEYS = 10_000

/** Plugin config: the single credential plus session-token parameters. */
export interface Config {
  /** The accepted username. */
  username: string
  /**
   * The accepted password, hashed with scrypt at activation. Prefer an env var
   * reference (`!!js process.env.DSH_WEB_PASSWORD`) so the literal never lands
   * in a committed config file.
   */
  password: string
  /**
   * HMAC key for session tokens. Empty (the default) generates an ephemeral
   * key at activation, so sessions do not survive a restart; set a stable value
   * to keep logged-in browsers signed in across restarts.
   */
  sessionSecret: string
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number
  /** Session-cookie name. */
  cookieName: string
  /** Set the cookie `Secure` flag; enable behind an HTTPS terminator. */
  cookieSecure: boolean
  /** Fixed window over which login attempts are counted per client, in milliseconds. */
  loginWindowMs: number
  /** Login attempts allowed per client per window before `429 Too Many Requests`. */
  loginMaxAttempts: number
  /** Honor `X-Forwarded-For` for the client key; enable only behind a trusted proxy. */
  trustProxyHeaders: boolean
}

export const Config: z<Config> = z.object({
  username: z.string().required(),
  password: z.string().required(),
  sessionSecret: z.string().default(''),
  sessionTtlMs: z.natural().min(1).default(DEFAULT_SESSION_TTL_MS),
  cookieName: z.string().default(DEFAULT_COOKIE_NAME),
  cookieSecure: z.boolean().default(false),
  loginWindowMs: z.natural().min(1).default(DEFAULT_LOGIN_WINDOW_MS),
  loginMaxAttempts: z.natural().min(1).default(DEFAULT_LOGIN_MAX_ATTEMPTS),
  trustProxyHeaders: z.boolean().default(false),
})

/** A scrypt password hash and its per-hash salt. */
interface PasswordRecord {
  salt: Buffer
  hash: Buffer
}

/** One signed session-token payload. */
interface SessionPayload {
  /** Expiry as Unix epoch milliseconds. */
  exp: number
}

/** Constant-time equality for two equal-length buffers. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Constant-time equality for two UTF-8 strings. */
function safeStringEqual(a: string, b: string): boolean {
  return safeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/** Keyed HMAC-SHA256 over a string. */
function hmac(secret: Buffer, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

/**
 * Hash one plaintext password with a fresh random salt.
 * @param password - the plaintext to hash.
 * @returns the salt and derived key.
 */
function hashPassword(password: string): PasswordRecord {
  const salt = randomBytes(16)
  return { salt, hash: scryptSync(password, salt, SCRYPT_KEY_LEN) }
}

/**
 * Verify one plaintext password against a stored salt/hash in constant time.
 * @param record - the stored salt and derived key.
 * @param password - the candidate plaintext.
 * @returns whether the candidate derives the stored key.
 */
async function verifyPassword(record: PasswordRecord, password: string): Promise<boolean> {
  const candidate = await scryptAsync(password, record.salt, SCRYPT_KEY_LEN) as Buffer
  return safeEqual(record.hash, candidate)
}

/**
 * Verify a credential pair without an early exit on the username: the password
 * is always derived so the two branches are indistinguishable by timing.
 * @param record - the stored password hash.
 * @param expectedUser - the accepted username.
 * @param user - the submitted username.
 * @param password - the submitted password.
 * @returns whether both match.
 */
async function checkCredentials(
  record: PasswordRecord,
  expectedUser: string,
  user: string,
  password: string,
): Promise<boolean> {
  const userOk = safeStringEqual(expectedUser, user)
  const passwordOk = await verifyPassword(record, password)
  return userOk && passwordOk
}

/**
 * Sign one session token: `base64url(payload).base64url(hmac(payload))`.
 * @param secret - the session HMAC key.
 * @param exp - expiry as Unix epoch milliseconds.
 * @returns the wire token.
 */
function signSession(secret: Buffer, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp } satisfies SessionPayload), 'utf8').toString('base64url')
  return `${payload}.${hmac(secret, payload).toString('base64url')}`
}

/**
 * Verify one session token's signature and expiry in constant time.
 * @param secret - the session HMAC key.
 * @param token - the wire token.
 * @param now - the current Unix epoch milliseconds.
 * @returns whether the token is well-formed, signed, and unexpired.
 */
function verifySession(secret: Buffer, token: string, now: number): boolean {
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  try {
    // A malformed base64url signature or payload is an invalid token, never a throw.
    if (!safeEqual(hmac(secret, payload), Buffer.from(signature, 'base64url'))) return false
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionPayload>
    return typeof parsed.exp === 'number' && parsed.exp > now
  } catch {
    return false
  }
}

/** Read one cookie value from a request's Cookie header. */
function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== name) continue
    return part.slice(eq + 1).trim()
  }
  return undefined
}

/**
 * Resolve the per-client rate-limit key for one login request: the socket peer
 * address, or the first `X-Forwarded-For` entry when the deployment trusts its
 * proxy. An absent, non-string, or empty forwarded value falls back to the peer.
 * @param req - the node:http request.
 * @param trustProxy - whether to honor `X-Forwarded-For`.
 * @returns a stable per-client key.
 */
function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  /* v8 ignore next -- remoteAddress is always set on a live server socket; the '' arm only satisfies the optional type. */
  const peer = req.socket.remoteAddress ?? ''
  if (!trustProxy) return peer
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded !== 'string') return peer
  const first = forwarded.split(',', 1)[0]?.trim()
  return first === undefined || first === '' ? peer : first
}

/**
 * Render the self-contained login page.
 * @param error - when true, show the fixed invalid-credential message.
 * @returns the complete HTML document.
 */
function loginPage(error = false): string {
  const message = error ? '<p class="error">用户名或密码错误</p>' : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · DeepSeek Harness</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1115; color: #e6e6e6; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  form { width: 320px; display: grid; gap: 14px; }
  h1 { margin: 0 0 8px; font-size: 18px; text-align: center; font-weight: 600; }
  input { padding: 10px 12px; border: 1px solid #333; border-radius: 6px; background: #1a1d23; color: inherit; font: inherit; }
  button { padding: 10px; border: 0; border-radius: 6px; background: #4c8dff; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #3d7bf0; }
  .error { color: #ff6b6b; font-size: 13px; text-align: center; margin: 0; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>DeepSeek Harness</h1>
  <input name="username" type="text" placeholder="用户名" autocomplete="username" required autofocus>
  <input name="password" type="password" placeholder="密码" autocomplete="current-password" required>
  ${message}
  <button type="submit">登录</button>
</form>
</body>
</html>`
}

/** Read a bounded request body as UTF-8. */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_LOGIN_BODY_BYTES) throw new Error('web-auth: login body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Parse an application/x-www-form-urlencoded body into the two form fields. */
function parseForm(body: string): { username: string; password: string } | undefined {
  try {
    const fields = new Map<string, string>()
    for (const pair of body.split('&')) {
      const eq = pair.indexOf('=')
      if (eq < 0) continue
      fields.set(
        decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' ')),
        decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' ')),
      )
    }
    const username = fields.get('username')
    const password = fields.get('password')
    if (username === undefined || password === undefined) return undefined
    return { username, password }
  } catch {
    return undefined
  }
}

/**
 * Mount the login gate: a request gate and an upgrade gate that admit only
 * authenticated requests, plus the `/login` and `/logout` routes. The gate
 * allowlists `/login` and `/logout` so those routes answer unauthenticated
 * requests; every other path redirects (browser GET) or 401s (API and the
 * upgrade downlinks). Login POSTs pass a per-client fixed-window rate limit
 * before credentials are read.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const record = hashPassword(config.password)
  const secret = config.sessionSecret === '' ? randomBytes(32) : Buffer.from(config.sessionSecret, 'utf8')
  const cookieName = config.cookieName
  const ttlMs = config.sessionTtlMs
  const secureFlag = config.cookieSecure ? '; Secure' : ''

  const isAuthenticated = (req: IncomingMessage): boolean => {
    const token = readCookie(req, cookieName)
    return token !== undefined && verifySession(secret, token, Date.now())
  }

  const setSessionCookie = (res: ServerResponse): void => {
    const token = signSession(secret, Date.now() + ttlMs)
    const maxAge = Math.floor(ttlMs / 1000)
    res.setHeader('set-cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${String(maxAge)}${secureFlag}`)
  }

  const clearSessionCookie = (res: ServerResponse): void => {
    res.setHeader('set-cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag}`)
  }

  // Fixed-window login-attempt counter per client key, pruned lazily on access.
  const windowMs = config.loginWindowMs
  const maxAttempts = config.loginMaxAttempts
  const attempts = new Map<string, { windowStart: number; count: number }>()

  /**
   * Decide whether one login attempt may proceed.
   * @param key - the client key.
   * @param now - the current Unix epoch milliseconds.
   * @returns 0 to allow, else the milliseconds until the window resets.
   */
  const rateLimit = (key: string, now: number): number => {
    const entry = attempts.get(key)
    if (entry === undefined) return 0
    if (now - entry.windowStart >= windowMs) {
      attempts.delete(key)
      return 0
    }
    return entry.count >= maxAttempts ? entry.windowStart + windowMs - now : 0
  }

  /** Record one login attempt, opening or resetting the window as needed. */
  const recordAttempt = (key: string, now: number): void => {
    const entry = attempts.get(key)
    if (entry === undefined || now - entry.windowStart >= windowMs) {
      attempts.set(key, { windowStart: now, count: 1 })
      /* v8 ignore next 3 -- the 10_000-key eviction is a memory cap; exercising it needs a synthetic multi-key fixture. */
      if (attempts.size > MAX_TRACKED_KEYS) {
        const oldest = attempts.keys().next().value as string
        attempts.delete(oldest)
      }
      return
    }
    entry.count += 1
  }

  ctx.effect(() => ctx.webServer.registerGate({
    handle(req, res) {
      if (isAuthenticated(req)) return true
      /* v8 ignore next -- node:http always sets url on server requests. */
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (pathname === '/login' || pathname === '/logout') return true
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        res.writeHead(401, { 'cache-control': 'no-store' })
        res.end('unauthorized')
        return false
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.writeHead(302, { location: '/login', 'cache-control': 'no-store' })
        res.end()
        return false
      }
      res.writeHead(401, { 'cache-control': 'no-store' })
      res.end('unauthorized')
      return false
    },
  }), 'web-auth: request gate')

  ctx.effect(() => ctx.webServer.registerUpgradeGate({
    handle(req, socket) {
      if (isAuthenticated(req)) return true
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return false
    },
  }), 'web-auth: upgrade gate')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/login',
    handler: async (req, res) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(loginPage())
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const now = Date.now()
      const key = clientKey(req, config.trustProxyHeaders)
      const retryMs = rateLimit(key, now)
      if (retryMs > 0) {
        res.writeHead(429, {
          'retry-after': String(Math.ceil(retryMs / 1000)),
          'cache-control': 'no-store',
        })
        res.end('尝试过于频繁，请稍后再试')
        return
      }
      recordAttempt(key, now)
      const fields = parseForm(await readBody(req))
      if (fields !== undefined && await checkCredentials(record, config.username, fields.username, fields.password)) {
        setSessionCookie(res)
        res.writeHead(302, { location: '/', 'cache-control': 'no-store' })
        res.end()
        return
      }
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(loginPage(true))
    },
  }), 'web-auth: /login route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/logout',
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      clearSessionCookie(res)
      res.writeHead(302, { location: '/login', 'cache-control': 'no-store' })
      res.end()
    },
  }), 'web-auth: /logout route')
}
