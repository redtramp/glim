/**
 * offscreenRender 测试（阶段二 Task 4）
 *
 * 单一视图下导出/打印不再依赖 markdown-it 渲染的视图 DOM，需一次性离屏渲染。
 * 验证：按 renderMarkdown → rewriteImagesAndLinks → renderMath → renderMermaidAll
 * 顺序组装、产出 .markdown-body 元素、注入渲染 HTML、透传路径上下文、不改写源文本。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const renderMarkdown = vi.fn();
const renderMath = vi.fn();
const renderMermaidAll = vi.fn();
const rewriteImagesAndLinks = vi.fn();

vi.mock("./useMarkdown", () => ({
  renderMarkdown: (...args: unknown[]) => renderMarkdown(...args),
  renderMath: (...args: unknown[]) => renderMath(...args),
  renderMermaidAll: (...args: unknown[]) => renderMermaidAll(...args),
}));
vi.mock("./useLinkRewriter", () => ({
  rewriteImagesAndLinks: (...args: unknown[]) => rewriteImagesAndLinks(...args),
}));

import { renderOffscreen } from "./offscreenRender";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renderOffscreen", () => {
  it("产出 .markdown-body 元素并注入渲染后的 HTML", async () => {
    renderMarkdown.mockResolvedValue('<h1 id="a" data-source-line="1">A</h1>');
    renderMath.mockResolvedValue(undefined);
    renderMermaidAll.mockResolvedValue(undefined);

    const el = await renderOffscreen("# A", "/docs/a.md", "/docs");

    expect(el.classList.contains("markdown-body")).toBe(true);
    expect(el.innerHTML).toContain('data-source-line="1"');
    expect(el.querySelector("h1")?.textContent).toBe("A");
  });

  it("按正确顺序调用四步（链接改写 → 数学 → Mermaid 全量渲染）", async () => {
    renderMarkdown.mockResolvedValue("<p>x</p>");
    renderMath.mockResolvedValue(undefined);
    renderMermaidAll.mockResolvedValue(undefined);
    const calls: string[] = [];
    renderMarkdown.mockImplementation(async () => { calls.push("markdown"); return "<p>x</p>"; });
    rewriteImagesAndLinks.mockImplementation(() => { calls.push("links"); });
    renderMath.mockImplementation(async () => { calls.push("math"); });
    renderMermaidAll.mockImplementation(async () => { calls.push("mermaid"); });

    await renderOffscreen("x", "/docs/a.md", "/docs");

    expect(calls).toEqual(["markdown", "links", "math", "mermaid"]);
  });

  it("透传 currentFile / rootDir 给链接改写回调", async () => {
    renderMarkdown.mockResolvedValue("<p>x</p>");
    renderMath.mockResolvedValue(undefined);
    renderMermaidAll.mockResolvedValue(undefined);

    await renderOffscreen("x", "/docs/a.md", "/docs");

    expect(rewriteImagesAndLinks).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { currentFile: "/docs/a.md", rootDir: "/docs" },
      expect.any(Function),
    );
  });

  it("renderMarkdown 失败时向上抛出，不产出半成品元素", async () => {
    renderMarkdown.mockRejectedValue(new Error("render failed"));
    await expect(renderOffscreen("x", "", "")).rejects.toThrow("render failed");
    expect(rewriteImagesAndLinks).not.toHaveBeenCalled();
  });

  it("源文本不被改写（严格无损）", async () => {
    renderMarkdown.mockResolvedValue("<p>x</p>");
    renderMath.mockResolvedValue(undefined);
    renderMermaidAll.mockResolvedValue(undefined);
    const src = "# A\n\n**bold**\n";
    await renderOffscreen(src, "", "");
    expect(renderMarkdown).toHaveBeenCalledWith(src);
  });
});
