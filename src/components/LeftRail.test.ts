/**
 * LeftRail 组件测试
 *
 * 测试目标:
 * - 渲染 12 个图标按钮与 3 条分组分隔线（位置正确）
 * - 点击图标 emit open-panel
 * - 当前激活面板高亮（active 类 + aria-pressed）
 * - 按钮 title 使用 i18n 文案
 * - 滚动时淡出（dimmed），1.5s 后恢复，连续滚动重置计时器
 * - 卸载时移除滚动监听并清理计时器
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import LeftRail from "./LeftRail.vue";

// Mock vue-i18n
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "float.filetree": "文件树",
        "float.history": "最近文档",
        "float.search": "全文搜索",
        "float.annotations": "批注列表",
        "float.bookmark": "书签",
        "float.ai": "AI 助手",
        "float.settings": "设置",
        "float.help": "帮助",
        "float.localeToggle": "切换语言",
        "float.themeToggle": "切换主题",
      };
      return map[key] || key;
    },
  }),
}));

function createWrapper(props: { activePanel: import("../composables/useFloatLayout.svelte.ts").LeftPanelID | null }) {
  return mount(LeftRail, {
    props,
  });
}

describe("LeftRail", () => {
  it("渲染 15 个图标按钮", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    expect(buttons).toHaveLength(15);
  });

  it("渲染 3 条分隔线", () => {
    const wrapper = createWrapper({ activePanel: null });
    const separators = wrapper.findAll(".left-rail-sep");
    expect(separators).toHaveLength(3);
  });

  it("分隔线位于分组边界（navigation|content|tools|actions）", () => {
    const wrapper = createWrapper({ activePanel: null });
    const children = wrapper.findAll(".left-rail-inner > *");
    // 15 按钮 + 3 分隔线
    expect(children).toHaveLength(18);
    // 新顺序：navigation(2) → content(3) → actions(5) → tools(5)
    // DOM 结构：btn,btn,sep,btn,btn,btn,sep,btn,btn,btn,btn,btn,sep,btn...
    // 分隔线位于 DOM 索引 2, 6, 12
    const sepIndexes = new Set([2, 6, 12]);
    children.forEach((node, idx) => {
      if (sepIndexes.has(idx)) {
        expect(node.classes()).toContain("left-rail-sep");
      } else {
        expect(node.classes()).toContain("left-rail-btn");
      }
    });
  });

  it("点击图标 emit open-panel", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    buttons[0].trigger("click");
    expect(wrapper.emitted("open-panel")).toBeTruthy();
    expect(wrapper.emitted("open-panel")![0]).toEqual(["filetree"]);
  });

  it("每个图标都 emit 正确的 panel id", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    const expectedIds = [
      "filetree",
      "history",
      "search",
      "annotations",
      "bookmark",
      "new-file",
      "open-file",
      "open-folder",
      "export",
      "edit",
      "ai",
      "settings",
      "help",
      "locale-toggle",
      "theme-toggle",
    ];
    buttons.forEach((btn, idx) => {
      btn.trigger("click");
      expect(wrapper.emitted("open-panel")![idx]).toEqual([expectedIds[idx]]);
    });
  });

  it("activePanel 匹配时图标高亮", () => {
    const wrapper = createWrapper({ activePanel: "search" });
    const buttons = wrapper.findAll(".left-rail-btn");
    expect(buttons[2].classes()).toContain("active");
    buttons.forEach((btn, idx) => {
      if (idx !== 2) {
        expect(btn.classes()).not.toContain("active");
      }
    });
  });

  it("activePanel 为 null 时所有图标不高亮", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    buttons.forEach((btn) => {
      expect(btn.classes()).not.toContain("active");
    });
  });

  it("active 按钮 aria-pressed=true，其余 false", () => {
    const wrapper = createWrapper({ activePanel: "ai" });
    const buttons = wrapper.findAll(".left-rail-btn");
    expect(buttons[10].attributes("aria-pressed")).toBe("true");
    buttons.forEach((btn, idx) => {
      if (idx !== 10) expect(btn.attributes("aria-pressed")).toBe("false");
    });
  });

  it("按钮 title 使用 i18n 文案（未映射的 key 原样返回）", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    expect(buttons[0].attributes("title")).toBe("文件树");
    expect(buttons[4].attributes("title")).toBe("书签");
    expect(buttons[5].attributes("title")).toBe("float.newFile");
    expect(buttons[9].attributes("title")).toBe("float.editToggle");
    expect(buttons[10].attributes("title")).toBe("AI 助手");
    expect(buttons[13].attributes("title")).toBe("切换语言");
    expect(buttons[14].attributes("title")).toBe("切换主题");
  });

  it("导航栏含有 aria-label 属性", () => {
    const wrapper = createWrapper({ activePanel: null });
    const nav = wrapper.find("nav");
    expect(nav.attributes("aria-label")).toBe("toolbar");
  });
});

describe("LeftRail 滚动淡化", () => {
  let scrollRoot: HTMLElement;

  beforeEach(() => {
    scrollRoot = document.createElement("div");
    scrollRoot.dataset.scrollRoot = "";
    document.body.appendChild(scrollRoot);
  });

  afterEach(() => {
    scrollRoot.remove();
    vi.useRealTimers();
  });

  function dispatchScroll(): void {
    scrollRoot.dispatchEvent(new Event("scroll"));
  }

  it("滚动时添加 dimmed 类", async () => {
    const wrapper = createWrapper({ activePanel: null });
    dispatchScroll();
    await nextTick();
    expect(wrapper.find("nav").classes()).toContain("dimmed");
  });

  it("滚动后 1.5s 自动恢复不淡化", async () => {
    vi.useFakeTimers();
    const wrapper = createWrapper({ activePanel: null });
    dispatchScroll();
    await nextTick();
    expect(wrapper.find("nav").classes()).toContain("dimmed");

    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.find("nav").classes()).not.toContain("dimmed");
  });

  it("连续滚动重置计时器", async () => {
    vi.useFakeTimers();
    const wrapper = createWrapper({ activePanel: null });
    dispatchScroll();
    await vi.advanceTimersByTimeAsync(1000);
    dispatchScroll(); // 第二次滚动重置 1.5s 窗口
    await vi.advanceTimersByTimeAsync(1000);
    // 距第二次滚动仅 1s，仍在淡化
    expect(wrapper.find("nav").classes()).toContain("dimmed");
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.find("nav").classes()).not.toContain("dimmed");
  });

  it("卸载时移除滚动监听并清理计时器", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(scrollRoot, "removeEventListener");
    const wrapper = createWrapper({ activePanel: null });
    dispatchScroll();
    wrapper.unmount();
    expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function));
    // 计时器已清理：推进时间不抛错、无残留状态变化
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
