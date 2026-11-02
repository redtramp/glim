import { basename } from "../utils/path";
import { loadJson, saveJson } from "../utils/storage";

const STORAGE_RECENT = "glim-reader-recent";
const STORAGE_SCROLL = "glim-reader-scroll-positions";
const MAX_RECENT = 20;
const MAX_SCROLL_ENTRIES = 100;

export interface RecentItem {
  path: string;
  name: string;
  ts: number;
}

interface ScrollEntry {
  top: number;
  ts: number;
}

function scrollTopOf(entry: number | ScrollEntry | undefined): number {
  if (entry == null) return 0;
  if (typeof entry === "number") return entry;
  return entry.top || 0;
}

/**
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 方法内联在 state 字面量上，保持旧实例全量 surface。
 */
export const historyState = $state({
  recent: loadJson<RecentItem[]>(STORAGE_RECENT, []),
  scrollMap: loadJson<Record<string, number | ScrollEntry>>(STORAGE_SCROLL, {}),

  pushRecent(path: string) {
    if (!path) return;
    const list = historyState.recent.filter((x) => x.path !== path);
    list.unshift({ path, name: basename(path), ts: Date.now() });
    historyState.recent = list.slice(0, MAX_RECENT);
    saveJson(STORAGE_RECENT, historyState.recent);
  },

  /**
   * 批量追加最近打开（多文档恢复用），只写一次 localStorage，避免恢复 N 个文件时
   * 重复 JSON 序列化（saveJson 每文件一次）。
   *
   * 对去重后的输入，语义与循环调用 pushRecent(paths[i]) 一致（最后传入的路径最先展示），
   * 因此这里将 additions 反转后置顶。调用方应先对输入去重（restoreTabs 已用 Set 去重）。
   */
  pushRecentBatch(paths: string[]) {
    if (!paths.length) return;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 局部过程集合，无响应式依赖（与原 vue 行为一致）
    const seen = new Set<string>();
    const additions: RecentItem[] = [];
    const now = Date.now();
    for (const path of paths) {
      if (!path || seen.has(path)) continue;
      seen.add(path);
      additions.push({ path, name: basename(path), ts: now });
    }
    if (!additions.length) return;
    historyState.recent = [
      ...additions.reverse(),
      ...historyState.recent.filter((x) => !seen.has(x.path)),
    ].slice(0, MAX_RECENT);
    saveJson(STORAGE_RECENT, historyState.recent);
  },

  clearRecent() {
    historyState.recent = [];
    saveJson(STORAGE_RECENT, []);
  },

  saveScroll(path: string, top: number) {
    if (!path) return;
    historyState.scrollMap[path] = { top, ts: Date.now() };
    const keys = Object.keys(historyState.scrollMap);
    if (keys.length > MAX_SCROLL_ENTRIES) {
      keys.sort((a, b) => {
        const ea = historyState.scrollMap[a];
        const eb = historyState.scrollMap[b];
        const ta = typeof ea === "number" ? 0 : ea?.ts ?? 0;
        const tb = typeof eb === "number" ? 0 : eb?.ts ?? 0;
        return ta - tb;
      });
      for (let i = 0; i < keys.length - MAX_SCROLL_ENTRIES; i++) {
        delete historyState.scrollMap[keys[i]];
      }
    }
    saveJson(STORAGE_SCROLL, historyState.scrollMap);
  },

  getScroll(path: string): number {
    return scrollTopOf(historyState.scrollMap[path]);
  },
});

/** 兼容旧调用形状: const store = useHistoryStore(); store.recent */
export function useHistoryStore() {
  return historyState;
}
