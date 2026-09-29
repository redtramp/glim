/**
 * FileTree 组件测试
 *
 * 测试目标：
 * - 默认全部折叠（懒加载：点击三角才加载并展开下一级，仅下一级）
 * - 当前文件在树中高亮 (.active)
 * - 根目录/聚焦信号变化时重置为全部折叠
 * - `..` 上一级入口
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import FileTree from "../components/FileTree.vue";
import type { TreeNode } from "../composables/useFileTree.svelte.ts";

// 全局 i18n 实例（FileTree 使用 t("app.goUp") 渲染 title）
const i18n = createI18n({
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      app: {
        goUp: "上一级目录",
      },
    },
  },
});

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
function isCollapsed(wrapper: VueWrapper, idx: number): boolean {
  return Boolean(wrapper.findAll(".dir")[idx]?.classes("is-collapsed"));
}

// ─── 测试 ─────────────────────────────────────────────────────

describe("FileTree", () => {
  let wrapper: VueWrapper;
  let mockScrollIntoView: ReturnType<typeof vi.fn>;
  let mockScrollContainer: HTMLElement;
  let loadChildrenMock: Mock<(node: TreeNode) => Promise<void>>;

  function renderTree(nodes: TreeNode[], currentPath = "", extra: object = {}) {
    const w = mount(FileTree, {
      props: {
        nodes,
        currentPath,
        scrollContainer: mockScrollContainer,
        loadChildren: loadChildrenMock,
        ...extra,
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    mockScrollContainer.appendChild(w.element);
    return w;
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
    wrapper?.unmount();
    mockScrollContainer.remove();
    delete (window.HTMLElement.prototype as any).scrollIntoView;
  });

  // ─── 基础渲染 ────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders root-level files, keeping directories collapsed by default", () => {
      wrapper = renderTree(sampleNodes, "");
      expect(wrapper.find(".tree.root").exists()).toBe(true);
      // 目录默认折叠：docs 的子文件不可见，只有根层 README.md
      expect(wrapper.findAll(".file").length).toBe(1);
      expect(wrapper.findAll(".file")[0].find(".name").text()).toBe(
        "README.md"
      );
      // 所有可见目录默认折叠
      expect(isCollapsed(wrapper, 0)).toBe(true);
    });
  });

  // ─── 展开/折叠 + 懒加载 ──────────────────────────────────────

  describe("toggle & lazy load", () => {
    it("expands a loaded directory on click and collapses on second click", async () => {
      wrapper = renderTree(sampleNodes, "");
      expect(isCollapsed(wrapper, 0)).toBe(true);

      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(false);
      // 展开后 docs 的子文件可见（guide.md + README.md）
      expect(wrapper.findAll(".file").length).toBe(2);

      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(true);
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
      wrapper = renderTree(unloaded, "");

      await wrapper.findAll(".dir")[0].trigger("click");
      expect(loadChildrenMock).toHaveBeenCalledWith(unloaded[0]);
      await wrapper.vm.$nextTick();

      expect(isCollapsed(wrapper, 0)).toBe(false);
      const names = wrapper
        .findAll(".file")
        .map((f) => f.find(".name").text());
      expect(names).toContain("guide.md");
      expect(names).toContain("README.md");
    });

    it("does not expand when lazy loading fails", async () => {
      const unloaded: TreeNode[] = [
        makeDir("docs", "/root/docs", undefined, false),
      ];
      loadChildrenMock.mockRejectedValue(new Error("boom"));
      wrapper = renderTree(unloaded, "");

      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(true);
    });
  });

  // ─── currentPath 高亮 ────────────────────────────────────────

  describe("active highlighting", () => {
    it("marks the current file as active once its directory is expanded", async () => {
      wrapper = renderTree(sampleNodes, "/root/docs/guide.md");
      // 目录默认折叠，active 文件不可见
      expect(wrapper.find(".row.file.active").exists()).toBe(false);

      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      const active = wrapper.find(".row.file.active");
      expect(active.exists()).toBe(true);
      expect(active.find(".name").text()).toBe("guide.md");
    });

    it("does not mark non-current files as active", async () => {
      wrapper = renderTree(sampleNodes, "/root/docs/guide.md");
      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      const readmeFile = wrapper
        .findAll(".row.file")
        .find((el) => el.find(".name").text() === "README.md");
      expect(readmeFile?.classes("active")).toBe(false);
    });
  });

  // ─── currentPath 变化时滚动定位（不自动展开）─────────────────

  describe("scroll on currentPath change", () => {
    it("scrolls the active file into view without auto-expanding collapsed dirs", async () => {
      wrapper = renderTree(sampleNodes, "");
      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();

      await wrapper.setProps({ currentPath: "/root/docs/guide.md" });
      await new Promise((r) => setTimeout(r, 100));

      expect(mockScrollIntoView).toHaveBeenCalled();
      // 保持展开状态：当前文件所在目录由用户手动控制，不自动摊开其他目录
      expect(isCollapsed(wrapper, 0)).toBe(false);
    });
  });

  // ─── 根目录/聚焦信号变化：重置为全部折叠 ─────────────────────

  describe("reset on root change", () => {
    it("collapses all directories when rootDir changes", async () => {
      wrapper = renderTree(sampleNodes, "/root/docs/guide.md");
      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(false);

      await wrapper.setProps({ rootDir: "/other" });
      await wrapper.vm.$nextTick();
      // 新树按折叠状态渲染，避免旧展开状态残留
      expect(isCollapsed(wrapper, 0)).toBe(true);
    });

    it("collapses all directories when focusKey changes", async () => {
      wrapper = renderTree(sampleNodes, "/root/docs/guide.md");
      await wrapper.findAll(".dir")[0].trigger("click");
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(false);

      await wrapper.setProps({ focusKey: 1 });
      await wrapper.vm.$nextTick();
      expect(isCollapsed(wrapper, 0)).toBe(true);
    });
  });

  // ─── 上一级目录（..）入口 ────────────────────────────────────

  describe("go up navigation", () => {
    it("renders .. entry at root level when canGoUp is true", () => {
      wrapper = renderTree(sampleNodes, "", { canGoUp: true });
      expect(wrapper.find(".go-up").exists()).toBe(true);
      expect(wrapper.find(".go-up .name").text()).toBe("..");
    });

    it("does not render .. entry when canGoUp is false", () => {
      wrapper = renderTree(sampleNodes, "");
      expect(wrapper.find(".go-up").exists()).toBe(false);
    });

    it("emits go-up when .. is clicked", async () => {
      wrapper = renderTree(sampleNodes, "", { canGoUp: true });
      await wrapper.find(".go-up").trigger("click");
      expect(wrapper.emitted("go-up")).toBeTruthy();
    });
  });

  // ─── 边缘情况 ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("does not crash when currentPath is empty", () => {
      wrapper = renderTree(sampleNodes, "");
      expect(wrapper.find(".row.file.active").exists()).toBe(false);
    });

    it("does not crash when currentPath points to a non-existent file", () => {
      wrapper = renderTree(sampleNodes, "/nonexistent/file.md");
      expect(wrapper.find(".row.file.active").exists()).toBe(false);
    });

    it("handles flat file list without directories", () => {
      const flatNodes: TreeNode[] = [
        makeFile("a.md", "/root/a.md"),
        makeFile("b.md", "/root/b.md"),
      ];
      wrapper = renderTree(flatNodes, "/root/a.md");
      expect(wrapper.find(".row.file.active").find(".name").text()).toBe(
        "a.md"
      );
    });
  });
});
