/**
 * markdown 渲染组合式函数(主线程侧)。
 *
 * 架构:
 * - renderMarkdown:异步,优先在 Web Worker 中执行 markdown-it + hljs(纯字符串),
 *   主线程只做 DOMPurify 净化;结果按源内容哈希缓存,命中时零开销。
 * - renderMermaid:带 SVG 结果缓存 + 全局串行渲染队列 + 可视区域懒渲染
 *   (IntersectionObserver),避免打开文档即全量渲染造成首屏卡顿。
 * - renderMath / extractHeadings:保持同步/近同步语义,供各处调用。
 */
import DOMPurify from "dompurify";
import { createMarkdownIt, extractHeadingsWith } from "./markdownEngine";
import type { Heading } from "./markdownEngine";
import {
  markdownHtmlCache,
  mermaidSvgCache,
  markdownCacheKey,
  mermaidCacheKey,
} from "./renderCache";
import { renderMarkdownOffThread } from "./markdownWorkerClient";

export type { Heading };

const md = createMarkdownIt();

/**
 * 异步渲染 markdown → 净化后 HTML。
 * markdown-it + hljs 在 Worker 线程执行,主线程仅做 DOMPurify 净化;结果按源哈希缓存。
 */
export async function renderMarkdown(source: string): Promise<string> {
  const { key, length } = markdownCacheKey(source);
  const cached = markdownHtmlCache.get(key, length);
  if (cached !== undefined) return cached;
  const { html: raw } = await renderMarkdownOffThread(source);
  const html = sanitizeHtml(raw);
  markdownHtmlCache.set(key, html, length);
  return html;
}

function sanitizeHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target", "data-math", "data-source-line", "width", "height"],
  });
}

/** 提取标题大纲(同步;大文件自动走 fallback,避免全量 token 化) */
export function extractHeadings(source: string): Heading[] {
  return extractHeadingsWith(md, source);
}

let katexLoading: Promise<any> | null = null;
async function loadKatex() {
  if (!katexLoading) {
    katexLoading = (async () => {
      const mod = await import("katex");
      await import("katex/dist/katex.min.css");
      return (mod as any).default ?? mod;
    })();
  }
  return katexLoading;
}

let mermaidLoading: Promise<any> | null = null;
async function loadMermaid() {
  if (!mermaidLoading) {
    mermaidLoading = (async () => {
      const mod = await import("mermaid");
      return (mod as any).default ?? mod;
    })();
  }
  return mermaidLoading;
}

function getCurrentTheme(): string {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function configureMermaid(mermaid: any): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: getCurrentTheme(),
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  });
}

export async function renderMath(container: HTMLElement): Promise<void> {
  const inline = container.querySelectorAll<HTMLElement>(".math-inline");
  const block = container.querySelectorAll<HTMLElement>(".math-block");
  if (inline.length === 0 && block.length === 0) return;
  const katex = await loadKatex();
  inline.forEach((el) => {
    const expr = el.dataset.math ?? "";
    try {
      katex.render(expr, el, { throwOnError: false, displayMode: false });
    } catch {
      el.textContent = expr;
    }
  });
  block.forEach((el) => {
    const expr = el.dataset.math ?? "";
    try {
      katex.render(expr, el, { throwOnError: false, displayMode: true });
    } catch {
      el.textContent = expr;
    }
  });
}

function sanitizeMermaidSvg(svg: string): string {
  // 字符串级清洗,避免 DOMParser XML 解析导致 <foreignObject> 内 HTML 标签(<p>/<br>)报 tag mismatch
  //
  // ⚠️ 边界说明(已知限制,勿在未评估前放宽):
  // - 这是字符串正则清洗而非 DOM 遍历,对 <style>/<text> 内容中恰好出现
  //   `onclick=`、`<script` 等字面文本的边界场景可能误删(当前 htmlLabels:false
  //   下 mermaid 不输出 foreignObject/内联脚本,风险未触发);
  // - 若未来开启 htmlLabels:true 或引入含内联样式的图表,应回归验证此处;
  // - 替代方案:改用 DOMParser(HTML 模式)解析后按节点遍历清洗,但需处理
  //   foreignObject 内 HTML 标签与 XML 序列化的兼容性。
  //
  // 1. 移除 <script> 标签及其内容
  let cleaned = svg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // 2. 移除 event handler 属性(onclick/onerror 等)
  cleaned = cleaned.replace(/\s+on\w+="[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+on\w+='[^']*'/gi, "");
  cleaned = cleaned.replace(/\s+on\w+=\w+/gi, "");
  // 3. 移除 javascript: 的 href/xlink:href
  cleaned = cleaned.replace(/\s+href="javascript:[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+xlink:href="javascript:[^"]*"/gi, "");
  return cleaned;
}

let mermaidIdCounter = 0;

/** mermaid 全局串行渲染队列:initialize() 与 render() 必须串行,避免并发污染主题 */
type RenderTask = () => Promise<void>;
const renderQueue: RenderTask[] = [];
let isRendering = false;

function enqueueRender(task: RenderTask): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    renderQueue.push(async () => {
      try {
        await task();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    pumpQueue();
  });
}

async function pumpQueue(): Promise<void> {
  if (isRendering) return;
  isRendering = true;
  try {
    while (renderQueue.length > 0) {
      const task = renderQueue.shift()!;
      await task();
    }
  } finally {
    isRendering = false;
  }
}

/** 懒渲染调度器:维护每个容器上的 IntersectionObserver */
const containerObservers = new WeakMap<HTMLElement, IntersectionObserver>();
const containerPending = new WeakMap<HTMLElement, Set<HTMLElement>>();

function scheduleLazyRender(
  container: HTMLElement,
  blocks: HTMLElement[],
  renderBlock: (el: HTMLElement) => Promise<void>
): void {
  const pendingSet = containerPending.get(container) ?? new Set<HTMLElement>();
  for (const el of blocks) pendingSet.add(el);
  containerPending.set(container, pendingSet);

  let observer = containerObservers.get(container);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const set = containerPending.get(container);
          if (!set || !set.delete(el)) continue;
          observer!.unobserve(el);
          void renderBlock(el).catch(() => {
            /* 单块失败不影响其余块;错误态已写入块内 */
          });
        }
      },
      { root: container.closest("[data-scroll-root]") ?? null, rootMargin: "200px 0px" }
    );
    containerObservers.set(container, observer);
  }

  for (const el of pendingSet) observer.observe(el);
}

/**
 * 清理容器上的懒渲染观察器:组件卸载时调用,disconnect 观察器并释放 pending 引用,
 * 避免容器销毁后 IntersectionObserver 与 DOM 块残留造成资源堆积。
 */
export function disposeMermaidObserver(container: HTMLElement): void {
  const observer = containerObservers.get(container);
  if (observer) {
    observer.disconnect();
    containerObservers.delete(container);
  }
  containerPending.delete(container);
}

/**
 * 渲染容器内所有 mermaid 块。
 * - force=false:仅渲染尚未渲染且位于可视区域的块(懒渲染);
 * - force=true:全量渲染(主题切换/导出前),跳过已渲染且主题未变、缓存命中的块。
 * SVG 结果按 主题+代码 哈希缓存,二次渲染零成本。
 */
export async function renderMermaid(
  container: HTMLElement,
  force = false
): Promise<void> {
  let blocks = Array.from(
    container.querySelectorAll<HTMLElement>(".mermaid-block")
  );
  const theme = getCurrentTheme();

  const doRender = async (el: HTMLElement): Promise<void> => {
    let code: string;
    if (el.dataset.mermaidSrc != null) {
      code = el.dataset.mermaidSrc;
    } else {
      code = el.textContent ?? "";
      el.dataset.mermaidSrc = code;
    }
    const { key, length } = mermaidCacheKey(theme, code);
    const cachedSvg = mermaidSvgCache.get(key, length);
    if (cachedSvg !== undefined) {
      el.innerHTML = cachedSvg;
      el.classList.add("mermaid-rendered");
      el.dataset.mermaidTheme = theme;
      return;
    }

    await enqueueRender(async () => {
      if (el.classList.contains("mermaid-rendered")) return;
      const mermaid = await loadMermaid();
      configureMermaid(mermaid);
      const id = `mermaid-${Date.now()}-${mermaidIdCounter++}`;
      try {
        const { svg } = await mermaid.render(id, code);
        const cleaned = sanitizeMermaidSvg(svg);
        mermaidSvgCache.set(key, cleaned, length);
        el.innerHTML = cleaned;
        el.classList.add("mermaid-rendered");
        el.dataset.mermaidTheme = theme;
      } catch (e: any) {
        const pre = document.createElement("pre");
        pre.className = "mermaid-error";
        pre.textContent = `Mermaid: ${String(e?.message ?? e)}`;
        el.replaceChildren(pre);
        el.classList.add("mermaid-rendered");
      }
    });
  };

  if (force) {
    for (const el of blocks) {
      if (el.dataset.mermaidTheme === theme) continue;
      await doRender(el);
    }
    return;
  }

  // 懒渲染:已渲染的跳过,其余交给 IntersectionObserver 按可视区域触发
  blocks = blocks.filter(
    (el) => !el.classList.contains("mermaid-rendered")
  );
  if (blocks.length === 0) return;
  scheduleLazyRender(container, blocks, doRender);
}

/** 立即渲染容器内所有未渲染的 mermaid 块(导出、打印、查找前调用,保证内容完整) */
export async function renderMermaidAll(container: HTMLElement): Promise<void> {
  await renderMermaid(container, true);
}
