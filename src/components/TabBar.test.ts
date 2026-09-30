/**
 * TabBar 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 渲染 tab 列表 / 活动高亮
 * - stale tab 警告标记(含 dirty 抑制、auto-reload 白名单、Windows 路径)
 * - 点击 tab / 关闭按钮 / 中键关闭
 * - 右键菜单:打开/位置/禁用态/各动作回调/关闭方式
 * - 悬浮模式:floating/visible/hidden 类与 mouse-enter/mouse-leave
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, type RenderResult } from "@testing-library/svelte";
import TabBar from "./TabBar.svelte";
import type { Tab } from "../composables/useTabs.svelte.ts";

// Mock 自研 i18n（原 vue-i18n 实例的等价迁移）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "app.noFile": "未打开文件",
      "tabs.close": "关闭标签",
      "tabs.closeLeft": "关闭左侧标签",
      "tabs.closeRight": "关闭右侧标签",
      "tabs.closeOthers": "关闭其他标签",
      "tabs.closeAll": "关闭全部标签",
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

function makeTab(
  id = "tab-1",
  path = "/root/test.md",
  isDirty = false,
  staleSince: number | null = null
): Tab {
  return {
    id,
    path,
    content: "# Hello",
    draftContent: "# Hello",
    isDirty,
    isEditing: false,
    headings: [],
    scrollTop: 0,
    pendingHash: "",
    pendingScrollTop: 0,
    pendingSourceLine: 0,
    staleSince,
  };
}

type Mock = ReturnType<typeof vi.fn>;
type Rendered = RenderResult<typeof TabBar> & {
  onActivate: Mock;
  onClose: Mock;
  onCloseLeft: Mock;
  onCloseRight: Mock;
  onCloseAll: Mock;
  onCloseOthers: Mock;
  onMouseEnter: Mock;
  onMouseLeave: Mock;
};
let rendered: Rendered;

function renderTabBar(
  tabs: Tab[],
  activeTabId = "tab-1",
  autoReload: string[] = [],
  opts: { floating?: boolean; visible?: boolean } = {}
): Rendered {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const onCloseLeft = vi.fn();
  const onCloseRight = vi.fn();
  const onCloseAll = vi.fn();
  const onCloseOthers = vi.fn();
  const onMouseEnter = vi.fn();
  const onMouseLeave = vi.fn();
  const result = render(TabBar, {
    props: {
      tabs,
      activeTabId,
      autoReload,
      floating: opts.floating ?? false,
      visible: opts.visible ?? true,
      onActivate,
      onClose,
      onCloseLeft,
      onCloseRight,
      onCloseAll,
      onCloseOthers,
      onMouseEnter,
      onMouseLeave,
    },
  });
  rendered = {
    ...result,
    onActivate,
    onClose,
    onCloseLeft,
    onCloseRight,
    onCloseAll,
    onCloseOthers,
    onMouseEnter,
    onMouseLeave,
  };
  return rendered;
}

describe("TabBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("基础渲染", () => {
    it("渲染 tab 列表", () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      const { container } = renderTabBar(tabs);
      expect(container.querySelectorAll(".tab-item").length).toBe(2);
    });

    it("当前活动 tab 正确高亮", () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      const { container } = renderTabBar(tabs, "tab-2");
      expect(
        container.querySelector(".tab-item.active .name")!.textContent
      ).toBe("other.md");
    });

    it("tab 标题为完整路径", () => {
      const { container } = renderTabBar([
        makeTab("tab-1", "/root/deep/dir/doc.md"),
      ]);
      expect(container.querySelector(".tab-item")!.getAttribute("title")).toBe(
        "/root/deep/dir/doc.md"
      );
    });

    it("dirty tab 显示修改圆点", () => {
      const { container } = renderTabBar([
        makeTab("tab-1", "/root/a.md", true),
      ]);
      expect(container.querySelector(".dot")).not.toBeNull();
    });
  });

  describe("stale 警告标记", () => {
    it("stale tab 显示 (!) 警告标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, Date.now())];
      const { container } = renderTabBar(tabs);
      expect(container.querySelector(".stale-warning")).not.toBeNull();
    });

    it("非 stale tab 不显示 (!) 标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, null)];
      const { container } = renderTabBar(tabs);
      expect(container.querySelector(".stale-warning")).toBeNull();
    });

    it("dirty tab 不显示 stale 标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", true, Date.now())];
      const { container } = renderTabBar(tabs);
      expect(container.querySelector(".stale-warning")).toBeNull();
    });

    it("auto-reload 白名单中的 stale tab 不显示警告标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, Date.now())];
      const { container } = renderTabBar(tabs, "tab-1", ["/root/test.md"]);
      expect(container.querySelector(".stale-warning")).toBeNull();
    });

    it("Windows 反斜杠路径经规范化后命中白名单", () => {
      const tabs = [makeTab("tab-1", "C:\\docs\\file.md", false, Date.now())];
      const { container } = renderTabBar(tabs, "tab-1", ["c:/docs/file.md"]);
      expect(container.querySelector(".stale-warning")).toBeNull();
    });
  });

  describe("点击事件", () => {
    it("点击 tab 触发 activate 事件", async () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      const { container, onActivate } = renderTabBar(tabs);
      const tab2 = container.querySelectorAll(".tab-item")[1];
      await fireEvent.click(tab2);
      expect(onActivate).toHaveBeenCalledWith("tab-2");
    });

    it("点击关闭按钮触发 close 事件", async () => {
      const { container, onClose } = renderTabBar([makeTab("tab-1")]);
      await fireEvent.click(container.querySelector(".close")!);
      expect(onClose).toHaveBeenCalledWith("tab-1");
    });

    it("中键点击 tab 触发 close 事件", async () => {
      const { container, onClose } = renderTabBar([makeTab("tab-1")]);
      await fireEvent.mouseDown(container.querySelector(".tab-item")!, {
        button: 1,
      });
      expect(onClose).toHaveBeenCalledWith("tab-1");
    });
  });

  describe("右键菜单", () => {
    function openMenu(tabIndex = 0, x = 50, y = 60) {
      const tab = rendered.container.querySelectorAll(".tab-item")[tabIndex];
      return fireEvent.contextMenu(tab, { clientX: x, clientY: y });
    }

    it("右键 tab 弹出菜单并记录位置", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(1, 120, 80);
      const menu = container.querySelector(".context-menu");
      expect(menu).not.toBeNull();
      const style = menu!.getAttribute("style") ?? "";
      expect(style).toContain("left: 120px");
      expect(style).toContain("top: 80px");
    });

    it("中间 tab 三个动作全部可用", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      const items = container.querySelectorAll(".context-menu .menu-item");
      expect(items).toHaveLength(4);
      expect(items[0].classList.contains("disabled")).toBe(false);
      expect(items[1].classList.contains("disabled")).toBe(false);
      expect(items[2].classList.contains("disabled")).toBe(false);
    });

    it("第一个 tab 的关闭左侧禁用", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(0);
      const items = container.querySelectorAll(".context-menu .menu-item");
      expect(items[0].classList.contains("disabled")).toBe(true);
      expect(items[1].classList.contains("disabled")).toBe(false);
    });

    it("最后一个 tab 的关闭右侧禁用", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(1);
      const items = container.querySelectorAll(".context-menu .menu-item");
      expect(items[0].classList.contains("disabled")).toBe(false);
      expect(items[1].classList.contains("disabled")).toBe(true);
    });

    it("仅一个 tab 时关闭其他禁用", async () => {
      const { container } = renderTabBar([makeTab("tab-1")]);
      await openMenu(0);
      const items = container.querySelectorAll(".context-menu .menu-item");
      expect(items[2].classList.contains("disabled")).toBe(true);
    });

    it("点击关闭左侧触发 onCloseLeft(targetId)", async () => {
      const { onCloseLeft } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await fireEvent.click(
        rendered.container.querySelectorAll(".context-menu .menu-item")[0]
      );
      expect(onCloseLeft).toHaveBeenCalledWith("tab-2");
    });

    it("点击关闭右侧触发 onCloseRight(targetId)", async () => {
      const { onCloseRight } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await fireEvent.click(
        rendered.container.querySelectorAll(".context-menu .menu-item")[1]
      );
      expect(onCloseRight).toHaveBeenCalledWith("tab-2");
    });

    it("点击关闭其他触发 onCloseOthers(targetId)", async () => {
      const { onCloseOthers } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await fireEvent.click(
        rendered.container.querySelectorAll(".context-menu .menu-item")[2]
      );
      expect(onCloseOthers).toHaveBeenCalledWith("tab-2");
    });

    it("点击关闭全部触发 onCloseAll", async () => {
      const { onCloseAll } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(0);
      await fireEvent.click(
        rendered.container.querySelectorAll(".context-menu .menu-item")[3]
      );
      expect(onCloseAll).toHaveBeenCalled();
    });

    it("禁用菜单项点击不触发", async () => {
      const { container, onCloseLeft } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(0); // 第一个 tab:关闭左侧禁用
      await fireEvent.click(
        container.querySelectorAll(".context-menu .menu-item")[0]
      );
      expect(onCloseLeft).not.toHaveBeenCalled();
    });

    it("点击 tab-bar 空白区域关闭菜单", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(1);
      expect(container.querySelector(".context-menu")).not.toBeNull();
      await fireEvent.click(container.querySelector(".tab-bar")!);
      expect(container.querySelector(".context-menu")).toBeNull();
    });

    it("点击菜单遮罩关闭菜单", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(1);
      expect(container.querySelector(".context-menu")).not.toBeNull();
      await fireEvent.click(container.querySelector(".context-menu-overlay")!);
      expect(container.querySelector(".context-menu")).toBeNull();
    });

    it("右键标签栏空白区域关闭菜单", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      await openMenu(1);
      expect(container.querySelector(".context-menu")).not.toBeNull();
      await fireEvent.contextMenu(container.querySelector(".tab-bar")!);
      expect(container.querySelector(".context-menu")).toBeNull();
    });

    it("菜单打开时标签栏添加 menu-open 类", async () => {
      const { container } = renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
      ]);
      expect(
        container.querySelector(".tab-bar")!.classList.contains("menu-open")
      ).toBe(false);
      await openMenu(1);
      expect(
        container.querySelector(".tab-bar")!.classList.contains("menu-open")
      ).toBe(true);
    });
  });

  describe("悬浮模式", () => {
    it("floating=true 时添加 floating 类", () => {
      const { container } = renderTabBar([makeTab("tab-1")], "tab-1", [], {
        floating: true,
      });
      expect(
        container.querySelector(".tab-bar")!.classList.contains("floating")
      ).toBe(true);
    });

    it("floating+visible 时显示", () => {
      const { container } = renderTabBar([makeTab("tab-1")], "tab-1", [], {
        floating: true,
        visible: true,
      });
      const bar = container.querySelector(".tab-bar")!;
      expect(bar.classList.contains("visible")).toBe(true);
      expect(bar.classList.contains("hidden")).toBe(false);
    });

    it("floating+不可见时隐藏", () => {
      const { container } = renderTabBar([makeTab("tab-1")], "tab-1", [], {
        floating: true,
        visible: false,
      });
      const bar = container.querySelector(".tab-bar")!;
      expect(bar.classList.contains("hidden")).toBe(true);
      expect(bar.classList.contains("visible")).toBe(false);
    });

    it("非悬浮模式不添加 floating 类", () => {
      const { container } = renderTabBar([makeTab("tab-1")]);
      const bar = container.querySelector(".tab-bar")!;
      expect(bar.classList.contains("floating")).toBe(false);
      expect(bar.classList.contains("visible")).toBe(false);
    });

    it("悬浮模式 mouseenter/mouseleave 触发对应回调", async () => {
      const { container, onMouseEnter, onMouseLeave } = renderTabBar(
        [makeTab("tab-1")],
        "tab-1",
        [],
        { floating: true }
      );
      const bar = container.querySelector(".tab-bar")!;
      await fireEvent.mouseEnter(bar);
      expect(onMouseEnter).toHaveBeenCalled();
      await fireEvent.mouseLeave(bar);
      expect(onMouseLeave).toHaveBeenCalled();
    });

    it("非悬浮模式 mouseenter 不触发", async () => {
      const { container, onMouseEnter } = renderTabBar([makeTab("tab-1")]);
      await fireEvent.mouseEnter(container.querySelector(".tab-bar")!);
      expect(onMouseEnter).not.toHaveBeenCalled();
    });
  });
});
