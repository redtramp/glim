/**
 * useFloatLayout 测试
 *
 * 测试目标:
 * - 初始状态: activeLeftPanel = null
 * - openPanel: 打开/切换面板
 * - closePanel: 关闭面板
 * - leftPanelLoaded: 记录已加载面板
 * - bindGlobalClick / unbindGlobalClick: 全局点击监听
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useFloatLayout, LEFT_PANEL_META } from "./useFloatLayout.svelte.ts";

describe("useFloatLayout", () => {
  let floatLayout: ReturnType<typeof useFloatLayout>;

  beforeEach(() => {
    floatLayout = useFloatLayout();
  });

  describe("初始状态", () => {
    it("activeLeftPanel 初始为 null", () => {
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });

    it("leftPanelLoaded 初始为空 Set", () => {
      expect(floatLayout.state.leftPanelLoaded.size).toBe(0);
    });

    it("LEFT_PANEL_META 包含 15 个面板", () => {
      expect(LEFT_PANEL_META).toHaveLength(15);
      const ids = LEFT_PANEL_META.map((m) => m.id);
      // 新顺序：navigation → content → actions → tools
      expect(ids).toEqual([
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
      ]);
    });
  });

  describe("openPanel", () => {
    it("打开面板时设置 activeLeftPanel", () => {
      floatLayout.openPanel("filetree");
      expect(floatLayout.state.activeLeftPanel).toBe("filetree");
    });

    it("再次点击同一面板时关闭（toggle）", () => {
      floatLayout.openPanel("filetree");
      floatLayout.openPanel("filetree");
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });

    it("打开不同面板时切换", () => {
      floatLayout.openPanel("filetree");
      floatLayout.openPanel("search");
      expect(floatLayout.state.activeLeftPanel).toBe("search");
    });

    it("记录已加载的面板", () => {
      floatLayout.openPanel("filetree");
      expect(floatLayout.state.leftPanelLoaded.has("filetree")).toBe(true);
    });

    it("多次打开同一面板只记录一次", () => {
      floatLayout.openPanel("filetree");
      floatLayout.openPanel("history");
      floatLayout.openPanel("filetree");
      // 再次打开时 leftPanelLoaded 仍包含 filetree
      expect(floatLayout.state.leftPanelLoaded.has("filetree")).toBe(true);
      expect(floatLayout.state.leftPanelLoaded.has("history")).toBe(true);
      expect(floatLayout.state.leftPanelLoaded.size).toBe(2);
    });
  });

  describe("closePanel", () => {
    it("关闭所有左侧面板", () => {
      floatLayout.openPanel("search");
      floatLayout.closePanel();
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });

    it("已关闭时调用无副作用", () => {
      floatLayout.closePanel();
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });
  });

  describe("bindGlobalClick / unbindGlobalClick", () => {
    afterEach(() => {
      floatLayout.unbindGlobalClick();
    });

    it("bindGlobalClick 后点击外部区域关闭面板", () => {
      floatLayout.openPanel("filetree");
      floatLayout.bindGlobalClick();
      document.body.click();
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });

    it("unbindGlobalClick 后点击外部区域不再关闭面板", () => {
      floatLayout.openPanel("filetree");
      floatLayout.bindGlobalClick();
      floatLayout.unbindGlobalClick();
      document.body.click();
      expect(floatLayout.state.activeLeftPanel).toBe("filetree");
    });

    it("连续 bind 两次只注册一个监听", () => {
      floatLayout.openPanel("filetree");
      floatLayout.bindGlobalClick();
      floatLayout.bindGlobalClick();
      document.body.click();
      // 一次点击即关闭，说明监听有效；unbind 一次后点击不再生效，说明只注册了一个
      expect(floatLayout.state.activeLeftPanel).toBeNull();
      floatLayout.unbindGlobalClick();
      floatLayout.openPanel("search");
      document.body.click();
      expect(floatLayout.state.activeLeftPanel).toBe("search");
    });

    it("点击 .search-overlay 区域时不关闭浮动面板", () => {
      floatLayout.openPanel("filetree");
      floatLayout.bindGlobalClick();
      const overlay = document.createElement("div");
      overlay.className = "search-overlay";
      document.body.appendChild(overlay);
      overlay.click();
      document.body.removeChild(overlay);
      expect(floatLayout.state.activeLeftPanel).toBe("filetree");
    });
  });
});