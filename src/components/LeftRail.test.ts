/**
 * LeftRail 组件测试
 *
 * 测试目标:
 * - 渲染 7 个图标按钮
 * - 渲染 2 条分隔线
 * - 点击图标 emit open-panel
 * - 当前激活面板高亮
 * - 导航栏 aria-label
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
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
      };
      return map[key] || key;
    },
  }),
}));

function createWrapper(props: { activePanel: import("../composables/useFloatLayout").LeftPanelID | null }) {
  return mount(LeftRail, {
    props,
  });
}

describe("LeftRail", () => {
  it("渲染 12 个图标按钮", () => {
    const wrapper = createWrapper({ activePanel: null });
    const buttons = wrapper.findAll(".left-rail-btn");
    expect(buttons).toHaveLength(12);
  });

  it("渲染 3 条分隔线", () => {
    const wrapper = createWrapper({ activePanel: null });
    const separators = wrapper.findAll(".left-rail-sep");
    expect(separators).toHaveLength(3);
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
      "ai",
      "settings",
      "new-file",
      "open-file",
      "open-folder",
      "export",
      "edit",
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

  it("导航栏含有 aria-label 属性", () => {
    const wrapper = createWrapper({ activePanel: null });
    const nav = wrapper.find("nav");
    expect(nav.attributes("aria-label")).toBe("toolbar");
  });
});