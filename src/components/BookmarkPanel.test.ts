/**
 * BookmarkPanel 组件测试
 *
 * 测试目标:
 * - 空状态:显示提示、无清除按钮
 * - 分组渲染:按文件分组、计数徽标、组头(文件名+目录)、条目内容
 * - 交互:点击条目 emit jump、删除按钮 stopPropagation 后移除、清除全部需确认并 emit refresh
 * - showCurrentOnly:仅显示当前文件书签;当前文件分组置顶;active 高亮
 * - 时间格式化:minutesAgo / hoursAgo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import BookmarkPanel from "./BookmarkPanel.vue";
import type { Bookmark } from "../composables/useBookmarks.svelte.ts";

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

const i18n = createI18n({
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      float: {
        bookmark: "书签",
        clear: "清除",
        noBookmarks: "暂无书签",
        clearBookmarks: "清除所有书签",
        clearBookmarksConfirm: "确定要清除所有书签吗？",
        removeBookmark: "删除书签",
        minutesAgo: "{n} 分钟前",
        hoursAgo: "{n} 小时前",
      },
    },
  },
});

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
  let wrapper: VueWrapper;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k in mockStorage) delete mockStorage[k];
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    wrapper?.unmount();
    confirmSpy.mockRestore();
    vi.clearAllMocks();
  });

  function seedBookmarks(items: Bookmark[]) {
    mockStorage[STORAGE_KEY] = JSON.stringify(items);
  }

  function mountPanel(opts: { currentPath?: string; showCurrentOnly?: boolean } = {}) {
    wrapper = mount(BookmarkPanel, {
      global: { plugins: [i18n] },
      props: {
        currentPath: opts.currentPath ?? undefined,
        showCurrentOnly: opts.showCurrentOnly ?? false,
        "onJump": vi.fn(),
        "onRefresh": vi.fn(),
      },
    });
  }

  describe("空状态", () => {
    it("无书签时显示提示且无清除按钮", () => {
      mountPanel();
      expect(wrapper.find(".bm-empty").text()).toBe("暂无书签");
      expect(wrapper.find(".bm-clear").exists()).toBe(false);
      expect(wrapper.find(".bm-count").exists()).toBe(false);
    });
  });

  describe("分组渲染", () => {
    it("按文件分组并显示计数徽标", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "第一节" }),
        makeBookmark({ filePath: "/root/a.md", label: "第二节" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 开头" }),
      ]);
      mountPanel();
      expect(wrapper.findAll(".bm-group")).toHaveLength(2);
      expect(wrapper.find(".bm-count").text()).toBe("3");
    });

    it("组头显示文件名与目录", () => {
      seedBookmarks([makeBookmark({ filePath: "/root/deep/a.md" })]);
      mountPanel();
      expect(wrapper.find(".bm-group-file").text()).toBe("a.md");
      expect(wrapper.find(".bm-group-dir").text()).toBe("/root/deep");
    });

    it("组内条目按 scrollTop 排序", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", scrollTop: 500, label: "下" }),
        makeBookmark({ filePath: "/root/a.md", scrollTop: 100, label: "上" }),
      ]);
      mountPanel();
      const labels = wrapper.findAll(".bm-item-label").map((w) => w.text());
      expect(labels).toEqual(["上", "下"]);
    });
  });

  describe("交互", () => {
    it("点击条目 emit jump(path, scrollTop)", async () => {
      seedBookmarks([makeBookmark({ filePath: "/root/a.md", scrollTop: 42 })]);
      mountPanel();
      await wrapper.find(".bm-item").trigger("click");
      expect(wrapper.emitted("jump")![0]).toEqual(["/root/a.md", 42]);
    });

    it("删除按钮 stopPropagation 后移除书签", async () => {
      const bm = makeBookmark({ label: "待删" });
      seedBookmarks([bm]);
      mountPanel();
      await wrapper.find(".bm-item-remove").trigger("click");
      // 点击删除不应触发 jump
      expect(wrapper.emitted("jump")).toBeFalsy();
      expect(wrapper.find(".bm-empty").exists()).toBe(true);
      const stored = JSON.parse(mockStorage[STORAGE_KEY] ?? "[]") as Bookmark[];
      expect(stored.some((x) => x.id === bm.id)).toBe(false);
    });

    it("清除全部需确认,确认后清空并 emit refresh", async () => {
      seedBookmarks([
        makeBookmark({ label: "一" }),
        makeBookmark({ label: "二" }),
      ]);
      mountPanel();
      await wrapper.find(".bm-clear").trigger("click");
      expect(confirmSpy).toHaveBeenCalled();
      expect(wrapper.emitted("refresh")).toBeTruthy();
      expect(wrapper.find(".bm-empty").exists()).toBe(true);
      expect(mockStorage[STORAGE_KEY]).toBe("[]");
    });

    it("清除全部取消确认时不动作", async () => {
      confirmSpy.mockReturnValue(false);
      seedBookmarks([makeBookmark({ label: "保留" })]);
      mountPanel();
      await wrapper.find(".bm-clear").trigger("click");
      expect(wrapper.emitted("refresh")).toBeFalsy();
      expect(wrapper.findAll(".bm-item")).toHaveLength(1);
    });

    it("无书签时点清除按钮不弹确认", async () => {
      mountPanel();
      expect(wrapper.find(".bm-clear").exists()).toBe(false);
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  describe("showCurrentOnly", () => {
    it("仅显示当前文件的书签", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
      ]);
      mountPanel({ currentPath: "/root/a.md", showCurrentOnly: true });
      expect(wrapper.findAll(".bm-group")).toHaveLength(1);
      expect(wrapper.find(".bm-item-label").text()).toBe("A 书签");
    });

    it("当前文件分组在全部模式下置顶", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
      ]);
      mountPanel({ currentPath: "/root/a.md" });
      const files = wrapper.findAll(".bm-group-file").map((w) => w.text());
      expect(files).toEqual(["a.md", "b.md"]);
    });

    it("当前文件的书签条目带 active 高亮", () => {
      seedBookmarks([
        makeBookmark({ filePath: "/root/a.md", label: "A 书签" }),
        makeBookmark({ filePath: "/root/b.md", label: "B 书签" }),
      ]);
      mountPanel({ currentPath: "/root/a.md" });
      const items = wrapper.findAll(".bm-item");
      expect(items[0].classes()).toContain("active");
      expect(items[1].classes()).not.toContain("active");
    });
  });

  describe("时间格式化", () => {
    it("1 小时内显示 minutesAgo", () => {
      seedBookmarks([makeBookmark({ createdAt: Date.now() - 5 * 60000 })]);
      mountPanel();
      expect(wrapper.find(".bm-item-ts").text()).toBe("5 分钟前");
    });

    it("超过 1 小时显示 hoursAgo", () => {
      seedBookmarks([makeBookmark({ createdAt: Date.now() - 3 * 3600 * 1000 })]);
      mountPanel();
      expect(wrapper.find(".bm-item-ts").text()).toBe("3 小时前");
    });
  });
});
