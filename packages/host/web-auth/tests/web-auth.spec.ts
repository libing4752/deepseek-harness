/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver and web-auth rows, and every assertion
 * observes the served HTTP surface — the login gate (302/401/upgrade denial),
 * the /login and /logout routes, session-token verification (signature,
 * malformation, expiry), and request-body/method bounds.
 */

import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import HttpServer from '@deepseek-ai/dsh-host-webserver'
import * as WebAuth from '../src/index.ts'

const SECRET = 'test-secret-0123456789abcdef'
const USERNAME = 'admin'
const PASSWORD = 'correct horse battery staple'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Auth config overrides the composition uses beyond the shared defaults. */
interface AuthOverrides {
  sessionSecret?: string
  sessionTtlMs?: number
  cookieSecure?: boolean
  loginWindowMs?: number
  loginMaxAttempts?: number
  trustProxyHeaders?: boolean
}

/** Write a two-row cordis.yml and boot it through the real Loader. */
async function loadComposition(overrides: AuthOverrides = {}): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-web-auth-'))
  const authConfig = [
    `    username: '${USERNAME}'`,
    `    password: '${PASSWORD}'`,
    `    sessionSecret: '${overrides.sessionSecret ?? SECRET}'`,
    `    cookieSecure: ${String(overrides.cookieSecure ?? false)}`,
  ]
  if (overrides.sessionTtlMs !== undefined) authConfig.push(`    sessionTtlMs: ${String(overrides.sessionTtlMs)}`)
  if (overrides.loginWindowMs !== undefined) authConfig.push(`    loginWindowMs: ${String(overrides.loginWindowMs)}`)
  if (overrides.loginMaxAttempts !== undefined) authConfig.push(`    loginMaxAttempts: ${String(overrides.loginMaxAttempts)}`)
  if (overrides.trustProxyHeaders !== undefined) authConfig.push(`    trustProxyHeaders: ${String(overrides.trustProxyHeaders)}`)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    '- id: auth',
    "  name: '@deepseek-ai/dsh-host-web-auth'",
    '  config:',
    ...authConfig,
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', HttpServer],
    ['@deepseek-ai/dsh-host-web-auth', WebAuth],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

/** Mount observable routes behind the gate so authenticated dispatch is visible. */
function mountRoutes(loaded: Context): void {
  loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('SHELL') })
  loaded.webServer.register({ kind: 'prefix', path: '/api', handler: (_req, res) => { res.writeHead(200); res.end('API') } })
  loaded.webServer.registerUpgrade({
    path: '/events',
    handler: (_req, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: dsh-test\r\n\r\n')
    },
  })
}

/** One HTTP request against the running server (redirects never followed). */
async function request(port: number, path: string, init?: RequestInit): Promise<{ status: number; headers: Headers; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, { redirect: 'manual', ...init })
  return { status: response.status, headers: response.headers, body: await response.text() }
}

/** Submit the login form; returns status, the Set-Cookie header, and the body. */
async function login(port: number, username: string, password: string): Promise<{ status: number; cookie: string | null; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
  })
  return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.text() }
}

/** Submit the login form and return the full response (status, headers, body). */
async function loginRaw(port: number, username: string, password: string): Promise<{ status: number; headers: Headers; body: string }> {
  return request(port, '/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
  })
}

/** The `name=value` prefix of a Set-Cookie header (the part to echo back). */
function cookieValue(setCookie: string | null): string | null {
  if (setCookie === null) return null
  return setCookie.split(';', 1)[0] ?? null
}

/** Open one raw upgrade request and return the server's first response bytes. */
async function rawUpgrade(port: number, path: string, cookie?: string): Promise<string> {
  const socket = connect(port, '127.0.0.1')
  await once(socket, 'connect')
  const response = once(socket, 'data')
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${String(port)}`,
    'Connection: Upgrade',
    'Upgrade: dsh-test',
  ]
  if (cookie !== undefined) lines.push(`Cookie: ${cookie}`)
  lines.push('', '')
  socket.write(lines.join('\r\n'))
  const [data] = await response as [Buffer]
  const text = String(data)
  socket.destroy()
  return text
}

/** Open one upgrade request and return the accepted socket (101 asserted). */
async function upgrade(port: number, path: string, cookie?: string): Promise<ReturnType<typeof connect>> {
  const socket = connect(port, '127.0.0.1')
  await once(socket, 'connect')
  const response = once(socket, 'data')
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${String(port)}`,
    'Connection: Upgrade',
    'Upgrade: dsh-test',
  ]
  if (cookie !== undefined) lines.push(`Cookie: ${cookie}`)
  lines.push('', '')
  socket.write(lines.join('\r\n'))
  const [data] = await response as [Buffer]
  expect(String(data)).toContain('101 Switching Protocols')
  return socket
}

/** Sign one test session token with the shared secret (mirrors the plugin's format). */
function signPayload(secret: string, payload: string): string {
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

/** Base64url-encode one string. */
function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

describe('real Loader composition', () => {
  it('gates unauthenticated access and completes the login/logout flow', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    mountRoutes(loaded)
    const port = loaded.webServer.port

    // Unauthenticated browser GETs redirect to /login; /api and upgrades 401.
    const root = await request(port, '/')
    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('/login')
    expect(await request(port, '/api/session.create')).toMatchObject({ status: 401 })
    expect(await request(port, '/api')).toMatchObject({ status: 401 })
    expect(await rawUpgrade(port, '/events')).toContain('401 Unauthorized')

    // The login page serves on GET with no error before a failed attempt.
    const page = await request(port, '/login')
    expect(page.status).toBe(200)
    expect(page.body).toContain('用户名')
    expect(page.body).not.toContain('用户名或密码错误')

    // Wrong password and wrong username both fail with the same generic message.
    expect(await login(port, USERNAME, 'wrong')).toMatchObject({ status: 401 })
    expect((await login(port, USERNAME, 'wrong')).body).toContain('用户名或密码错误')
    expect(await login(port, 'nobody', PASSWORD)).toMatchObject({ status: 401 })

    // A correct login issues the session cookie and redirects to /.
    const good = await login(port, USERNAME, PASSWORD)
    expect(good.status).toBe(302)
    const cookie = cookieValue(good.cookie)
    expect(cookie).not.toBeNull()
    expect(good.cookie).toContain('HttpOnly')
    expect(good.cookie).toContain('SameSite=Strict')

    // Authenticated requests reach routing: fallback, /api, and the upgrade.
    expect(await request(port, '/', { headers: { cookie: cookie! } })).toMatchObject({ status: 200, body: 'SHELL' })
    expect(await request(port, '/api/session.create', { headers: { cookie: cookie! } })).toMatchObject({ status: 200, body: 'API' })
    const upgraded = await upgrade(port, '/events', cookie!)
    upgraded.destroy()

    // Logout clears the cookie client-side and redirects to the login page.
    const loggedOut = await request(port, '/logout', { method: 'POST', headers: { cookie: cookie! } })
    expect(loggedOut.status).toBe(302)
    expect(loggedOut.headers.get('location')).toBe('/login')
    expect(loggedOut.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('verifies session tokens against signature, malformation, and expiry', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    mountRoutes(loaded)
    const port = loaded.webServer.port
    const now = Date.now()

    // Each rejected cookie answers 302 (unauthenticated); only a valid one reaches the fallback.
    const rejected = [
      'notoken', // no dot separator
      'abc.def', // signature length mismatch
      signPayload(SECRET, 'not-json'), // payload is not JSON
      signPayload(SECRET, b64url(JSON.stringify({ exp: 'abc' }))), // exp is not a number
      signPayload(SECRET, b64url(JSON.stringify({ exp: 1 }))), // already expired
    ]
    for (const token of rejected) {
      expect(await request(port, '/', { headers: { cookie: `dsh_web_session=${token}` } })).toMatchObject({ status: 302 })
    }

    const valid = signPayload(SECRET, b64url(JSON.stringify({ exp: now + 60_000 })))
    expect(await request(port, '/', { headers: { cookie: `dsh_web_session=${valid}` } })).toMatchObject({ status: 200, body: 'SHELL' })

    // Cookie headers without the session name (a mismatched name or a bare
    // token with no `=`) are ignored by the gate.
    expect(await request(port, '/', { headers: { cookie: 'other=value' } })).toMatchObject({ status: 302 })
    expect(await request(port, '/', { headers: { cookie: 'bare' } })).toMatchObject({ status: 302 })
  })

  it('supports an ephemeral session secret and the Secure cookie flag', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition({ sessionSecret: '', cookieSecure: true })
    mountRoutes(loaded)
    const port = loaded.webServer.port

    const good = await login(port, USERNAME, PASSWORD)
    expect(good.status).toBe(302)
    expect(good.cookie).toContain('Secure')
    const cookie = cookieValue(good.cookie)
    expect(cookie).not.toBeNull()
    expect(await request(port, '/', { headers: { cookie: cookie! } })).toMatchObject({ status: 200, body: 'SHELL' })
  })

  it('bounds the login body and answers non-form methods', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    mountRoutes(loaded)
    const port = loaded.webServer.port

    // A malformed form (bad %-escape) and a missing field both fail the login.
    const malformed = await request(port, '/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=%zz&password=x',
    })
    expect(malformed.status).toBe(401)
    const missing = await request(port, '/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${USERNAME}`,
    })
    expect(missing.status).toBe(401)

    // A bare form pair (no `=`) is skipped; the real fields still authenticate.
    const bare = await request(port, '/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${USERNAME}&password=${encodeURIComponent(PASSWORD)}&bare`,
    })
    expect(bare.status).toBe(302)

    // An oversized body is contained by the webserver (400), not a crash.
    const oversized = await request(port, '/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${'a'.repeat(9000)}&password=x`,
    })
    expect(oversized.status).toBe(400)

    // Non-GET/HEAD/POST on the login and logout routes answer 405.
    expect((await request(port, '/login', { method: 'PUT' })).status).toBe(405)
    expect((await request(port, '/logout', { method: 'GET' })).status).toBe(405)

    // The gate treats an unauthenticated HEAD like GET (302) and other
    // unauthenticated methods (non-API) as 401.
    expect((await request(port, '/', { method: 'HEAD' })).status).toBe(302)
    expect((await request(port, '/', { method: 'PUT' })).status).toBe(401)
  })

  it('rate-limits login submissions per client window', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition({ loginMaxAttempts: 2 })
    mountRoutes(loaded)
    const port = loaded.webServer.port

    // The first two attempts answer with the ordinary credential failure.
    expect((await loginRaw(port, USERNAME, 'wrong')).status).toBe(401)
    expect((await loginRaw(port, USERNAME, 'wrong')).status).toBe(401)
    // The third attempt is refused before credentials are read, with Retry-After.
    const blocked = await loginRaw(port, USERNAME, 'wrong')
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('keys the rate limit by X-Forwarded-For when the proxy is trusted', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition({ loginMaxAttempts: 1, trustProxyHeaders: true })
    mountRoutes(loaded)
    const port = loaded.webServer.port

    const attempt = (xff?: string): Promise<{ status: number }> =>
      request(port, '/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(xff === undefined ? {} : { 'x-forwarded-for': xff }),
        },
        body: new URLSearchParams({ username: USERNAME, password: 'wrong' }).toString(),
      })

    // maxAttempts=1: the second submission under one key is 429.
    expect((await attempt('1.2.3.4')).status).toBe(401)
    expect((await attempt('1.2.3.4')).status).toBe(429)
    // A different forwarded address is an independent key.
    expect((await attempt('5.6.7.8')).status).toBe(401)
    // Only the first forwarded entry counts as the key.
    expect((await attempt('9.9.9.9, 5.6.7.8')).status).toBe(401)
    // A missing forwarded header falls back to the shared peer key.
    expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(429)
    // A blank forwarded value also falls back to the (already exhausted) peer key.
    expect((await attempt('   ')).status).toBe(429)
  })

  it('resets the login window after it expires', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition({ loginMaxAttempts: 1, loginWindowMs: 1 })
    mountRoutes(loaded)
    const port = loaded.webServer.port

    expect((await loginRaw(port, USERNAME, 'wrong')).status).toBe(401)
    // The 1ms window has expired, so the counter resets instead of answering 429.
    await new Promise(resolve => setTimeout(resolve, 5))
    expect((await loginRaw(port, USERNAME, 'wrong')).status).toBe(401)
  })
})
