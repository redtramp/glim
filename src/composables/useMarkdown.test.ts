/**
 * useMarkdown 单测
 *
 * 覆盖:
 * - renderMarkdown:未命中缓存经 worker 渲染并净化、相同源命中缓存、不同源未命中、
 *   白名单属性(如 data-source-line)被保留
 * - extractHeadings:提取标题大纲
 * - renderMath:空容器不加载 katex、行内(displayMode:false)/块级(displayMode:true)、
 *   渲染失败回退原文
 * - renderMermaid:懒渲染经 IntersectionObserver 触发、已渲染块跳过、dispose 断开观察器、
 *   force 全量、SVG 缓存命中、同主题跳过、失败错误块、data-mermaid-src、暗色主题、
 *   renderMermaidAll 强制全量
 *
 * mock:markdownWorkerClient 的 renderMarkdownOffThread、katex/mermaid 动态导入；
 * IntersectionObserver 用可控假实现模拟可视区触发。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import katex from "katex";
import mermaid from "mermaid";
import { renderMarkdownOffThread } from "./markdownWorkerClient";
import {
  renderMarkdown,
  extractHeadings,
  renderMath,
  renderMermaid,
  renderMermaidAll,
  disposeMermaidObserver,
} from "./useMarkdown";
import { markdownHtmlCache, mermaidSvgCache } from "./renderCache";

vi.mock("./markdownWorkerClient", () => ({ renderMarkdownOffThread: vi.fn() }));
vi.mock("katex", () => ({ default: { render: vi.fn() } }));
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  elements = new Set<Element>();
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.elements.add(el);
  }
  unobserve(el: Element): void {
    this.elements.delete(el);
  }
  disconnect(): void {
    this.elements.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  trigger(entries: Array<{ target: Element; isIntersecting: boolean }>): void {
    this.callback(
      entries as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver
    );
  }
}

const katexRender = katex.render as ReturnType<typeof vi.fn>;
const mermaidRender = mermaid.render as ReturnType<typeof vi.fn>;
const mermaidInit = mermaid.initialize as ReturnType<typeof vi.fn>;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  markdownHtmlCache.clear();
  mermaidSvgCache.clear();
  vi.clearAllMocks();
  MockIntersectionObserver.instances.length = 0;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("renderMarkdown", () => {
  it("未命中缓存时经 worker 渲染并净化", async () => {
    vi.mocked(renderMarkdownOffThread).mockResolvedValue({
      html: '<p class="x" onclick="bad()">hi</p>',
      headings: [],
    });
    const html = await renderMarkdown("# hi");
    expect(html).toContain("<p");
    expect(html).not.toContain("onclick");
    expect(renderMarkdownOffThread).toHaveBeenCalledWith("# hi");
  });

  it("相同源命中缓存,worker 只调用一次", async () => {
    vi.mocked(renderMarkdownOffThread).mockResolvedValue({
      html: "<p>a</p>",
      headings: [],
    });
    await renderMarkdown("same");
    await renderMarkdown("same");
    expect(renderMarkdownOffThread).toHaveBeenCalledTimes(1);
  });

  it("不同源未命中缓存", async () => {
    vi.mocked(renderMarkdownOffThread).mockResolvedValue({
      html: "<p>a</p>",
      headings: [],
    });
    await renderMarkdown("one");
    await renderMarkdown("two");
    expect(renderMarkdownOffThread).toHaveBeenCalledTimes(2);
  });

  it("净化保留白名单属性(data-source-line)", async () => {
    vi.mocked(renderMarkdownOffThread).mockResolvedValue({
      html: '<h1 id="h" data-source-line="1">T</h1>',
      headings: [],
    });
    const html = await renderMarkdown("x");
    expect(html).toContain('data-source-line="1"');
  });

  it("worker 渲染失败时错误向上传播", async () => {
    vi.mocked(renderMarkdownOffThread).mockRejectedValue(new Error("worker boom"));
    await expect(renderMarkdown("x")).rejects.toThrow("worker boom");
  });
});

describe("extractHeadings", () => {
  it("提取标题大纲", () => {
    const hs = extractHeadings("# 一\n\n## 二");
    expect(hs.map((h) => h.level)).toEqual([1, 2]);
    expect(hs[0].text).toBe("一");
  });
});

describe("renderMath", () => {
  it("无数学元素时不调用 katex", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>plain</p>";
    await renderMath(container);
    expect(katexRender).not.toHaveBeenCalled();
  });

  it("行内数学以 displayMode:false 渲染", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<span class="math-inline" data-math="x^2"></span>';
    await renderMath(container);
    expect(katexRender).toHaveBeenCalledTimes(1);
    expect(katexRender).toHaveBeenCalledWith(
      "x^2",
      expect.any(HTMLElement),
      expect.objectContaining({ displayMode: false })
    );
  });

  it("块级数学以 displayMode:true 渲染", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="math-block" data-math="\\int_0^1"></div>';
    await renderMath(container);
    expect(katexRender).toHaveBeenCalledWith(
      "\\int_0^1",
      expect.any(HTMLElement),
      expect.objectContaining({ displayMode: true })
    );
  });

  it("katex 渲染失败时回退原文", async () => {
    katexRender.mockImplementationOnce(() => {
      throw new Error("parse error");
    });
    const container = document.createElement("div");
    container.innerHTML = '<span class="math-inline" data-math="bad$"></span>';
    await renderMath(container);
    expect(container.querySelector(".math-inline")?.textContent).toBe("bad$");
  });
});

describe("renderMermaid - 懒渲染", () => {
  it("懒渲染经 IntersectionObserver 触发", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>ok</svg>" });
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">graph TD;</div>';
    const p = renderMermaid(container);
    const obs = MockIntersectionObserver.instances[0];
    expect(obs).toBeTruthy();
    const block = container.querySelector<HTMLElement>(".mermaid-block")!;
    obs.trigger([{ target: block, isIntersecting: true }]);
    await p;
    await flush();
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), "graph TD;");
    expect(block.classList.contains("mermaid-rendered")).toBe(true);
    expect(block.innerHTML).toContain("<svg>");
    expect(block.dataset.mermaidTheme).toBe("light");
  });

  it("已渲染块懒渲染时跳过,不创建观察器", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block mermaid-rendered">x</div>';
    await renderMermaid(container);
    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(mermaidRender).not.toHaveBeenCalled();
  });

  it("disposeMermaidObserver 断开观察器后不再渲染", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">x</div>';
    const p = renderMermaid(container);
    const obs = MockIntersectionObserver.instances[0];
    disposeMermaidObserver(container);
    expect(obs.elements.size).toBe(0);
    await p;
    obs.trigger([
      {
        target: container.querySelector<HTMLElement>(".mermaid-block")!,
        isIntersecting: true,
      },
    ]);
    await flush();
    expect(mermaidRender).not.toHaveBeenCalled();
  });
});

describe("renderMermaid - 全量/缓存", () => {
  it("force 模式立即全量渲染全部块", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>full</svg>" });
    const container = document.createElement("div");
    container.innerHTML =
      '<div class="mermaid-block">a</div><div class="mermaid-block">b</div>';
    await renderMermaid(container, true);
    expect(mermaidRender).toHaveBeenCalledTimes(2);
  });

  it("SVG 缓存命中时不再调用 mermaid.render", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>1</svg>" });
    const c1 = document.createElement("div");
    c1.innerHTML = '<div class="mermaid-block">code-x</div>';
    await renderMermaid(c1, true);
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    const c2 = document.createElement("div");
    c2.innerHTML = '<div class="mermaid-block">code-x</div>';
    await renderMermaid(c2, true);
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(c2.querySelector<HTMLElement>(".mermaid-block")!.innerHTML).toBe(
      "<svg>1</svg>"
    );
  });

  it("同主题已渲染块在 force 模式下跳过", async () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">x</div>';
    container.querySelector<HTMLElement>(".mermaid-block")!.dataset.mermaidTheme = "light";
    await renderMermaid(container, true);
    expect(mermaidRender).not.toHaveBeenCalled();
  });

  it("渲染失败写入错误块", async () => {
    mermaidRender.mockRejectedValue(new Error("syntax error"));
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">bad</div>';
    await renderMermaid(container, true);
    const err = container.querySelector(".mermaid-error");
    expect(err).toBeTruthy();
    expect(err!.textContent).toContain("Mermaid: syntax error");
  });

  it("优先使用 data-mermaid-src 作为代码", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>s</svg>" });
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block" data-mermaid-src="graph LR"></div>';
    await renderMermaid(container, true);
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), "graph LR");
  });

  it("暗色主题下 initialize 使用 dark", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>d</svg>" });
    document.documentElement.dataset.theme = "dark";
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">x</div>';
    await renderMermaid(container, true);
    expect(mermaidInit).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
    expect(container.querySelector<HTMLElement>(".mermaid-block")!.dataset.mermaidTheme).toBe(
      "dark"
    );
  });

  it("renderMermaidAll 强制全量渲染", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg>a</svg>" });
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid-block">x</div>';
    await renderMermaidAll(container);
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector<HTMLElement>(".mermaid-block")!
        .classList.contains("mermaid-rendered")
    ).toBe(true);
  });
});
