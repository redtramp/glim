import { ref } from "vue";
import { basename } from "../utils/path";

const STORAGE_RECENT = "glim-reader-recent";
const STORAGE_SCROLL = "glim-reader-scroll-positions";
const MAX_RECENT = 20;
const MAX_SCROLL_ENTRIES = 100;

export interface RecentItem {
  path: string;
  name: string;
  ts: number;
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

function loadScrollMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_SCROLL);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

const recent = ref<RecentItem[]>(loadRecent());
const scrollMap = ref<Record<string, number | ScrollEntry>>(loadScrollMap());

interface ScrollEntry {
  top: number;
  ts: number;
}


function pushRecent(path: string) {
  if (!path) return;
  const list = recent.value.filter((x) => x.path !== path);
  list.unshift({ path, name: basename(path), ts: Date.now() });
  recent.value = list.slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_RECENT, JSON.stringify(recent.value));
}

function clearRecent() {
  recent.value = [];
  localStorage.setItem(STORAGE_RECENT, "[]");
}

/** 读滚动位置,兼容旧格式(纯数字)与当前格式({ top, ts }) */
function scrollTopOf(entry: number | ScrollEntry | undefined): number {
  if (entry == null) return 0;
  if (typeof entry === "number") return entry;
  return entry.top || 0;
}

function saveScroll(path: string, top: number) {
  if (!path) return;
  scrollMap.value[path] = { top, ts: Date.now() };
  const keys = Object.keys(scrollMap.value);
  if (keys.length > MAX_SCROLL_ENTRIES) {
    // 按最近访问时间升序淘汰最旧的条目,直到回到容量上限(时间戳 LRU)
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
  localStorage.setItem(STORAGE_SCROLL, JSON.stringify(scrollMap.value));
}

function getScroll(path: string): number {
  return scrollTopOf(scrollMap.value[path]);
}

export function useHistory() {
  return { recent, pushRecent, clearRecent, saveScroll, getScroll };
}
