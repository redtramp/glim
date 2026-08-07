import { readFile } from "@tauri-apps/plugin-fs";
// 外部图片抓取必须走 Tauri http 插件(原生 reqwest):webview fetch 受 CSP
// connect-src(默认回退 default-src 'self')限制,会被打包版应用拦截,与
// aiProvider 的既有约定一致。
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const TAURI_ASSET_PATTERNS = [
  /^https?:\/\/asset\.localhost\//i,
  /^asset:\/\/localhost\//i,
  /^https?:\/\/[^/]+\.localhost\/+/i,
];

function isExternal(src: string): boolean {
  return /^(https?:|data:|blob:|mailto:|tel:)/i.test(src);
}

function decodeTauriAsset(src: string): string | null {
  for (const re of TAURI_ASSET_PATTERNS) {
    if (re.test(src)) {
      const rest = src.replace(re, "");
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }
  return null;
}

function extFromPath(p: string): string {
  const m = p.match(/\.([A-Za-z0-9]+)(?:\?|#|$)/);
  return m ? m[1].toLowerCase() : "";
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "webp": return "image/webp";
    case "bmp": return "image/bmp";
    default: return "application/octet-stream";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(bin);
}

/**
 * 私网/回环地址防护:图片抓取现经 Tauri http 插件(原生 reqwest)发出,不再受
 * CSP connect-src 限制,本函数是防止文档中的图片 URL 被用于 SSRF 的主要防线
 * (capability 仅放行 https://** 与回环地址,不覆盖 10.x/172.16-31.x 等私网段)。
 */
function isPrivateUrl(url: string): boolean {
  let u: InstanceType<typeof globalThis.URL>;
  try {
    u = new globalThis.URL(url);
  } catch {
    return true;
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const ipv4Host = mapped ? mapped[1] : host;
  const v4 = ipv4Host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((s) => Number.parseInt(s, 10));
    if (octets.some((n) => n > 255)) return true;
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host === "0:0:0:0:0:0:0:0" ||
      host === "0:0:0:0:0:0:0:1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    );
  }
  return false;
}

/** 外部图片抓取超时(ms):防止慢速网络阻塞导出 */
const FETCH_TIMEOUT_MS = 8_000;
/** 外部图片大小上限:超过则放弃内联,避免内存峰值(base64 膨胀 ~33%) */
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (isPrivateUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await tauriFetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    const length = Number(r.headers.get("content-length") || 0);
    if (length > MAX_FETCH_BYTES) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > MAX_FETCH_BYTES) return null;
    const ct = r.headers.get("content-type") || mimeFromExt(extFromPath(url));
    return `data:${ct};base64,${bytesToBase64(buf)}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalAsDataUrl(absPath: string): Promise<string | null> {
  try {
    const bytes = await readFile(absPath);
    const u8 =
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as any);
    const ext = extFromPath(absPath);
    return `data:${mimeFromExt(ext)};base64,${bytesToBase64(u8)}`;
  } catch {
    return null;
  }
}

export async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      const local = decodeTauriAsset(src);
      if (local) {
        const d = await readLocalAsDataUrl(local);
        if (d) img.setAttribute("src", d);
        return;
      }
      if (isExternal(src)) {
        const d = await fetchAsDataUrl(src);
        if (d) img.setAttribute("src", d);
      }
    })
  );
}

export function ensureSvgNamespace(root: HTMLElement): void {
  root.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    if (!svg.getAttribute("xmlns")) {
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
  });
}
