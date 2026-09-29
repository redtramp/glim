/**
 * Banner 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 渲染状态消息
 * - 渲染四个操作按钮: 重新加载、查看差异、忽略、启用自动重载
 * - 点击按钮时触发对应 callback
 * - 不显示时不渲染内容
 *
 * i18n:原自建 createI18n 实例 → 自研 locale 模块 mock（消息取值不变）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import Banner from "./Banner.svelte";
import type { Tab } from "../composables/useTabs.svelte.ts";

// Mock 自研 i18n（原 createI18n({ messages }) 的等价迁移）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "editor.externalChangedTitle": "文件已在外部修改",
      "banner.reload": "重新加载",
      "banner.viewDiff": "查看差异",
      "banner.ignore": "忽略",
      "banner.autoReload": "启用自动重载",
    };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

// 测试用的 Tab 工厂
function makeTab(
  id = "tab-1",
  path = "/root/test.md",
  staleSince: number | null = null
): Tab {
  return {
    id,
    path,
    content: "# Hello",
    draftContent: "# Hello",
    isDirty: false,
    isEditing: false,
    headings: [],
    scrollTop: 0,
    pendingHash: "",
    pendingScrollTop: 0,
    pendingSourceLine: 0,
    staleSince,
  };
}

describe("Banner", () => {
  let mockFn: () => void;

  beforeEach(() => {
    localStorage.setItem("glim-reader-locale", "zh-CN");
    mockFn = vi.fn() as unknown as () => void;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderBanner(tab: Tab | null, visible = true) {
    return render(Banner, {
      props: {
        tab,
        visible,
        onReload: mockFn,
        onViewDiff: mockFn,
        onIgnore: mockFn,
        onAutoReload: mockFn,
      },
    });
  }

  describe("渲染", () => {
    it("visible 为 true 时渲染 banner 容器", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector(".banner")).toBeTruthy();
    });

    it("visible 为 false 时不渲染 banner 容器", () => {
      const { container } = renderBanner(makeTab(), false);
      expect(container.querySelector(".banner")).toBeNull();
    });

    it("tab 为 null 时不渲染 banner 容器", () => {
      const { container } = renderBanner(null, true);
      expect(container.querySelector(".banner")).toBeNull();
    });

    it("渲染文件名", () => {
      const { container } = renderBanner(makeTab("tab-1", "/root/test.md"));
      expect(container.querySelector(".banner-filename")!.textContent).toContain("test.md");
    });

    it("渲染状态消息提示", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector(".banner-message")).toBeTruthy();
    });
  });

  describe("按钮渲染", () => {
    it("渲染重新加载按钮", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector("[data-action='reload']")).toBeTruthy();
    });

    it("渲染查看差异按钮", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector("[data-action='view-diff']")).toBeTruthy();
    });

    it("渲染忽略按钮", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector("[data-action='ignore']")).toBeTruthy();
    });

    it("渲染启用自动重载按钮", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector("[data-action='auto-reload']")).toBeTruthy();
    });
  });

  describe("文件名", () => {
    it("深路径显示文件名", () => {
      const { container } = renderBanner(makeTab("tab-1", "/root/deep/dir/doc.md"));
      expect(container.querySelector(".banner-filename")!.textContent).toBe("doc.md");
    });

    it("Windows 反斜杠路径显示文件名", () => {
      const { container } = renderBanner(makeTab("tab-1", "C:\\docs\\dir\\file.md"));
      expect(container.querySelector(".banner-filename")!.textContent).toBe("file.md");
    });
  });

  describe("timeText 时间文本", () => {
    it("无 staleSince 时时间为空", () => {
      const { container } = renderBanner(makeTab());
      expect(container.querySelector(".banner-time")!.textContent).toBe("（）");
    });

    it("60 秒内显示秒数", () => {
      const { container } = renderBanner(makeTab("tab-1", "/root/test.md", Date.now() - 30_000));
      expect(container.querySelector(".banner-time")!.textContent).toContain("30秒前");
    });

    it("1 小时内显示分钟数", () => {
      const { container } = renderBanner(
        makeTab("tab-1", "/root/test.md", Date.now() - 5 * 60_000)
      );
      expect(container.querySelector(".banner-time")!.textContent).toContain("5分钟前");
    });

    it("超过 1 小时显示小时数", () => {
      const { container } = renderBanner(
        makeTab("tab-1", "/root/test.md", Date.now() - 2 * 3_600_000)
      );
      expect(container.querySelector(".banner-time")!.textContent).toContain("2小时前");
    });
  });

  describe("事件", () => {
    it("点击重新加载按钮触发 onReload", async () => {
      const { container } = renderBanner(makeTab());
      await fireEvent.click(container.querySelector("[data-action='reload']")!);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("点击查看差异按钮触发 onViewDiff", async () => {
      const { container } = renderBanner(makeTab());
      await fireEvent.click(container.querySelector("[data-action='view-diff']")!);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("点击忽略按钮触发 onIgnore", async () => {
      const { container } = renderBanner(makeTab());
      await fireEvent.click(container.querySelector("[data-action='ignore']")!);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("点击启用自动重载按钮触发 onAutoReload", async () => {
      const { container } = renderBanner(makeTab());
      await fireEvent.click(container.querySelector("[data-action='auto-reload']")!);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
