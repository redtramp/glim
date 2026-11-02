/**
 * FileTree 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标：
 * - 默认全部折叠（懒加载：点击三角才加载并展开下一级，仅下一级）
 * - 当前文件在树中高亮 (.active)
 * - 根目录/聚焦信号变化时重置为全部折叠
 * - `..` 上一级入口
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import FileTree from "./FileTree.svelte";
import type { TreeNode } from "../composables/useFileTree.svelte.ts";

// Mock 自研 i18n（FileTree 使用 t("app.goUp") 渲染 title）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = { "app.goUp": "上一级目录" };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

// ─── Mock TreeNode 工厂 ───────────────────────────────────────
// loaded=true 表示子级已加载（children 存在）；false 表示尚未懒加载
function makeDir(
  name: string,
  path: string,
  children?: TreeNode[],
  loaded = true
): TreeNode {
  return { name, path, isDir: true, loaded, children };
}

function makeFile(name: string, path: string): TreeNode {
  return { name, path, isDir: false };
}

// 构建一个嵌套目录树（模拟已懒加载的子级）：
// root/
//   docs/
//     guide.md
//     advanced/
//       plugin.md
//   README.md

const sampleNodes: TreeNode[] = [
  makeDir("docs", "/root/docs", [
    makeFile("guide.md", "/root/docs/guide.md"),
    makeDir("advanced", "/root/docs/advanced", [
      makeFile("plugin.md", "/root/docs/advanced/plugin.md"),
    ]),
  ]),
  makeFile("README.md", "/root/README.md"),
];

// 目录行是否处于折叠状态（.row.dir 上的 is-collapsed class）
function isCollapsed(container: HTMLElement, idx: number): boolean {
  return Boolean(
    container.querySelectorAll(".dir")[idx]?.classList.contains("is-collapsed")
  );
}

// ─── 测试 ─────────────────────────────────────────────────────

describe("FileTree", () => {
  let mockScrollIntoView: ReturnType<typeof vi.fn>;
  let mockScrollContainer: HTMLElement;
  let loadChildrenMock: Mock<(node: TreeNode) => Promise<void>>;

  function renderTree(
    nodes: TreeNode[],
    currentPath = "",
    extra: Record<string, unknown> = {}
  ) {
    const onOpen = vi.fn();
    const onGoUp = vi.fn();
    const result = render(FileTree, {
      props: {
        nodes,
        currentPath,
        scrollContainer: mockScrollContainer,
        loadChildren: loadChildrenMock,
        onOpen,
        onGoUp,
        ...extra,
      },
    });
    mockScrollContainer.appendChild(result.container);
    return { ...result, onOpen, onGoUp };
  }

  beforeEach(() => {
    mockScrollIntoView = vi.fn();
    (window.HTMLElement.prototype as any).scrollIntoView = mockScrollIntoView;
    loadChildrenMock = vi
      .fn<(node: TreeNode) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.clearAllMocks();
    mockScrollContainer = document.createElement("div");
    mockScrollContainer.className = "tree-scroll";
    document.body.appendChild(mockScrollContainer);
  });

  afterEach(() => {
    cleanup();
    mockScrollContainer.remove();
    delete (window.HTMLElement.prototype as any).scrollIntoView;
  });

  // ─── 基础渲染 ────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders root-level files, keeping directories collapsed by default", () => {
      const { container } = renderTree(sampleNodes, "");
      expect(container.querySelector(".tree.root")).not.toBeNull();
      // 目录默认折叠：docs 的子文件不可见，只有根层 README.md
      expect(container.querySelectorAll(".file").length).toBe(1);
      expect(
        container.querySelectorAll(".file")[0].querySelector(".name")!.textContent
      ).toBe("README.md");
      // 所有可见目录默认折叠
      expect(isCollapsed(container, 0)).toBe(true);
    });
  });

  // ─── 展开/折叠 + 懒加载 ──────────────────────────────────────

  describe("toggle & lazy load", () => {
    it("expands a loaded directory on click and collapses on second click", async () => {
      const { container } = renderTree(sampleNodes, "");
      expect(isCollapsed(container, 0)).toBe(true);

      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      expect(isCollapsed(container, 0)).toBe(false);
      // 展开后 docs 的子文件可见（guide.md + README.md）
      expect(container.querySelectorAll(".file").length).toBe(2);

      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      expect(isCollapsed(container, 0)).toBe(true);
    });

    it("lazy-loads children via loadChildren when clicking an unloaded directory", async () => {
      const unloaded: TreeNode[] = [
        makeDir("docs", "/root/docs", undefined, false),
        makeFile("README.md", "/root/README.md"),
      ];
      loadChildrenMock.mockImplementation(async (node: TreeNode) => {
        node.children = [makeFile("guide.md", "/root/docs/guide.md")];
        node.loaded = true;
      });
      const { container } = renderTree(unloaded, "");

      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      expect(loadChildrenMock).toHaveBeenCalledWith(unloaded[0]);
      await tick();

      expect(isCollapsed(container, 0)).toBe(false);
      const names = Array.from(container.querySelectorAll(".file")).map(
        (f) => f.querySelector(".name")!.textContent
      );
      expect(names).toContain("guide.md");
      expect(names).toContain("README.md");
    });

    it("does not expand when lazy loading fails", async () => {
      const unloaded: TreeNode[] = [
        makeDir("docs", "/root/docs", undefined, false),
      ];
      loadChildrenMock.mockRejectedValue(new Error("boom"));
      const { container } = renderTree(unloaded, "");

      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      expect(isCollapsed(container, 0)).toBe(true);
    });
  });

  // ─── currentPath 高亮 ────────────────────────────────────────

  describe("active highlighting", () => {
    it("marks the current file as active once its directory is expanded", async () => {
      const { container } = renderTree(sampleNodes, "/root/docs/guide.md");
      // 目录默认折叠，active 文件不可见
      expect(container.querySelector(".row.file.active")).toBeNull();

      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      const active = container.querySelector(".row.file.active");
      expect(active).not.toBeNull();
      expect(active!.querySelector(".name")!.textContent).toBe("guide.md");
    });

    it("does not mark non-current files as active", async () => {
      const { container } = renderTree(sampleNodes, "/root/docs/guide.md");
      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      const readmeFile = Array.from(
        container.querySelectorAll(".row.file")
      ).find((el) => el.querySelector(".name")!.textContent === "README.md");
      expect(readmeFile!.classList.contains("active")).toBe(false);
    });
  });

  // ─── currentPath 变化时滚动定位（不自动展开）─────────────────

  describe("scroll on currentPath change", () => {
    it("scrolls the active file into view without auto-expanding collapsed dirs", async () => {
      const { container, rerender } = renderTree(sampleNodes, "");
      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();

      await rerender({ currentPath: "/root/docs/guide.md" });
      await new Promise((r) => setTimeout(r, 100));

      expect(mockScrollIntoView).toHaveBeenCalled();
      // 保持展开状态：当前文件所在目录由用户手动控制，不自动摊开其他目录
      expect(isCollapsed(container, 0)).toBe(false);
    });
  });

  // ─── 根目录/聚焦信号变化：重置为全部折叠 ─────────────────────

  describe("reset on root change", () => {
    it("collapses all directories when rootDir changes", async () => {
      const { container, rerender } = renderTree(
        sampleNodes,
        "/root/docs/guide.md"
      );
      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      expect(isCollapsed(container, 0)).toBe(false);

      await rerender({ rootDir: "/other" });
      await tick();
      // 新树按折叠状态渲染，避免旧展开状态残留
      expect(isCollapsed(container, 0)).toBe(true);
    });

    it("collapses all directories when focusKey changes", async () => {
      const { container, rerender } = renderTree(
        sampleNodes,
        "/root/docs/guide.md"
      );
      await fireEvent.click(container.querySelectorAll(".dir")[0]);
      await tick();
      expect(isCollapsed(container, 0)).toBe(false);

      await rerender({ focusKey: 1 });
      await tick();
      expect(isCollapsed(container, 0)).toBe(true);
    });
  });

  // ─── 上一级目录（..）入口 ────────────────────────────────────

  describe("go up navigation", () => {
    it("renders .. entry at root level when canGoUp is true", () => {
      const { container } = renderTree(sampleNodes, "", { canGoUp: true });
      expect(container.querySelector(".go-up")).not.toBeNull();
      expect(
        container.querySelector(".go-up .name")!.textContent
      ).toBe("..");
    });

    it("does not render .. entry when canGoUp is false", () => {
      const { container } = renderTree(sampleNodes, "");
      expect(container.querySelector(".go-up")).toBeNull();
    });

    it("triggers go-up when .. is clicked", async () => {
      const { container, onGoUp } = renderTree(sampleNodes, "", {
        canGoUp: true,
      });
      await fireEvent.click(container.querySelector(".go-up")!);
      expect(onGoUp).toHaveBeenCalled();
    });
  });

  // ─── 边缘情况 ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("does not crash when currentPath is empty", () => {
      const { container } = renderTree(sampleNodes, "");
      expect(container.querySelector(".row.file.active")).toBeNull();
    });

    it("does not crash when currentPath points to a non-existent file", () => {
      const { container } = renderTree(sampleNodes, "/nonexistent/file.md");
      expect(container.querySelector(".row.file.active")).toBeNull();
    });

    it("handles flat file list without directories", () => {
      const flatNodes: TreeNode[] = [
        makeFile("a.md", "/root/a.md"),
        makeFile("b.md", "/root/b.md"),
      ];
      const { container } = renderTree(flatNodes, "/root/a.md");
      expect(
        container
          .querySelector(".row.file.active")!
          .querySelector(".name")!.textContent
      ).toBe("a.md");
    });
  });
});
