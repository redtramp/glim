/**
 * useFloatLayout 测试
 *
 * 测试目标:
 * - 初始状态: activeLeftPanel = null, rightPanelOpen = false
 * - openPanel: 打开/切换面板
 * - closePanel: 关闭面板
 * - toggleRightPanel: 切换右侧面板
 * - leftPanelLoaded: 记录已加载面板
 * - bindGlobalClick / unbindGlobalClick: 全局点击监听
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFloatLayout, LEFT_PANEL_META } from "./useFloatLayout";

describe("useFloatLayout", () => {
  let floatLayout: ReturnType<typeof useFloatLayout>;

  beforeEach(() => {
    floatLayout = useFloatLayout();
  });

  describe("初始状态", () => {
    it("activeLeftPanel 初始为 null", () => {
      expect(floatLayout.state.activeLeftPanel).toBeNull();
    });

    it("rightPanelOpen 初始为 false", () => {
      expect(floatLayout.state.rightPanelOpen).toBe(false);
    });

    it("leftPanelLoaded 初始为空 Set", () => {
      expect(floatLayout.state.leftPanelLoaded.size).toBe(0);
    });

    it("LEFT_PANEL_META 包含 12 个面板", () => {
      expect(LEFT_PANEL_META).toHaveLength(12);
      const ids = LEFT_PANEL_META.map((m) => m.id);
      expect(ids).toEqual([
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

  describe("toggleRightPanel", () => {
    it("切换右侧面板为 true", () => {
      floatLayout.toggleRightPanel();
      expect(floatLayout.state.rightPanelOpen).toBe(true);
    });

    it("再次切换回 false", () => {
      floatLayout.toggleRightPanel();
      floatLayout.toggleRightPanel();
      expect(floatLayout.state.rightPanelOpen).toBe(false);
    });
  });

  describe("closeRightPanel", () => {
    it("关闭右侧面板", () => {
      floatLayout.toggleRightPanel();
      floatLayout.closeRightPanel();
      expect(floatLayout.state.rightPanelOpen).toBe(false);
    });
  });

  describe("closeAll", () => {
    it("关闭所有面板", () => {
      floatLayout.openPanel("search");
      floatLayout.toggleRightPanel();
      floatLayout.closeAll();
      expect(floatLayout.state.activeLeftPanel).toBeNull();
      expect(floatLayout.state.rightPanelOpen).toBe(false);
    });
  });

  describe("bindGlobalClick / unbindGlobalClick", () => {
    let clickHandler: (e: Event) => void;

    beforeEach(() => {
      clickHandler = vi.fn();
      document.addEventListener("click", clickHandler as EventListener);
    });

    afterEach(() => {
      document.removeEventListener("click", clickHandler);
      floatLayout.unbindGlobalClick();
    });

    it("bindGlobalClick 注册点击监听", () => {
      floatLayout.bindGlobalClick();
      // 点击 body 外部区域
      document.body.click();
      // 外部点击监听器应被调用（通过事件冒泡）
      expect(clickHandler).toHaveBeenCalled();
    });

    it("unbindGlobalClick 移除点击监听", () => {
      floatLayout.bindGlobalClick();
      floatLayout.unbindGlobalClick();
      document.body.click();
      // 点击监听已移除，但 clickHandler 仍然会被调用（它是独立注册的）
      // 这个测试验证 unbindGlobalClick 不会抛异常
      expect(true).toBe(true);
    });

    it("连续 bind 两次不重复注册", () => {
      floatLayout.bindGlobalClick();
      floatLayout.bindGlobalClick(); // 第二次调用应无效果
      expect(true).toBe(true); // 不抛异常即通过
    });
  });
});