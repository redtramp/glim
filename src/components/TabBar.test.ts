/**
 * TabBar 组件测试
 *
 * 测试目标:
 * - 渲染 tab 列表 / 活动高亮
 * - stale tab 警告标记(含 dirty 抑制、auto-reload 白名单、Windows 路径)
 * - 点击 tab / 关闭按钮 / 中键关闭
 * - 右键菜单:打开/位置/禁用态/各动作 emit/关闭方式
 * - 悬浮模式:floating/visible/hidden 类与 mouse-enter/mouse-leave
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import TabBar from "./TabBar.vue";
import type { Tab } from "../composables/useTabs.svelte.ts";

const i18n = createI18n({
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      app: { noFile: "未打开文件" },
      tabs: {
        close: "关闭标签",
        closeLeft: "关闭左侧标签",
        closeRight: "关闭右侧标签",
        closeOthers: "关闭其他标签",
        closeAll: "关闭全部标签",
      },
    },
  },
});

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

describe("TabBar", () => {
  let wrapper: ReturnType<typeof mount>;
  let mockActivate: (id: string) => void;
  let mockClose: (id: string) => void;

  beforeEach(() => {
    mockActivate = vi.fn() as any;
    mockClose = vi.fn() as any;
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.clearAllMocks();
  });

  function renderTabBar(
    tabs: Tab[],
    activeTabId = "tab-1",
    autoReload: string[] = [],
    opts: { floating?: boolean; visible?: boolean } = {}
  ) {
    wrapper = mount(TabBar, {
      global: {
        plugins: [i18n],
      },
      props: {
        tabs,
        activeTabId,
        autoReload,
        floating: opts.floating ?? false,
        visible: opts.visible ?? true,
        "onActivate": mockActivate,
        "onClose": mockClose,
      },
    });
  }

  describe("基础渲染", () => {
    it("渲染 tab 列表", () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      renderTabBar(tabs);
      expect(wrapper.findAll(".tab-item").length).toBe(2);
    });

    it("当前活动 tab 正确高亮", () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      renderTabBar(tabs, "tab-2");
      expect(wrapper.find(".tab-item.active").find(".name").text()).toBe("other.md");
    });

    it("tab 标题为完整路径", () => {
      renderTabBar([makeTab("tab-1", "/root/deep/dir/doc.md")]);
      expect(wrapper.find(".tab-item").attributes("title")).toBe("/root/deep/dir/doc.md");
    });

    it("dirty tab 显示修改圆点", () => {
      renderTabBar([makeTab("tab-1", "/root/a.md", true)]);
      expect(wrapper.find(".dot").exists()).toBe(true);
    });
  });

  describe("stale 警告标记", () => {
    it("stale tab 显示 (!) 警告标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, Date.now())];
      renderTabBar(tabs);
      expect(wrapper.find(".stale-warning").exists()).toBe(true);
    });

    it("非 stale tab 不显示 (!) 标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, null)];
      renderTabBar(tabs);
      expect(wrapper.find(".stale-warning").exists()).toBe(false);
    });

    it("dirty tab 不显示 stale 标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", true, Date.now())];
      renderTabBar(tabs);
      expect(wrapper.find(".stale-warning").exists()).toBe(false);
    });

    it("auto-reload 白名单中的 stale tab 不显示警告标记", () => {
      const tabs = [makeTab("tab-1", "/root/test.md", false, Date.now())];
      renderTabBar(tabs, "tab-1", ["/root/test.md"]);
      expect(wrapper.find(".stale-warning").exists()).toBe(false);
    });

    it("Windows 反斜杠路径经规范化后命中白名单", () => {
      const tabs = [makeTab("tab-1", "C:\\docs\\file.md", false, Date.now())];
      renderTabBar(tabs, "tab-1", ["c:/docs/file.md"]);
      expect(wrapper.find(".stale-warning").exists()).toBe(false);
    });
  });

  describe("点击事件", () => {
    it("点击 tab 触发 activate 事件", async () => {
      const tabs = [makeTab("tab-1"), makeTab("tab-2", "/root/other.md")];
      renderTabBar(tabs);
      const tab2 = wrapper.findAll(".tab-item")[1];
      await tab2.trigger("click");
      expect(mockActivate).toHaveBeenCalledWith("tab-2");
    });

    it("点击关闭按钮触发 close 事件", async () => {
      const tabs = [makeTab("tab-1")];
      renderTabBar(tabs);
      await wrapper.find(".close").trigger("click");
      expect(mockClose).toHaveBeenCalledWith("tab-1");
    });

    it("中键点击 tab 触发 close 事件", async () => {
      const tabs = [makeTab("tab-1")];
      renderTabBar(tabs);
      await wrapper.find(".tab-item").trigger("mousedown", { button: 1 });
      expect(mockClose).toHaveBeenCalledWith("tab-1");
    });
  });

  describe("右键菜单", () => {
    function openMenu(tabIndex = 0, x = 50, y = 60) {
      const tab = wrapper.findAll(".tab-item")[tabIndex];
      return tab.trigger("contextmenu", { clientX: x, clientY: y });
    }

    it("右键 tab 弹出菜单并记录位置", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(1, 120, 80);
      const menu = wrapper.find(".context-menu");
      expect(menu.exists()).toBe(true);
      expect(menu.attributes("style")).toContain("left: 120px");
      expect(menu.attributes("style")).toContain("top: 80px");
    });

    it("中间 tab 三个动作全部可用", async () => {
      renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      const items = wrapper.findAll(".context-menu .menu-item");
      expect(items).toHaveLength(4);
      expect(items[0].classes()).not.toContain("disabled");
      expect(items[1].classes()).not.toContain("disabled");
      expect(items[2].classes()).not.toContain("disabled");
    });

    it("第一个 tab 的关闭左侧禁用", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(0);
      const items = wrapper.findAll(".context-menu .menu-item");
      expect(items[0].classes()).toContain("disabled");
      expect(items[1].classes()).not.toContain("disabled");
    });

    it("最后一个 tab 的关闭右侧禁用", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(1);
      const items = wrapper.findAll(".context-menu .menu-item");
      expect(items[0].classes()).not.toContain("disabled");
      expect(items[1].classes()).toContain("disabled");
    });

    it("仅一个 tab 时关闭其他禁用", async () => {
      renderTabBar([makeTab("tab-1")]);
      await openMenu(0);
      const items = wrapper.findAll(".context-menu .menu-item");
      expect(items[2].classes()).toContain("disabled");
    });

    it("点击关闭左侧 emit closeLeft(targetId)", async () => {
      renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await wrapper.findAll(".context-menu .menu-item")[0].trigger("click");
      expect(wrapper.emitted("closeLeft")![0]).toEqual(["tab-2"]);
    });

    it("点击关闭右侧 emit closeRight(targetId)", async () => {
      renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await wrapper.findAll(".context-menu .menu-item")[1].trigger("click");
      expect(wrapper.emitted("closeRight")![0]).toEqual(["tab-2"]);
    });

    it("点击关闭其他 emit closeOthers(targetId)", async () => {
      renderTabBar([
        makeTab("tab-1"),
        makeTab("tab-2", "/root/b.md"),
        makeTab("tab-3", "/root/c.md"),
      ]);
      await openMenu(1);
      await wrapper.findAll(".context-menu .menu-item")[2].trigger("click");
      expect(wrapper.emitted("closeOthers")![0]).toEqual(["tab-2"]);
    });

    it("点击关闭全部 emit closeAll", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(0);
      await wrapper.findAll(".context-menu .menu-item")[3].trigger("click");
      expect(wrapper.emitted("closeAll")).toBeTruthy();
    });

    it("禁用菜单项点击不 emit", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(0); // 第一个 tab:关闭左侧禁用
      await wrapper.findAll(".context-menu .menu-item")[0].trigger("click");
      expect(wrapper.emitted("closeLeft")).toBeFalsy();
    });

    it("点击 tab-bar 空白区域关闭菜单", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(1);
      expect(wrapper.find(".context-menu").exists()).toBe(true);
      await wrapper.find(".tab-bar").trigger("click");
      expect(wrapper.find(".context-menu").exists()).toBe(false);
    });

    it("点击菜单遮罩关闭菜单", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(1);
      expect(wrapper.find(".context-menu").exists()).toBe(true);
      await wrapper.find(".context-menu-overlay").trigger("click");
      expect(wrapper.find(".context-menu").exists()).toBe(false);
    });

    it("右键标签栏空白区域关闭菜单", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      await openMenu(1);
      expect(wrapper.find(".context-menu").exists()).toBe(true);
      await wrapper.find(".tab-bar").trigger("contextmenu");
      expect(wrapper.find(".context-menu").exists()).toBe(false);
    });

    it("菜单打开时标签栏添加 menu-open 类", async () => {
      renderTabBar([makeTab("tab-1"), makeTab("tab-2", "/root/b.md")]);
      expect(wrapper.find(".tab-bar").classes()).not.toContain("menu-open");
      await openMenu(1);
      expect(wrapper.find(".tab-bar").classes()).toContain("menu-open");
    });
  });

  describe("悬浮模式", () => {
    it("floating=true 时添加 floating 类", () => {
      renderTabBar([makeTab("tab-1")], "tab-1", [], { floating: true });
      expect(wrapper.find(".tab-bar").classes()).toContain("floating");
    });

    it("floating+visible 时显示", () => {
      renderTabBar([makeTab("tab-1")], "tab-1", [], { floating: true, visible: true });
      const bar = wrapper.find(".tab-bar");
      expect(bar.classes()).toContain("visible");
      expect(bar.classes()).not.toContain("hidden");
    });

    it("floating+不可见时隐藏", () => {
      renderTabBar([makeTab("tab-1")], "tab-1", [], { floating: true, visible: false });
      const bar = wrapper.find(".tab-bar");
      expect(bar.classes()).toContain("hidden");
      expect(bar.classes()).not.toContain("visible");
    });

    it("非悬浮模式不添加 floating 类", () => {
      renderTabBar([makeTab("tab-1")]);
      const bar = wrapper.find(".tab-bar");
      expect(bar.classes()).not.toContain("floating");
      expect(bar.classes()).not.toContain("visible");
    });

    it("悬浮模式 mouseenter/mouseleave emit 对应事件", async () => {
      renderTabBar([makeTab("tab-1")], "tab-1", [], { floating: true });
      const bar = wrapper.find(".tab-bar");
      await bar.trigger("mouseenter");
      expect(wrapper.emitted("mouse-enter")).toBeTruthy();
      await bar.trigger("mouseleave");
      expect(wrapper.emitted("mouse-leave")).toBeTruthy();
    });

    it("非悬浮模式 mouseenter 不 emit", async () => {
      renderTabBar([makeTab("tab-1")]);
      await wrapper.find(".tab-bar").trigger("mouseenter");
      expect(wrapper.emitted("mouse-enter")).toBeFalsy();
    });
  });
});
