import { describe, it, expect, beforeEach } from "vitest";
import { useHistoryStore } from "./history.svelte.ts";

const STORAGE_RECENT = "glim-reader-recent";

// localStorage mock：同时统计 recent 键的写入次数（验证批量只写一次）
const mockStorage: Record<string, string> = {};
let recentWrites = 0;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      if (k === STORAGE_RECENT) recentWrites += 1;
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
    clear: () => {
      for (const k in mockStorage) delete mockStorage[k];
    },
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  },
});

describe("useHistoryStore", () => {
  beforeEach(() => {
    // 模块级单例：直接清空状态（不经 clearRecent，避免写入计数被污染）
    const s = useHistoryStore();
    s.recent = [];
    s.scrollMap = {};
    for (const k in mockStorage) delete mockStorage[k];
    recentWrites = 0;
  });

  it("pushRecent 置顶并去重", () => {
    const s = useHistoryStore();
    s.pushRecent("/a.md");
    s.pushRecent("/b.md");
    s.pushRecent("/a.md");
    expect(s.recent.map((x) => x.path)).toEqual(["/a.md", "/b.md"]);
  });

  it("pushRecentBatch 按传入顺序置顶、去重，且只写一次 localStorage", () => {
    const s = useHistoryStore();
    s.pushRecent("/old.md");
    recentWrites = 0; // 重置计数，只统计本次批量

    s.pushRecentBatch(["/c.md", "/a.md", "/c.md", "/b.md"]);

    // 与逐条 pushRecent 的语义一致：最后传入的路径最先展示（最近打开），旧项保留在后
    expect(s.recent.map((x) => x.path)).toEqual([
      "/b.md",
      "/a.md",
      "/c.md",
      "/old.md",
    ]);
    // 与 N 次 pushRecent（N 次写入）相比，批量只写一次
    expect(recentWrites).toBe(1);
  });

  it("pushRecentBatch 尊重 MAX_RECENT 上限", () => {
    const s = useHistoryStore();
    const paths = Array.from({ length: 25 }, (_, i) => `/f${i}.md`);
    s.pushRecentBatch(paths);
    expect(s.recent.length).toBe(20);
    // 反转置顶：最后传入的 /f24.md 在最前
    expect(s.recent[0].path).toBe("/f24.md");
    expect(s.recent[19].path).toBe("/f5.md");
  });

  it("pushRecentBatch 空数组不写存储", () => {
    const s = useHistoryStore();
    s.pushRecentBatch([]);
    expect(recentWrites).toBe(0);
  });
});
