/**
 * useTabs 测试
 *
 * 覆盖:
 * - createTab 默认字段 / normalizePath / samePath
 * - tab 列表管理:激活、移除(相邻回退)、关闭左侧/右侧/其他/全部
 * - persist / loadPersisted 往返与损坏 JSON 容错
 * - findTabByPath 大小写不敏感匹配
 *
 * 注意:useTabs 状态为模块级单例,每个用例前通过 closeAllTabs 复位。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTabs, normalizePath, samePath, type Tab } from "./useTabs";

// vitest4 + jsdom 环境无 localStorage,提供内存实现保证持久化可测
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const key in mockStorage) delete mockStorage[key];
    },
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
  },
});

// 模块加载前激活 Pinia,保证 useTabs() 在模块顶层可调用
setActivePinia(createPinia());
const api = useTabs();

function pushTabs(paths: string[]): string[] {
  return paths.map((p) => {
    const t = api.createTab(p);
    api.tabs.value.push(t);
    return t.id;
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  api.closeAllTabs();
});

describe("Tab", () => {
  describe("staleSince 字段", () => {
    it("createTab 创建的 Tab 默认 staleSince 为 null", () => {
      const { createTab } = useTabs();
      const tab = createTab("/root/test.md");
      expect(tab.staleSince).toBe(null);
    });

    it("Tab 对象包含 staleSince 属性", () => {
      const tab: Tab = {
        id: "tab-test-1",
        path: "/root/test.md",
        content: "# Hello",
        draftContent: "# Hello",
        isDirty: false,
        isEditing: false,
        headings: [],
        scrollTop: 0,
        pendingHash: "",
        pendingScrollTop: 0,
        pendingSourceLine: 0,
        staleSince: null,
      };
      expect(tab.staleSince).toBe(null);
    });

    it("staleSince 可被设置为 number 时间戳", () => {
      const { createTab } = useTabs();
      const tab = createTab("/root/test.md");
      const timestamp = Date.now();
      tab.staleSince = timestamp;
      expect(tab.staleSince).toBe(timestamp);
    });

    it("staleSince 可被重置为 null", () => {
      const { createTab } = useTabs();
      const tab = createTab("/root/test.md");
      tab.staleSince = Date.now();
      tab.staleSince = null;
      expect(tab.staleSince).toBe(null);
    });
  });

  describe("createTab 默认字段", () => {
    it("创建完整默认 Tab 对象", () => {
      const tab = api.createTab("/root/a.md");
      expect(tab).toMatchObject({
        path: "/root/a.md",
        content: "",
        draftContent: "",
        isDirty: false,
        isEditing: false,
        headings: [],
        scrollTop: 0,
        pendingHash: "",
        pendingScrollTop: 0,
        pendingSourceLine: 0,
        staleSince: null,
      });
      expect(tab.id).toMatch(/^tab-/);
    });

    it("tabs 初始为空", () => {
      expect(api.tabs.value).toHaveLength(0);
    });
  });
});

describe("normalizePath", () => {
  it("normalizePath 转换反斜杠为斜杠并转小写", () => {
    expect(normalizePath("C:\\Users\\Test\\file.md")).toBe("c:/users/test/file.md");
  });

  it("normalizePath 对于已标准化的路径不改变", () => {
    expect(normalizePath("/root/file.md")).toBe("/root/file.md");
  });
});

describe("samePath", () => {
  it("samePath 比较相同路径返回 true", () => {
    expect(samePath("/root/file.md", "/root/file.md")).toBe(true);
  });

  it("samePath 比较不同大小写返回 true", () => {
    expect(samePath("/root/file.md", "/root/FILE.md")).toBe(true);
  });

  it("samePath 比较不同路径返回 false", () => {
    expect(samePath("/root/file.md", "/root/other.md")).toBe(false);
  });
});

describe("tab 激活", () => {
  it("activateTab 激活存在的 tab 并持久化", () => {
    const [a] = pushTabs(["/a.md"]);
    api.activateTab(a);
    expect(api.activeTabId.value).toBe(a);
    expect(api.activeTab.value?.path).toBe("/a.md");
    expect(JSON.parse(mockStorage["glim-reader-tabs"]!)).toEqual({
      paths: ["/a.md"],
      activePath: "/a.md",
    });
  });

  it("activateTab 激活不存在的 id 为 no-op", () => {
    pushTabs(["/a.md"]);
    api.activeTabId.value = "existing";
    api.activateTab("missing");
    expect(api.activeTabId.value).toBe("existing");
  });

  it("activeTab 在无激活时返回 null", () => {
    pushTabs(["/a.md"]);
    expect(api.activeTab.value).toBeNull();
  });
});

describe("removeTab", () => {
  it("移除 active tab 时激活右侧相邻 tab", () => {
    const [_a, b, c] = pushTabs(["/a.md", "/b.md", "/c.md"]);
    api.activeTabId.value = b;
    api.removeTab(b);
    expect(api.tabs.value.map((t) => t.path)).toEqual(["/a.md", "/c.md"]);
    expect(api.activeTabId.value).toBe(c);
  });

  it("移除最后一个 active tab 时激活前一个", () => {
    const [a, b] = pushTabs(["/a.md", "/b.md"]);
    api.activeTabId.value = b;
    api.removeTab(b);
    expect(api.activeTabId.value).toBe(a);
  });

  it("移除非 active tab 时 active 不变", () => {
    const [a, b] = pushTabs(["/a.md", "/b.md"]);
    api.activeTabId.value = b;
    api.removeTab(a);
    expect(api.activeTabId.value).toBe(b);
    expect(api.tabs.value).toHaveLength(1);
  });

  it("移除不存在的 id 为 no-op", () => {
    pushTabs(["/a.md"]);
    api.removeTab("missing");
    expect(api.tabs.value).toHaveLength(1);
  });
});

describe("closeTabsLeft", () => {
  it("关闭 target 左侧全部 tab", () => {
    const [_a, b, _c] = pushTabs(["/a.md", "/b.md", "/c.md"]);
    api.closeTabsLeft(b);
    expect(api.tabs.value.map((t) => t.path)).toEqual(["/b.md", "/c.md"]);
  });

  it("target 是第一个时 no-op", () => {
    const [a, _b] = pushTabs(["/a.md", "/b.md"]);
    api.closeTabsLeft(a);
    expect(api.tabs.value).toHaveLength(2);
  });

  it("active 被移除时回退到 target", () => {
    const [a, b] = pushTabs(["/a.md", "/b.md"]);
    api.activeTabId.value = a;
    api.closeTabsLeft(b);
    expect(api.activeTabId.value).toBe(b);
  });

  it("target 不存在时 no-op", () => {
    pushTabs(["/a.md"]);
    api.closeTabsLeft("missing");
    expect(api.tabs.value).toHaveLength(1);
  });
});

describe("closeTabsRight", () => {
  it("关闭 target 右侧全部 tab", () => {
    const [_a, b, _c] = pushTabs(["/a.md", "/b.md", "/c.md"]);
    api.closeTabsRight(b);
    expect(api.tabs.value.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
  });

  it("target 是最后一个时 no-op", () => {
    const [_a, b] = pushTabs(["/a.md", "/b.md"]);
    api.closeTabsRight(b);
    expect(api.tabs.value).toHaveLength(2);
  });

  it("active 被移除时回退到 target", () => {
    const [_a, b, c] = pushTabs(["/a.md", "/b.md", "/c.md"]);
    api.activeTabId.value = c;
    api.closeTabsRight(b);
    expect(api.activeTabId.value).toBe(b);
  });

  it("target 不存在时 no-op", () => {
    pushTabs(["/a.md"]);
    api.closeTabsRight("missing");
    expect(api.tabs.value).toHaveLength(1);
  });
});

describe("closeTabsOthers / closeAllTabs", () => {
  it("closeTabsOthers 只保留 target", () => {
    const [_a, b, c] = pushTabs(["/a.md", "/b.md", "/c.md"]);
    api.activeTabId.value = c;
    api.closeTabsOthers(b);
    expect(api.tabs.value.map((t) => t.path)).toEqual(["/b.md"]);
    expect(api.activeTabId.value).toBe(b);
  });

  it("closeTabsOthers 仅剩一个 tab 时 no-op", () => {
    const [a] = pushTabs(["/a.md"]);
    api.closeTabsOthers(a);
    expect(api.tabs.value).toHaveLength(1);
  });

  it("closeTabsOthers target 不存在时 no-op", () => {
    pushTabs(["/a.md"]);
    api.closeTabsOthers("missing");
    expect(api.tabs.value).toHaveLength(1);
  });

  it("closeAllTabs 清空所有 tab 与激活态", () => {
    const [a] = pushTabs(["/a.md"]);
    api.activeTabId.value = a;
    api.closeAllTabs();
    expect(api.tabs.value).toHaveLength(0);
    expect(api.activeTabId.value).toBe("");
  });
});

describe("持久化", () => {
  it("persist / loadPersisted 往返", () => {
    const [_a, b] = pushTabs(["/a.md", "/b.md"]);
    api.activeTabId.value = b;
    api.persist();
    const p = api.loadPersisted();
    expect(p?.paths).toEqual(["/a.md", "/b.md"]);
    expect(p?.activePath).toBe("/b.md");
  });

  it("损坏的持久化数据返回 null", () => {
    mockStorage["glim-reader-tabs"] = "{bad json";
    expect(api.loadPersisted()).toBeNull();
  });

  it("无持久化数据时返回 null", () => {
    // beforeEach 的 closeAllTabs 会 persist 写入空数据,先清理该键
    delete mockStorage["glim-reader-tabs"];
    expect(api.loadPersisted()).toBeNull();
  });
});

describe("findTabByPath", () => {
  it("大小写不敏感匹配路径", () => {
    pushTabs(["/Root/Foo.md"]);
    const found = api.findTabByPath("/root/foo.MD");
    expect(found?.path).toBe("/Root/Foo.md");
  });

  it("未找到时返回 undefined", () => {
    pushTabs(["/a.md"]);
    expect(api.findTabByPath("/nope.md")).toBeUndefined();
  });
});
