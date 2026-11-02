/**
 * DiffView 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 渲染 diff 内容
 * - 显示新增行（绿色）
 * - 显示删除行（红色）
 * - 关闭时触发 onClose 回调
 * - 无 diff 时显示提示
 *
 * 迁移要点:
 * - emit("close") → onClose prop 回调
 * - vue-i18n 实例 → 自研 locale 模块 mock(map 仅放断言用到的 diff.* 键)
 * - wrapper.find/findAll → container.querySelector/querySelectorAll
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import DiffView from "./DiffView.svelte";

// Mock 自研 i18n(原测试 global.plugins:[i18n] 的等价迁移)
vi.mock("../i18n/locale.svelte.ts", () => {
  const map: Record<string, string> = {
    "diff.title": "差异对比",
    "diff.noChanges": "无变化",
  };
  return {
    t: (key: string) => map[key] ?? key,
    locale: { value: "zh-CN" },
    setLocale: vi.fn(),
    persistLocale: vi.fn(),
    detectLocale: vi.fn(() => "zh-CN"),
  };
});

describe("DiffView", () => {
  let onClose: Mock<() => void>;

  beforeEach(() => {
    // Ruling 7:jsdom navigator 为 en-US,种子 storage 使 detectLocale 走已存路径
    localStorage.setItem("glim-reader-locale", "zh-CN");
    onClose = vi.fn<() => void>();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderDiff(
    oldContent: string,
    newContent: string,
    visible = true
  ) {
    return render(DiffView, {
      props: { oldContent, newContent, fileName: "test.md", visible, onClose },
    }).container;
  }

  function addedTexts(root: Element) {
    return Array.from(root.querySelectorAll(".diff-line.added")).map(
      (el) => el.querySelector(".diff-text")?.textContent ?? ""
    );
  }

  function removedTexts(root: Element) {
    return Array.from(root.querySelectorAll(".diff-line.removed")).map(
      (el) => el.querySelector(".diff-text")?.textContent ?? ""
    );
  }

  describe("渲染", () => {
    it("visible 为 true 时渲染 diff 容器", () => {
      const container = renderDiff("# Hello", "# Hello World");
      expect(container.querySelector(".diff-view")).not.toBeNull();
    });

    it("visible 为 false 时不渲染 diff 容器", () => {
      const container = renderDiff("# Hello", "# Hello World", false);
      expect(container.querySelector(".diff-view")).toBeNull();
    });

    it("渲染标题和文件名", () => {
      const container = renderDiff("# Hello", "# Hello World");
      expect(container.querySelector(".diff-title")!.textContent).toContain("差异对比");
      expect(container.querySelector(".diff-filename")!.textContent).toContain("test.md");
    });
  });

  describe("diff 输出", () => {
    it("显示无变化时提示", () => {
      const container = renderDiff("# Hello", "# Hello");
      expect(container.querySelector(".diff-empty")).not.toBeNull();
    });

    it("显示新增行（绿色）", () => {
      const container = renderDiff("# Hello\n", "# Hello\nWorld\n");
      const added = container.querySelectorAll(".diff-line.added");
      expect(added.length).toBeGreaterThan(0);
      expect(added[0]!.textContent).toContain("World");
    });

    it("显示删除行（红色）", () => {
      const container = renderDiff("# Hello\nWorld\n", "# Hello\n");
      const removed = container.querySelectorAll(".diff-line.removed");
      expect(removed.length).toBeGreaterThan(0);
      expect(removed[0]!.textContent).toContain("World");
    });

    it("正确处理中间插入（不产生错误的增删行）", () => {
      const container = renderDiff("a\nb\nc\n", "a\nX\nb\nc\n");
      expect(addedTexts(container)).toEqual(["X"]);
      expect(removedTexts(container)).toEqual([]);
    });

    it("正确处理中间删除（不产生错误的增删行）", () => {
      const container = renderDiff("a\nX\nb\nc\n", "a\nb\nc\n");
      expect(addedTexts(container)).toEqual([]);
      expect(removedTexts(container)).toEqual(["X"]);
    });
  });

  describe("事件", () => {
    it("点击关闭按钮触发 onClose", async () => {
      const container = renderDiff("# Hello", "# Hello World");
      await fireEvent.click(container.querySelector("[data-action='close']")!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
