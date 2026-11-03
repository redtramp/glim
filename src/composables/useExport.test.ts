/**
 * useExport 测试
 *
 * 测试目标:
 * - buildExportHtml: 去除 find-highlight（展开）/header-anchor（删除）、注入转义标题、调用 mermaid 渲染
 * - exportToHtml: save 取消返回 null；成功写入并返回目标；defaultPath 依源路径推导（unix/win/无源）
 * - checkPandoc / pandoc 参考文档缓存
 * - exportToDocx: save 取消 / 成功 invoke export_with_pandoc（含参考文档缓存）
 * - edge 路径缓存 / checkPdfEngine（成功、带缓存、异常回退）
 * - exportToPdf: 取消 / 成功 / NoEdge 回退选择 / 选择取消 / 其他错误抛出
 * - printDocument: 创建并挂载隐藏 iframe
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./useMarkdown", () => ({ renderMermaidAll: vi.fn(async () => {}) }));

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { renderMermaidAll } from "./useMarkdown";
import {
  buildExportHtml,
  exportToHtml,
  exportToDocx,
  exportToPdf,
  checkPandoc,
  checkPdfEngine,
  getCachedPandocRefDoc,
  setCachedPandocRefDoc,
  getCachedEdgePath,
  setCachedEdgePath,
  printDocument,
} from "./useExport";

const mockedSave = vi.mocked(save);
const mockedWrite = vi.mocked(writeTextFile);
const mockedInvoke = vi.mocked(invoke);
const mockedMermaid = vi.mocked(renderMermaidAll);

let body: HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  body = document.createElement("div");
  body.innerHTML = "<p>正文</p>";
});

afterEach(() => {
  document.querySelectorAll("iframe").forEach((f) => f.remove());
  delete document.documentElement.dataset.theme;
});

describe("buildExportHtml", () => {
  it("去除高亮/锚点、转义标题、调用 mermaid 渲染", async () => {
    body.innerHTML =
      '<p>hi <span class="find-highlight">foo</span> bar</p>' +
      '<a class="header-anchor" href="#x">#</a>';
    const html = await buildExportHtml(body, "My <Doc>");
    expect(mockedMermaid).toHaveBeenCalledWith(body);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("My &lt;Doc&gt;");
    // 仅校验正文区：基础样式表内可能包含同名选择器
    const article = html.match(/<article class="markdown-body">([\s\S]*?)<\/article>/)![1];
    expect(article).not.toContain("find-highlight");
    expect(article).not.toContain("header-anchor");
    expect(article).toContain("foo");
  });

  it("forceLight 选项可构建", async () => {
    const html = await buildExportHtml(body, "t", { forceLight: true });
    expect(html).toContain("<article class=\"markdown-body\">");
  });
});

describe("exportToHtml", () => {
  it("save 取消返回 null", async () => {
    mockedSave.mockResolvedValue(null);
    expect(await exportToHtml(body, "a.md")).toBeNull();
    expect(mockedWrite).not.toHaveBeenCalled();
  });

  it("成功后写入并返回目标路径（源路径目录 + 词干 .html）", async () => {
    mockedSave.mockResolvedValue("/out/a.html");
    mockedWrite.mockResolvedValue(undefined);
    const r = await exportToHtml(body, "a.md", "/dir/sub/b.md");
    expect(r).toBe("/out/a.html");
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "/dir/sub/a.html" })
    );
    expect(mockedWrite).toHaveBeenCalledWith("/out/a.html", expect.stringContaining("<!doctype html>"));
  });

  it("windows 源路径与无源路径的 defaultPath 推导", async () => {
    mockedSave.mockResolvedValue(null);
    await exportToHtml(body, "a.md", "C:\\docs\\b.md");
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:\\docs\\a.html" })
    );
    mockedSave.mockClear();
    await exportToHtml(body, "plain.md");
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "plain.html" })
    );
  });
});

describe("pandoc", () => {
  it("checkPandoc 调用 invoke", async () => {
    const info = { available: true, version: "3.0", has_xelatex: false };
    mockedInvoke.mockResolvedValue(info);
    expect(await checkPandoc()).toEqual(info);
    expect(mockedInvoke).toHaveBeenCalledWith("check_pandoc");
  });

  it("参考文档缓存读写", () => {
    expect(getCachedPandocRefDoc()).toBeNull();
    setCachedPandocRefDoc("/ref.docx");
    expect(getCachedPandocRefDoc()).toBe("/ref.docx");
    setCachedPandocRefDoc(null);
    expect(getCachedPandocRefDoc()).toBeNull();
  });

  it("exportToDocx: save 取消返回 null", async () => {
    mockedSave.mockResolvedValue(null);
    expect(await exportToDocx(body, "a.md", "T")).toBeNull();
  });

  it("exportToDocx: 成功后 invoke export_with_pandoc 并带参考文档", async () => {
    mockedSave.mockResolvedValue("/out/a.docx");
    mockedInvoke.mockResolvedValue("/out/a.docx");
    setCachedPandocRefDoc("/ref.docx");
    await exportToDocx(body, "a.md", "Title");
    expect(mockedInvoke).toHaveBeenCalledWith("export_with_pandoc", {
      opts: expect.objectContaining({
        format: "docx",
        outPath: "/out/a.docx",
        title: "Title",
        referenceDoc: "/ref.docx",
      }),
    });
  });

  it("exportToDocx: 无参考文档缓存时为 undefined", async () => {
    mockedSave.mockResolvedValue("/out/a.docx");
    mockedInvoke.mockResolvedValue("/out/a.docx");
    await exportToDocx(body, "a.md", "Title");
    const call = mockedInvoke.mock.calls.find(([cmd]) => cmd === "export_with_pandoc")!;
    expect((call[1] as { opts: { referenceDoc?: string } }).opts.referenceDoc).toBeUndefined();
  });
});

describe("pdf", () => {
  it("edge 路径缓存读写", () => {
    expect(getCachedEdgePath()).toBeNull();
    setCachedEdgePath("/edge");
    expect(getCachedEdgePath()).toBe("/edge");
    setCachedEdgePath(null);
    expect(getCachedEdgePath()).toBeNull();
  });

  it("checkPdfEngine 成功并透传缓存", async () => {
    setCachedEdgePath("/custom/edge");
    mockedInvoke.mockResolvedValue("/custom/edge");
    expect(await checkPdfEngine()).toBe("/custom/edge");
    expect(mockedInvoke).toHaveBeenCalledWith("check_pdf_engine", {
      customEdge: "/custom/edge",
    });
  });

  it("checkPdfEngine 异常回退 null", async () => {
    mockedInvoke.mockRejectedValue(new Error("boom"));
    expect(await checkPdfEngine()).toBeNull();
  });

  it("exportToPdf: save 取消返回 null", async () => {
    mockedSave.mockResolvedValue(null);
    expect(await exportToPdf(body, "a.md", "T", undefined, vi.fn())).toBeNull();
  });

  it("exportToPdf: 首次调用成功", async () => {
    mockedSave.mockResolvedValue("/o/a.pdf");
    const result = { out_path: "/o/a.pdf", elapsed_ms: 100, edge_path: "/e" };
    mockedInvoke.mockResolvedValue(result);
    expect(await exportToPdf(body, "a.md", "T", undefined, vi.fn())).toEqual(result);
  });

  it("exportToPdf: NoEdge 且用户取消选择返回 null", async () => {
    mockedSave.mockResolvedValue("/o/a.pdf");
    mockedInvoke.mockRejectedValueOnce({ kind: "NoEdge", message: "x" });
    const onPick = vi.fn().mockResolvedValue(null);
    expect(await exportToPdf(body, "a.md", "T", undefined, onPick)).toBeNull();
    expect(onPick).toHaveBeenCalled();
  });

  it("exportToPdf: NoEdge 后选择成功并缓存路径、重试", async () => {
    mockedSave.mockResolvedValue("/o/a.pdf");
    mockedInvoke.mockRejectedValueOnce({ kind: "NoEdge", message: "x" });
    mockedInvoke.mockResolvedValueOnce({ out_path: "/o/a.pdf", elapsed_ms: 5, edge_path: "/picked" });
    const r = await exportToPdf(body, "a.md", "T", undefined, vi.fn().mockResolvedValue("/picked"));
    expect(r?.out_path).toBe("/o/a.pdf");
    expect(getCachedEdgePath()).toBe("/picked");
  });

  it("exportToPdf: 其他错误向上抛出", async () => {
    mockedSave.mockResolvedValue("/o/a.pdf");
    mockedInvoke.mockRejectedValueOnce({ kind: "IoError", message: "bad" });
    await expect(exportToPdf(body, "a.md", "T", undefined, vi.fn())).rejects.toBeTruthy();
  });
});

describe("printDocument", () => {
  it("创建并挂载隐藏 iframe", async () => {
    (globalThis.URL as unknown as { createObjectURL: () => string }).createObjectURL =
      vi.fn(() => "blob:test");
    (globalThis.URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      vi.fn();
    printDocument(body, "T");
    for (let i = 0; i < 20 && !document.querySelector("iframe"); i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    // 触发 load 覆盖打印分支
    expect(() => iframe!.dispatchEvent(new Event("load"))).not.toThrow();
  });
});
