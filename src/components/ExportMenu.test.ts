/**
 * ExportMenu 组件测试
 *
 * 测试目标:
 * - 基础渲染:可见/隐藏切换、role=menu/menuitem、aria-label、id
 * - 禁用态:pandoc 不可用时 DOCX 禁用
 * - 键盘导航:方向键(跳过禁用项)/Home/End/Esc/Tab
 * - 焦点管理:打开聚焦首项、关闭归还焦点、Tab 关闭不抢焦点、跨开关循环不泄漏
 * - 事件:点击各菜单项 emit 对应事件,print 同时 emit close
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import ExportMenu from "./ExportMenu.vue";

const i18n = createI18n({
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      app: {
        usePath: "使用路径 {path}",
        specifyEdgePath: "指定 Edge 路径",
      },
      export: {
        export: "导出",
        html: "导出 HTML",
        htmlHint: "自包含 HTML",
        docx: "导出 DOCX",
        docxHint: "Word 文档",
        docxRequiresPandoc: "需要 pandoc",
        pdf: "导出 PDF",
        pdfHint: "PDF",
        pdfNoEdge: "未检测到 Edge",
        print: "打印",
        printHint: "打印对话框",
      },
    },
  },
});

describe("ExportMenu", () => {
  let wrapper: VueWrapper;
  let mockExportHtml: (() => void) | undefined;
  let mockExportDocx: (() => void) | undefined;
  let mockExportPdf: (() => void) | undefined;
  let mockPrint: (() => void) | undefined;
  let mockClose: (() => void) | undefined;
  let triggerEl: HTMLButtonElement;

  beforeEach(() => {
    mockExportHtml = vi.fn() as any;
    mockExportDocx = vi.fn() as any;
    mockExportPdf = vi.fn() as any;
    mockPrint = vi.fn() as any;
    mockClose = vi.fn() as any;
    // 模拟工具栏导出按钮作为焦点来源
    triggerEl = document.createElement("button");
    triggerEl.id = "export-trigger";
    document.body.appendChild(triggerEl);
    triggerEl.focus();
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.removeChild(triggerEl);
    vi.clearAllMocks();
  });

  function mountMenu(opts: {
    visible?: boolean;
    pandocInfo?: { available: boolean } | null;
    pdfEnginePath?: string | null;
  } = {}) {
    wrapper = mount(ExportMenu, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        visible: opts.visible ?? false,
        pandocInfo: opts.pandocInfo === undefined ? { available: true } : opts.pandocInfo,
        pdfEnginePath: opts.pdfEnginePath ?? null,
        "onExportHtml": mockExportHtml,
        "onExportDocx": mockExportDocx,
        "onExportPdf": mockExportPdf,
        "onPrint": mockPrint,
        "onClose": mockClose,
      },
    });
  }

  async function openMenu() {
    await wrapper.setProps({ visible: true });
    await nextTick();
  }

  async function closeMenu() {
    await wrapper.setProps({ visible: false });
    await nextTick();
  }

  function menuButtons() {
    return wrapper.findAll("button.menu-item");
  }

  async function keydownOnMenu(key: string) {
    await wrapper.find("#export-menu").trigger("keydown", { key });
    await nextTick();
  }

  describe("基础渲染", () => {
    it("visible=false 时不渲染菜单", () => {
      mountMenu({ visible: false });
      expect(wrapper.find("#export-menu").exists()).toBe(false);
    });

    it("visible=true 时渲染并带 ARIA 属性", () => {
      mountMenu({ visible: true });
      const menu = wrapper.find("#export-menu");
      expect(menu.exists()).toBe(true);
      expect(menu.attributes("role")).toBe("menu");
      expect(menu.attributes("aria-label")).toBe("导出");
      const items = menuButtons();
      expect(items.length).toBe(4);
      items.forEach((item) => {
        expect(item.attributes("role")).toBe("menuitem");
      });
    });

    it("pandoc 不可用时 DOCX 禁用,可用时启用", async () => {
      mountMenu({ visible: true, pandocInfo: null });
      expect(menuButtons()[1].attributes("disabled")).toBeDefined();

      await wrapper.setProps({ pandocInfo: { available: true } });
      expect(menuButtons()[1].attributes("disabled")).toBeUndefined();
    });
  });

  describe("键盘导航", () => {
    it("打开时聚焦第一个菜单项", async () => {
      mountMenu();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0].element);
    });

    it("ArrowDown 移动到下一项,ArrowUp 回到上一项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[1].element);
      await keydownOnMenu("ArrowUp");
      expect(document.activeElement).toBe(menuButtons()[0].element);
    });

    it("方向键跳过禁用项(pandoc 不可用时 DOCX 被跳过)", async () => {
      mountMenu({ pandocInfo: null });
      await openMenu();
      // 首项是 HTML,下一项应为 PDF(跳过禁用的 DOCX)
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[2].element);
    });

    it("ArrowDown 越过末尾循环回第一项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("End");
      await keydownOnMenu("ArrowDown");
      expect(document.activeElement).toBe(menuButtons()[0].element);
    });

    it("Home/End 跳转首尾项", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("End");
      expect(document.activeElement).toBe(menuButtons()[3].element);
      await keydownOnMenu("Home");
      expect(document.activeElement).toBe(menuButtons()[0].element);
    });

    it("Esc 关闭菜单", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Escape");
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("焦点管理", () => {
    it("关闭时焦点归还触发按钮", async () => {
      mountMenu();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0].element);
      await closeMenu();
      expect(document.activeElement).toBe(triggerEl);
    });

    it("Tab 关闭菜单但不抢回焦点", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Tab");
      expect(mockClose).toHaveBeenCalledTimes(1);
      // Tab 语义:焦点交给浏览器移动到下一个控件,不归还触发按钮
      expect(document.activeElement).not.toBe(triggerEl);
    });

    it("Tab 关闭后的 suppressRestore 不泄漏到下一次开关循环", async () => {
      mountMenu();
      await openMenu();
      await keydownOnMenu("Tab");
      // 模拟 App 收到 close 后关闭菜单:watch 的 false 分支消费 suppressRestore
      await closeMenu();
      expect(document.activeElement).not.toBe(triggerEl);

      // 模拟用户重新点击触发按钮打开菜单
      triggerEl.focus();
      await openMenu();
      expect(document.activeElement).toBe(menuButtons()[0].element);
      await closeMenu();
      expect(document.activeElement).toBe(triggerEl);
    });
  });

  describe("菜单项点击事件", () => {
    it("点击导出 HTML emit export-html", async () => {
      mountMenu();
      await openMenu();
      await menuButtons()[0].trigger("click");
      expect(mockExportHtml).toHaveBeenCalledTimes(1);
    });

    it("点击导出 DOCX emit export-docx", async () => {
      mountMenu();
      await openMenu();
      await menuButtons()[1].trigger("click");
      expect(mockExportDocx).toHaveBeenCalledTimes(1);
    });

    it("DOCX 禁用时点击不 emit", async () => {
      mountMenu({ pandocInfo: null });
      await openMenu();
      await menuButtons()[1].trigger("click");
      expect(mockExportDocx).not.toHaveBeenCalled();
    });

    it("点击导出 PDF emit export-pdf", async () => {
      mountMenu();
      await openMenu();
      await menuButtons()[2].trigger("click");
      expect(mockExportPdf).toHaveBeenCalledTimes(1);
    });

    it("点击打印同时 emit print 与 close", async () => {
      mountMenu();
      await openMenu();
      await menuButtons()[3].trigger("click");
      expect(mockPrint).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
