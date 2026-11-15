/**
 * offscreenRender 集成测试：用真实 markdown-it 渲染管线（主线程 fallback），
 * 验证离屏元素含 [data-source-line] 锚点与渲染后的 HTML 结构。
 * 仅 mock 数学/Mermaid 渲染步骤（jsdom 下无布局、mermaid 依赖 canvas）。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./useMarkdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useMarkdown")>();
  return {
    ...actual,
    renderMath: vi.fn(async () => {}),
    renderMermaidAll: vi.fn(async () => {}),
  };
});
vi.mock("./useLinkRewriter", () => ({
  rewriteImagesAndLinks: vi.fn(),
}));

import { renderOffscreen } from "./offscreenRender";

describe("renderOffscreen 集成（真实 markdown-it 管线）", () => {
  it("产出含 data-source-line 锚点的完整渲染 HTML", async () => {
    const el = await renderOffscreen(
      "# Title\n\n**bold** and `code`\n\n- item\n",
      "/docs/a.md",
      "/docs",
    );
    expect(el.classList.contains("markdown-body")).toBe(true);
    // h1 内含 header-anchor 的 "#" 前缀，标题文字在最后一个文本节点
    expect(el.querySelector("h1")?.textContent).toContain("Title");
    expect(el.querySelector("strong")?.textContent).toBe("bold");
    expect(el.querySelector("code")?.textContent).toBe("code");
    // 导出管线依赖 data-source-line 锚点做源码行映射
    expect(el.querySelector("[data-source-line]")).not.toBeNull();
  });

  it("front matter 文档也能渲染且源文本不丢失", async () => {
    const src = "---\ntitle: T\n---\n# H\n\ntext\n";
    const el = await renderOffscreen(src, "", "");
    expect(el.querySelector("h1")?.textContent).toContain("H");
    expect(el.querySelector("[data-source-line]")).not.toBeNull();
  });
});
