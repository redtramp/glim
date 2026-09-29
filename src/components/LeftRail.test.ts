/**
 * LeftRail 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标（与旧版一一对应）:
 * - 渲染 15 个图标按钮与 3 条分组分隔线（位置正确）
 * - 点击图标回调 onOpenPanel
 * - 当前激活面板高亮（active 类 + aria-pressed）
 * - 按钮 title 使用 i18n 文案
 * - 滚动时淡出（dimmed），1.5s 后恢复，连续滚动重置计时器
 * - 卸载时移除滚动监听并清理计时器
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import LeftRail from "./LeftRail.svelte";
import type { LeftPanelID } from "../composables/useFloatLayout.svelte.ts";

// Mock 自研 i18n（原测试 mock vue-i18n 的等价迁移）
vi.mock("../i18n/locale.svelte.ts", () => ({
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
  locale: "zh-CN",
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
}));

function renderLeftRail(props: {
  activePanel: LeftPanelID | null;
  dynamicIcons?: Record<string, string>;
}) {
  const onOpenPanel = vi.fn();
  const result = render(LeftRail, { props: { ...props, onOpenPanel } });
  return { ...result, onOpenPanel };
}

describe("LeftRail", () => {
  afterEach(() => cleanup());

  it("渲染 15 个图标按钮", () => {
    const { container } = renderLeftRail({ activePanel: null });
    expect(container.querySelectorAll(".left-rail-btn")).toHaveLength(15);
  });

  it("渲染 3 条分隔线", () => {
    const { container } = renderLeftRail({ activePanel: null });
    expect(container.querySelectorAll(".left-rail-sep")).toHaveLength(3);
  });

  it("分隔线位于分组边界", () => {
    const { container } = renderLeftRail({ activePanel: null });
    const children = Array.from(
      container.querySelector(".left-rail-inner")!.children
    );
    expect(children).toHaveLength(18);
    const sepIndexes = new Set([2, 6, 12]);
    children.forEach((node, idx) => {
      if (sepIndexes.has(idx)) {
        expect(node.classList.contains("left-rail-sep")).toBe(true);
      } else {
        expect(node.classList.contains("left-rail-btn")).toBe(true);
      }
    });
  });

  it("点击图标触发 onOpenPanel", async () => {
    const { container, onOpenPanel } = renderLeftRail({ activePanel: null });
    const buttons = container.querySelectorAll<HTMLButtonElement>(".left-rail-btn");
    await fireEvent.click(buttons[0]);
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("filetree");
  });

  it("每个图标触发正确的 panel id", async () => {
    const { container, onOpenPanel } = renderLeftRail({ activePanel: null });
    const buttons = container.querySelectorAll<HTMLButtonElement>(".left-rail-btn");
    const expectedIds = [
      "filetree", "history", "search", "annotations", "bookmark",
      "new-file", "open-file", "open-folder", "export", "edit",
      "ai", "settings", "help", "locale-toggle", "theme-toggle",
    ];
    for (let i = 0; i < buttons.length; i++) {
      await fireEvent.click(buttons[i]);
      expect(onOpenPanel).toHaveBeenLastCalledWith(expectedIds[i]);
    }
  });

  it("activePanel 匹配时图标高亮，其余不高亮", () => {
    const { container } = renderLeftRail({ activePanel: "search" });
    const buttons = container.querySelectorAll(".left-rail-btn");
    expect(buttons[2].classList.contains("active")).toBe(true);
    buttons.forEach((btn, idx) => {
      if (idx !== 2) expect(btn.classList.contains("active")).toBe(false);
    });
  });

  it("active 按钮 aria-pressed=true，其余 false", () => {
    const { container } = renderLeftRail({ activePanel: "ai" });
    const buttons = container.querySelectorAll(".left-rail-btn");
    expect(buttons[10].getAttribute("aria-pressed")).toBe("true");
    buttons.forEach((btn, idx) => {
      if (idx !== 10) expect(btn.getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("按钮 title 使用 i18n 文案（未映射 key 原样返回）", () => {
    const { container } = renderLeftRail({ activePanel: null });
    const buttons = container.querySelectorAll(".left-rail-btn");
    expect(buttons[0].getAttribute("title")).toBe("文件树");
    expect(buttons[4].getAttribute("title")).toBe("书签");
    expect(buttons[5].getAttribute("title")).toBe("float.newFile");
    expect(buttons[10].getAttribute("title")).toBe("AI 助手");
    expect(buttons[14].getAttribute("title")).toBe("切换主题");
  });

  it("导航栏含 aria-label", () => {
    const { container } = renderLeftRail({ activePanel: null });
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBe("toolbar");
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
    cleanup();
    vi.useRealTimers();
  });

  function dispatchScroll(): void {
    scrollRoot.dispatchEvent(new Event("scroll"));
  }

  it("滚动时添加 dimmed 类", async () => {
    const { container } = renderLeftRail({ activePanel: null });
    dispatchScroll();
    await tick();
    expect(container.querySelector("nav")!.classList.contains("dimmed")).toBe(true);
  });

  it("滚动后 1.5s 自动恢复", async () => {
    vi.useFakeTimers();
    const { container } = renderLeftRail({ activePanel: null });
    dispatchScroll();
    await tick();
    expect(container.querySelector("nav")!.classList.contains("dimmed")).toBe(true);

    await vi.advanceTimersByTimeAsync(1500);
    await tick();
    expect(container.querySelector("nav")!.classList.contains("dimmed")).toBe(false);
  });

  it("连续滚动重置计时器", async () => {
    vi.useFakeTimers();
    const { container } = renderLeftRail({ activePanel: null });
    dispatchScroll();
    await vi.advanceTimersByTimeAsync(1000);
    dispatchScroll();
    await vi.advanceTimersByTimeAsync(1000);
    expect(container.querySelector("nav")!.classList.contains("dimmed")).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    await tick();
    expect(container.querySelector("nav")!.classList.contains("dimmed")).toBe(false);
  });

  it("卸载时移除滚动监听并清理计时器", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(scrollRoot, "removeEventListener");
    const { unmount } = renderLeftRail({ activePanel: null });
    dispatchScroll();
    unmount();
    expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
