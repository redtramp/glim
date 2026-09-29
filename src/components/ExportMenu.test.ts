/**
 * ExportMenu 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 基础渲染:可见/隐藏切换、role=menu/menuitem、aria-label、id
 * - 禁用态:pandoc 不可用时 DOCX 禁用
 * - 键盘导航:方向键(跳过禁用项)/Home/End/Esc/Tab
 * - 焦点管理:打开聚焦首项、关闭归还焦点、Tab 关闭不抢焦点、跨开关循环不泄漏
 * - 事件:点击各菜单项触发对应 callback,print 同时触发 onClose
 *
 * 迁移要点:
 * - emits → onExportHtml/onExportDocx/onExportPdf/onPrint/onClose props
 * - vue-i18n 实例 → 自研 locale 模块 mock(map 仅放断言与渲染用到的键)
 * - wrapper.setProps → testing-library 的 rerender(合并式,不丢回调 props)
 * - 点击用 element.click():VTU 的 trigger() 对 disabled 元素不派发事件,
 *   而 fireEvent.click() 会派发;jsdom 的 HTMLElement.click() 与浏览器一致,
 *   对 disabled 表单控件直接返回,语义等价且断言不落空
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ExportMenu from "./ExportMenu.svelte";

// Mock 自研 i18n(原测试 global.plugins:[i18n] 的等价迁移)
vi.mock("../i18n/locale.svelte.ts", () => {
  const map: Record<string, string> = {
    "export.export": "导出",
    "export.html": "导出 HTML",
    "export.htmlHint": "自包含 · 含图片/公式/图表",
    "export.docx": "导出 DOCX",
    "export.docxHint": "Word 文档",
    "export.docxRequiresPandoc": "需要 pandoc",
    "export.pdf": "导出 PDF",
    "export.pdfHint": "Edge headless · 所见即所得",
    "export.pdfNoEdge": "未检测到 Edge（导出时可指定）",
    "export.print": "打印 / 系统 PDF",
    "export.printHint": "浏览器打印对话框",
    "app.usePath": "使用 {path}",
    "app.specifyEdgePath": "将在导出时让你手动指定 Edge 路径",
  };
  return {
    t: (key: string, params?: Record<string, string | number>) => {
      let s = map[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    locale: { value: "zh-CN" },
    setLocale: vi.fn(),
    persistLocale: vi.fn(),
    detectLocale: vi.fn(() => "zh-CN"),
  };
});

describe("ExportMenu", () => {
  let rerender: (props: any) => Promise<void>;
  let events: {
    onExportHtml: Mock<() => void>;
    onExportDocx: Mock<() => void>;
    onExportPdf: Mock<() => void>;
    onPrint: Mock<() => void>;
    onClose: Mock<() => void>;
  };
  let triggerEl: HTMLButtonElement;

  beforeEach(() => {
    // Ruling 7:jsdom navigator 为 en-US,种子 storage 使 detectLocale 走已存路径
    localStorage.setItem("glim-reader-locale", "zh-CN");
    // 模拟工具栏导出按钮作为焦点来源
    triggerEl = document.createElement("button");
    triggerEl.id = "export-trigger";
    document.body.appendChild(triggerEl);
    triggerEl.focus();
  });

  afterEach(() => {
    cleanup();
    triggerEl.remove();
    vi.clearAllMocks();
  });

  function mountMenu(
    opts: {
      visible?: boolean;
      pandocInfo?: { available: boolean } | null;
      pdfEnginePath?: string | null;
    } = {}
  ) {
    events = {
      onExportHtml: vi.fn<() => void>(),
      onExportDocx: vi.fn<() => void>(),
      onExportPdf: vi.fn<() => void>(),
      onPrint: vi.fn<() => void>(),
      onClose: vi.fn<() => void>(),
    };
    const result = render(ExportMenu, {
      props: {
        visible: opts.visible ?? false,
        pandocInfo: opts.pandocInfo === undefined ? { available: true } : opts.pandocInfo,
        pdfEnginePath: opts.pdfEnginePath ?? null,
        ...events,
      },
    });
    rerender = result.rerender;
  }

  async function openMenu() {
    await rerender({ visible: true });
  }

  async function closeMenu() {
    await rerender({ visible: false });
  }

  function menuEl() {
    return document.getElementById("export-menu");
  }

  function menuButtons() {
    return Array.from(document.querySelectorAll<HTMLButtonElement>("button.menu-item"));
  }

  async function keydownOnMenu(key: string) {
    await fireEvent.keyDown(menuEl()!, { key });
  }

  describe("基础渲染", () => {
    it("visible=false 时不渲染菜单", () => {
      mountMenu({ visible: false });
      expect(menuEl()).toBeNull();
    });

    it("visible=true 时渲染并带 ARIA 属性", () => {
      mountMenu({ visible: true });
      const menu = menuEl();
      expect(menu).not.toBeNull();
      expect(menu!.getAttribute("role")).toBe("menu");
      expect(menu!.getAttribute("aria-label")).toBe("导出");
      const items = menuButtons();
      expect(items.length).toBe(4);
      items.forEach((item) => {
        expect(item.getAttribute("role")).toBe("menuitem");
      });
    });

    it("pandoc 不可用时 DOCX 禁用,可用时启用", async () => {
      mountMenu({ visible: true, pandocInfo: null });
      expect(menuButtons()[1].disabled).toBe(true);

      await rerender({ pandocInfo: { available: true } });
      expect(menuButtons()[1].disabled).toBe(false);
    });
  });

  describe("键盘导航", () => {
    it("打开时聚焦第一个菜单项", async () => {
      mountMenu();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0]);
    });

    it("ArrowDown 移动到下一项,ArrowUp 回到上一项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[1]);
      await keydownOnMenu("ArrowUp");
      expect(document.activeElement).toBe(menuButtons()[0]);
    });

    it("方向键跳过禁用项(pandoc 不可用时 DOCX 被跳过)", async () => {
      mountMenu({ pandocInfo: null });
      await openMenu();
      // 首项是 HTML,下一项应为 PDF(跳过禁用的 DOCX)
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[2]);
    });

    it("ArrowDown 越过末尾循环回第一项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("End");
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[0]);
    });

    it("Home/End 跳转首尾项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("End");
      expect(document.activeElement).toBe(menuButtons()[3]);
      await keydownOnMenu("Home");
      expect(document.activeElement).toBe(menuButtons()[0]);
    });

    it("Esc 关闭菜单", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Escape");
      expect(events.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("焦点管理", () => {
    it("关闭时焦点归还触发按钮", async () => {
      mountMenu();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0]);
      await closeMenu();
      expect(document.activeElement).toBe(triggerEl);
    });

    it("Tab 关闭菜单但不抢回焦点", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Tab");
      expect(events.onClose).toHaveBeenCalledTimes(1);
      // Tab 语义:焦点交给浏览器移动到下一个控件,不归还触发按钮
      expect(document.activeElement).not.toBe(triggerEl);
    });

    it("Tab 关闭后的 suppressRestore 不泄漏到下一次开关循环", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Tab");
      // 模拟 App 收到 close 后关闭菜单:visible 变 false 分支消费 suppressRestore
      await closeMenu();
      expect(document.activeElement).not.toBe(triggerEl);

      // 模拟用户重新点击触发按钮打开菜单
      triggerEl.focus();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0]);
      await closeMenu();
      expect(document.activeElement).toBe(triggerEl);
    });
  });

  describe("菜单项点击事件", () => {
    it("点击导出 HTML 触发 onExportHtml", async () => {
      mountMenu();
      await openMenu();
      menuButtons()[0].click();
      expect(events.onExportHtml).toHaveBeenCalledTimes(1);
    });

    it("点击导出 DOCX 触发 onExportDocx", async () => {
      mountMenu();
      await openMenu();
      menuButtons()[1].click();
      expect(events.onExportDocx).toHaveBeenCalledTimes(1);
    });

    it("DOCX 禁用时点击不触发", async () => {
      mountMenu({ pandocInfo: null });
      await openMenu();
      menuButtons()[1].click();
      expect(events.onExportDocx).not.toHaveBeenCalled();
    });

    it("点击导出 PDF 触发 onExportPdf", async () => {
      mountMenu();
      await openMenu();
      menuButtons()[2].click();
      expect(events.onExportPdf).toHaveBeenCalledTimes(1);
    });

    it("点击打印同时触发 onPrint 与 onClose", async () => {
      mountMenu();
      await openMenu();
      menuButtons()[3].click();
      expect(events.onPrint).toHaveBeenCalledTimes(1);
      expect(events.onClose).toHaveBeenCalledTimes(1);
    });
  });
});
