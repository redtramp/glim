/**
 * BookmarkPanel 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 空状态:显示提示、无清除按钮
 * - 分组渲染:按文件分组、计数徽标、组头(文件名+目录)、条目内容
 * - 交互:点击条目回调 jump、删除按钮 stopPropagation 后移除、清除全部需确认并回调 refresh
 * - showCurrentOnly:仅显示当前文件书签;当前文件分组置顶;active 高亮
 * - 时间格式化:minutesAgo / hoursAgo
 *
 * 迁移注意:useBookmarks.svelte.ts 的模块级 $state 在 import 时读一次
 * localStorage,而种子写入发生在 it() 内 → mountPanel 必须显式 reload()。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import BookmarkPanel from "./BookmarkPanel.svelte";
import {
  useBookmarks,
  type Bookmark,
} from "../composables/useBookmarks.svelte.ts";

const STORAGE_KEY = "glim-reader-bookmarks";

// ---- localStorage mock（useBookmarks 持久化依赖） ----
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => {
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

// Mock 自研 i18n（原 vue-i18n 实例的等价迁移;minutesAgo/hoursAgo 带 {n} 插值）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "float.bookmark": "书签",
      "float.clear": "清除",
      "float.noBookmarks": "暂无书签",
      "float.clearBookmarks": "清除所有书签",
      "float.clearBookmarksConfirm": "确定要清除所有书签吗？",
      "float.removeBookmark": "删除书签",
      "float.minutesAgo": "{n} 分钟前",
      "float.hoursAgo": "{n} 小时前",
    };
    let text = map[key] ?? key;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (m, k) =>
        k in params ? String(params[k]) : m
      );
    }
    return text;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

function makeBookmark(overrides: Partial<Bookmark>): Bookmark {
  return {
    id: `bm-${Math.random().toString(36).slice(2, 8)}`,
    filePath: "/root/a.md",
    scrollTop: 100,
    label: "第一章",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("BookmarkPanel", () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k in mockStorage) delete mockStorage[k];
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    confirmSpy.mockRestore();
    vi.clearAllMocks();
  });

  function seedBookmarks(items: Bookmark[]) {
    mockStorage[STORAGE_KEY] = JSON.stringify(items);
  }

  function mountPanel(
    opts: { currentPath?: string; showCurrentOnly?: boolean } = {}
  ) {
    // 模块级 $state 只在 import 时读一次存储,故每次挂载前刷新
    useBookmarks().reload();
    const onJump = vi.fn();
    const onRefresh = vi.fn();
    const result = render(BookmarkPanel, {
      props: {
        currentPath: opts.currentPath ?? undefined,
        showCurrentOnly: opts.showCurrentOnly ?? false,
        onJump,
        onRefresh,
      },
    });
    return { ...result, onJump, onRefresh };
  }

  describe("空状态", () => {
    it("无书签时显示提示且无清除按钮", () => {
      const { container } = mountPanel();
      expect(container.querySelector(".bm-empty")!.textContent).toBe(
        "暂无书签"
      );
      expect(container.querySelector(".bm-clear")).toBeNull();
      expect(container.querySelector(".bm-count")).toBeNull();
    });
  });

  describe("分组渲染", () => {
    it("按文件分组并显示计数徽标", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "第一节" }),
        makeBookmark({ filePath: "/root/a.md", label: "第二节" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 开头" }),
      ]);
      const { container } = mountPanel();
      expect(container.querySelectorAll(".bm-group")).toHaveLength(2);
      expect(container.querySelector(".bm-count")!.textContent).toBe("3");
    });

    it("组头显示文件名与目录", () => {
      seedBookmarks([makeBookmark({ filePath: "/root/deep/a.md" })]);
      const { container } = mountPanel();
      expect(container.querySelector(".bm-group-file")!.textContent).toBe(
        "a.md"
      );
      expect(container.querySelector(".bm-group-dir")!.textContent).toBe(
        "/root/deep"
      );
    });

    it("组内条目按 scrollTop 排序", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", scrollTop: 500, label: "下" }),
        makeBookmark({ filePath: "/root/a.md", scrollTop: 100, label: "上" }),
      ]);
      const { container } = mountPanel();
      const labels = Array.from(
        container.querySelectorAll(".bm-item-label")
      ).map((el) => el.textContent);
      expect(labels).toEqual(["上", "下"]);
    });
  });

  describe("交互", () => {
    it("点击条目回调 jump(path, scrollTop)", async () => {
      seedBookmarks([makeBookmark({ filePath: "/root/a.md", scrollTop: 42 })]);
      const { container, onJump } = mountPanel();
      await fireEvent.click(container.querySelector(".bm-item")!);
      expect(onJump).toHaveBeenCalledWith("/root/a.md", 42);
    });

    it("删除按钮 stopPropagation 后移除书签", async () => {
      const bm = makeBookmark({ label: "待删" });
      seedBookmarks([bm]);
      const { container, onJump } = mountPanel();
      await fireEvent.click(container.querySelector(".bm-item-remove")!);
      // 点击删除不应触发 jump
      expect(onJump).not.toHaveBeenCalled();
      expect(container.querySelector(".bm-empty")).not.toBeNull();
      const stored = JSON.parse(mockStorage[STORAGE_KEY] ?? "[]") as Bookmark[];
      expect(stored.some((x) => x.id === bm.id)).toBe(false);
    });

    it("清除全部需确认,确认后清空并回调 refresh", async () => {
      seedBookmarks([
        makeBookmark({ label: "一" }),
        makeBookmark({ label: "二" }),
      ]);
      const { container, onRefresh } = mountPanel();
      await fireEvent.click(container.querySelector(".bm-clear")!);
      expect(confirmSpy).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
      expect(container.querySelector(".bm-empty")).not.toBeNull();
      expect(mockStorage[STORAGE_KEY]).toBe("[]");
    });

    it("清除全部取消确认时不动作", async () => {
      confirmSpy.mockReturnValue(false);
      seedBookmarks([makeBookmark({ label: "保留" })]);
      const { container, onRefresh } = mountPanel();
      await fireEvent.click(container.querySelector(".bm-clear")!);
      expect(onRefresh).not.toHaveBeenCalled();
      expect(container.querySelectorAll(".bm-item")).toHaveLength(1);
    });

    it("无书签时点清除按钮不弹确认", () => {
      const { container } = mountPanel();
      expect(container.querySelector(".bm-clear")).toBeNull();
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  describe("showCurrentOnly", () => {
    it("仅显示当前文件的书签", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
      ]);
      const { container } = mountPanel({
        currentPath: "/root/a.md",
        showCurrentOnly: true,
      });
      expect(container.querySelectorAll(".bm-group")).toHaveLength(1);
      expect(container.querySelector(".bm-item-label")!.textContent).toBe(
        "A 书签"
      );
    });

    it("当前文件分组在全部模式下置顶", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
      ]);
      const { container } = mountPanel({ currentPath: "/root/a.md" });
      const files = Array.from(
        container.querySelectorAll(".bm-group-file")
      ).map((el) => el.textContent);
      expect(files).toEqual(["a.md", "b.md"]);
    });

    it("当前文件的书签条目带 active 高亮", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
      ]);
      const { container } = mountPanel({ currentPath: "/root/a.md" });
      const items = container.querySelectorAll(".bm-item");
      expect(items[0].classList.contains("active")).toBe(true);
      expect(items[1].classList.contains("active")).toBe(false);
    });
  });

  describe("时间格式化", () => {
    it("1 小时内显示 minutesAgo", () => {
      seedBookmarks([makeBookmark({ createdAt: Date.now() - 5 * 60000 })]);
      const { container } = mountPanel();
      expect(container.querySelector(".bm-item-ts")!.textContent).toBe(
        "5 分钟前"
      );
    });

    it("超过 1 小时显示 hoursAgo", () => {
      seedBookmarks([
        makeBookmark({ createdAt: Date.now() - 3 * 3600 * 1000 }),
      ]);
      const { container } = mountPanel();
      expect(container.querySelector(".bm-item-ts")!.textContent).toBe(
        "3 小时前"
      );
    });
  });
});
