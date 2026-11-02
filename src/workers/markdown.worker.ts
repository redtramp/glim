/**
 * markdown 渲染 Web Worker。
 *
 * 职责:在 Worker 线程内完成 markdown-it 解析 + highlight.js 高亮 + frontmatter
 * 渲染(纯字符串处理,不依赖 DOM),返回未净化的 HTML 与标题大纲。
 * DOMPurify 净化依赖 DOM,由主线程在收到结果后执行(配合内容哈希缓存)。
 *
 * 协议:{ id, source } → { id, html, headings } 或 { id, error }
 *       { id, source, headingsOnly: true } → { id, headings } 或 { id, error }
 */
/// <reference lib="webworker" />
import { createMarkdownIt, renderMarkdownOnce, extractHeadingsWith } from "../composables/markdownEngine";
// highlight.js 静态引入进 Worker chunk（仅 Worker 线程加载，不阻塞主线程首屏）；
// 主线程的 markdownEngine 不再引用 hljs，从而把 ~983KB hljs 移出主线程启动路径。
import hljs from "highlight.js";

const md = createMarkdownIt(hljs);

self.onmessage = (e: MessageEvent<{ id: number; source: string; headingsOnly?: boolean }>) => {
  const { id, source, headingsOnly } = e.data;
  try {
    if (headingsOnly) {
      // 仅提取大纲：不渲染 HTML，避免为大纲白做渲染工作
      (self as unknown as Worker).postMessage({ id, headings: extractHeadingsWith(md, source) });
      return;
    }
    const { html, headings } = renderMarkdownOnce(md, source);
    (self as unknown as Worker).postMessage({ id, html, headings });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      error: String(err instanceof Error ? err.message : err),
    });
  }
};
