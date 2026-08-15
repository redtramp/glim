import { defineStore } from "pinia";
import { ref } from "vue";
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

export const useHistoryStore = defineStore("history", () => {
  const recent = ref<RecentItem[]>(loadJson<RecentItem[]>(STORAGE_RECENT, []));
  const scrollMap = ref<Record<string, number | ScrollEntry>>(
    loadJson<Record<string, number | ScrollEntry>>(STORAGE_SCROLL, {})
  );

  function pushRecent(path: string) {
    if (!path) return;
    const list = recent.value.filter((x) => x.path !== path);
    list.unshift({ path, name: basename(path), ts: Date.now() });
    recent.value = list.slice(0, MAX_RECENT);
    saveJson(STORAGE_RECENT, recent.value);
  }

  /**
   * 批量追加最近打开（多文档恢复用），只写一次 localStorage，避免恢复 N 个文件时
   * 重复 JSON 序列化（saveJson 每文件一次）。
   *
   * 对去重后的输入，语义与循环调用 pushRecent(paths[i]) 一致（最后传入的路径最先展示），
   * 因此这里将 additions 反转后置顶。调用方应先对输入去重（restoreTabs 已用 Set 去重）。
   */
  function pushRecentBatch(paths: string[]) {
    if (!paths.length) return;
    const seen = new Set<string>();
    const additions: RecentItem[] = [];
    const now = Date.now();
    for (const path of paths) {
      if (!path || seen.has(path)) continue;
      seen.add(path);
      additions.push({ path, name: basename(path), ts: now });
    }
    if (!additions.length) return;
    recent.value = [
      ...additions.reverse(),
      ...recent.value.filter((x) => !seen.has(x.path)),
    ].slice(0, MAX_RECENT);
    saveJson(STORAGE_RECENT, recent.value);
  }

  function clearRecent() {
    recent.value = [];
    saveJson(STORAGE_RECENT, []);
  }

  function saveScroll(path: string, top: number) {
    if (!path) return;
    scrollMap.value[path] = { top, ts: Date.now() };
    const keys = Object.keys(scrollMap.value);
    if (keys.length > MAX_SCROLL_ENTRIES) {
      keys.sort((a, b) => {
        const ea = scrollMap.value[a];
        const eb = scrollMap.value[b];
        const ta = typeof ea === "number" ? 0 : ea?.ts ?? 0;
        const tb = typeof eb === "number" ? 0 : eb?.ts ?? 0;
        return ta - tb;
      });
      for (let i = 0; i < keys.length - MAX_SCROLL_ENTRIES; i++) {
        delete scrollMap.value[keys[i]];
      }
    }
    saveJson(STORAGE_SCROLL, scrollMap.value);
  }

  function getScroll(path: string): number {
    return scrollTopOf(scrollMap.value[path]);
  }

  return { recent, pushRecent, pushRecentBatch, clearRecent, saveScroll, getScroll };
});
