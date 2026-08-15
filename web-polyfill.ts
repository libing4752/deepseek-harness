/**
 * web-polyfill —— 运行时向 index.html 注入 crypto.randomUUID polyfill。
 *
 * 背景：crypto.randomUUID 只在安全上下文（HTTPS 或 localhost）下存在。
 * 通过 HTTP + 公网 IP 访问时（如 http://106.54.173.31:15900）它是 undefined，
 * 导致 DSH 前端所有 RPC 调用（host.describe / session.list / workspace.create 等）
 * 失败。此插件通过 webserver 的 index tap 在每次 index 响应时注入 fallback，
 * 基于同级的 crypto.getRandomValues 实现，UUID v4 格式与原生一致。
 *
 * 幂等：仅当 index.html 尚不含标记时注入；dist 重建后也会自动重新注入。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** 标记与注入内容保持同步（start-web.sh 磁盘注入与这里的运行时注入共用该标记）。 */
const MARKER = 'data-dsh-randomuuid-polyfill'

const POLYFILL_SCRIPT = `<script ${MARKER}>
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function randomUUID() {
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  };
}
</script>\n`

/** Stable Cordis plugin name. */
export const name = 'web-polyfill'

/** 需要 webServer 服务以注册 index tap。 */
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.tapIndex((html: string): string => {
    if (html.includes(MARKER)) return html
    return html.replace('<head>', '<head>\n' + POLYFILL_SCRIPT)
  }), 'web-polyfill: index tap')
}
