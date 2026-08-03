/**
 * 渲染结果缓存:内容哈希 + LRU 淘汰。
 *
 * 设计说明:
 * - 哈希采用 cyrb53(64 位双 32 位混合),无依赖、同步、快,适合渲染热路径;
 *   为降低哈希碰撞导致的错误命中,key 之外额外校验源长度,长度不一致视为未命中。
 * - markdown HTML 与主题无关(颜色由 CSS 控制),缓存键 = 源哈希。
 * - mermaid SVG 与主题相关(theme 变量注入到 SVG 内),缓存键 = theme + 代码哈希。
 * - LRU 基于 Map 插入序实现,命中即置顶,超限淘汰最久未用。
 */

/** 快速 64 位字符串哈希(cyrb53 变体),返回 16 位十六进制串 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

interface LRUEntry<V> {
  value: V;
  sourceLength: number;
}

/**
 * 带源长度校验的 LRU 缓存。
 * 命中条件:key 相同且源长度相同(进一步压低碰撞概率)。
 */
class LengthCheckedLRU<V> {
  private map = new Map<string, LRUEntry<V>>();

  constructor(private limit: number) {}

  get(key: string, sourceLength: number): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.sourceLength !== sourceLength) {
      // 哈希碰撞但长度不同:视为未命中并作废该条目
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, sourceLength: number): void {
    this.map.delete(key);
    this.map.set(key, { value, sourceLength });
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * markdown 渲染结果缓存:源哈希 → 净化后的 HTML。
 *
 * ⚠️ 主题维度说明:当前 markdown 渲染输出(含 hljs 高亮)只产出类名,颜色由 CSS
 * 按主题控制,因此 HTML 与主题无关,缓存键无需包含主题。若未来 markdown 渲染
 * 直接内联主题相关样式(如按主题切换高亮输出),此缓存键必须加入主题维度,
 * 否则会命中错误主题的 HTML。
 */
export const markdownHtmlCache = new LengthCheckedLRU<string>(10);

/** mermaid SVG 缓存:theme+代码哈希 → 净化后的 SVG(与主题相关) */
export const mermaidSvgCache = new LengthCheckedLRU<string>(80);

/** 计算 markdown 源缓存键与源长度 */
export function markdownCacheKey(source: string): { key: string; length: number } {
  return { key: cyrb53(source), length: source.length };
}

/** 计算 mermaid 代码缓存键(含主题)与代码长度 */
export function mermaidCacheKey(theme: string, code: string): { key: string; length: number } {
  return { key: `${theme}|${cyrb53(code)}`, length: code.length };
}
