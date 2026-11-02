/**
 * markdown 渲染引擎(可共享模块)。
 *
 * 主线程与 Web Worker 共同引用本模块,保证两处 markdown-it 配置完全一致,
 * 避免双份实现漂移。本模块**不包含** DOMPurify(净化依赖 DOM,只能在主线程执行),
 * 也不包含 KaTeX/Mermaid(渲染期依赖 DOM,同样留在主线程)。
 */
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type { Options } from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import { full as emoji } from "markdown-it-emoji";
import mathPlugin from "./mathPlugin";
import { createCriticMarkupPlugin } from "./criticMarkup";

// 仅在类型层引用 highlight.js，避免主线程静态/动态依赖。hljs 实例由 Worker 线程
// 动态加载后注入（见 markdown.worker.ts），兜底实例 createMarkdownIt() 不传 → 代码块
// 走纯转义兜底，从而把 ~983KB hljs 移出主线程首屏，消除启动同步阻塞。
// 本模块（含 markdown-it）现仅由 Worker 与主线程兜底经**动态 import** 加载，
// 主线程启动路径只保留 DOMPurify 净化。
export type HljsModule = typeof import("highlight.js").default;

export interface Heading {
  level: number;
  text: string;
  id: string;
}

interface FrontMatterBlock {
  raw: string;
  body: string;
  bodyStartLine: number;
  data?: Record<string, unknown>;
}

export function splitFrontMatter(source: string): FrontMatterBlock | null {
  if (!source.startsWith("---")) return null;
  const lines = source.split(/\r?\n/);
  if (lines.length < 3) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^\s*---\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const raw = lines.slice(0, end + 1).join("\n");
  const body = lines.slice(end + 1).join("\n");
  return { raw, body, bodyStartLine: end + 2 };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatFrontMatterValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function renderFrontMatter(block: FrontMatterBlock): string {
  const rows: string[] = [];
  if (block.data != null && typeof block.data === "object") {
    for (const [k, v] of Object.entries(block.data)) {
      rows.push(`<tr><th>${escapeHtml(k)}</th><td>${formatFrontMatterValue(v)}</td></tr>`);
    }
  } else if (block.data != null) {
    rows.push(`<tr><th>Value</th><td>${formatFrontMatterValue(block.data)}</td></tr>`);
  } else {
    rows.push(`<tr><th>Raw</th><td><pre>${escapeHtml(block.raw)}</pre></td></tr>`);
  }
  return `<section class="front-matter" data-source-line="1"><div class="front-matter-title">YAML Front Matter</div><table><tbody>${rows.join("")}</tbody></table></section>`;
}

/** 构建与旧 useMarkdown 完全一致的 markdown-it 实例(纯字符串能力)。
 *  hljs 可选注入：Worker 渲染代码块时传入已加载的 hljs 实例；兜底路径不传，
 *  代码块回退纯转义（兜底只做渲染/大纲提取，无需高亮）。 */
export function createMarkdownIt(hljsInst?: HljsModule): MarkdownIt {
  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str: string, lang: string): string {
      if (lang === "mermaid") {
        return `<div class="mermaid-block">${md.utils.escapeHtml(str)}</div>`;
      }
      if (lang && hljsInst && hljsInst.getLanguage(lang)) {
        try {
          return (
            '<pre class="hljs"><code>' +
            hljsInst.highlight(str, { language: lang, ignoreIllegals: true }).value +
            "</code></pre>"
          );
        } catch {
          /* ignore */
        }
      }
      return (
        '<pre class="hljs"><code>' +
        md.utils.escapeHtml(str) +
        "</code></pre>"
      );
    },
  });

  // 扩展 markdown-it 默认 data URI 白名单（仅 gif/png/jpeg/webp），
  // 放行 image/svg+xml：SVG 内联图在技术文档中常见。
  // 安全性： Dangerous 内容（script/onload 事件）由主线程 DOMPurify 净化兜底，
  // Tauri CSP img-src 亦允许 data: 但渲染进程沙箱隔离。
  // 注意：data:image/ 后必须是合法 MIME 子类型，text/html 等仍被拒绝。
  const defaultValidateLink = md.validateLink;
  md.validateLink = (url: string): boolean => {
    const str = url.trim().toLowerCase();
    if (/^data:image\/svg\+xml[;,]/.test(str)) return true;
    return defaultValidateLink.call(md, url);
  };

  md.use(anchor, {
    slugify: (s: string) =>
      encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, "-")),
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "before",
      ariaHidden: true,
    }),
  });
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: true });
  md.use(emoji);
  md.use(mathPlugin);
  // CriticMarkup 批注语法:主线程与 Worker 共用同一实例配置,保证渲染一致
  md.use(createCriticMarkupPlugin());

  md.core.ruler.push("source_line_attrs", (state) => {
    const offset = Number(
      (state.env as { sourceLineOffset?: number }).sourceLineOffset || 0
    );
    for (const token of state.tokens) {
      if (token.nesting === 1 && token.map) {
        token.attrSet("data-source-line", String(token.map[0] + 1 + offset));
      }
    }
  });

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (
      tokens: Token[],
      idx: number,
      options: Options,
      _env: unknown,
      self: Renderer
    ): string {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: Renderer
  ): string {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex("href");
    const href = hrefIdx >= 0 ? token.attrs![hrefIdx][1] : "";
    if (/^https?:\/\//i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}

/** 渲染 markdown → 未净化 HTML(含 frontmatter 表格)。净化由主线程 DOMPurify 负责。 */
/**
 * 清洗行内图片/链接 URL 中的智能引号与未编码空格。
 *
 * AI 工具(ChatGPT 等)导出的 Markdown 常把 URL 中的 ASCII 引号替换为智能引号
 * (U+2018/2019/201C/201D),且 data URI 中含未编码空格,导致 CommonMark 解析失败、
 * 图片降级为纯文本。仅在 ![..](..) / [..](..) 的 URL 部分做替换:
 * - 智能引号 → percent-encoded ASCII 引号(%27/%22)
 * - 普通空格 → %20(尖括号 <...> 包裹形式中空格本就合法,替换亦无害)
 * 正文文本与围栏代码块不受影响:逐行扫描并跳过围栏区域,仅对围栏外行的
 * ![..](..) / [..](..) URL 部分清洗;URL 边界按括号平衡定位(见 sanitizeLineUrls)。
 */
export function sanitizeInlineUrlSmartChars(source: string): string {
  // 围栏代码块(~~~ 或 ```)内的内容原样保留:逐行扫描,跟踪围栏开合状态,
  // 仅对围栏外的行应用行内图片/链接 URL 清洗。
  const lines = source.split(/\r?\n/);
  let fence: RegExpMatchArray | null = null;
  const cleaned = lines.map((line) => {
    if (fence) {
      if (new RegExp("^" + fence[1]).test(line)) fence = null;
      return line;
    }
    const opened = line.match(/^( {0,3})(```+|~~~+)/);
    if (opened) {
      fence = opened;
      return line;
    }
    return sanitizeLineUrls(line);
  });
  return cleaned.join("\n");
}

/** 清洗单行内图片/链接 URL 的智能引号与空格。
 *  用平衡括号扫描定位 URL 边界:损坏 URL 常含裸括号(如 SVG 的 translate(-249,...)),
 *  简单正则 [^)]* 会在裸 ')' 处提前截断导致清洗不完整。未闭合时不处理(留给原解析器)。 */
function sanitizeLineUrls(line: string): string {
  const smartQuoteRe = /[\u2018\u2019\u201C\u201D]/;
  let result = "";
  let i = 0;
  while (i < line.length) {
    const m = /!\[[^\]]*\]|\[[^\]]*\]/.exec(line.slice(i));
    // 无 label 或 label 后不是 '(' → 原样收下当前字符继续
    if (!m || line[i + m.index + m[0].length] !== "(") {
      result += line[i];
      i++;
      continue;
    }
    const label = m[0];
    const urlStart = i + m.index + label.length + 1;
    let depth = 1;
    let j = urlStart;
    while (j < line.length && depth > 0) {
      if (line[j] === "(") depth++;
      else if (line[j] === ")") depth--;
      if (depth > 0) j++;
    }
    if (depth !== 0) {
      // 括号不平衡:跳过 label 前缀,从 label 起原样保留
      result += line.slice(i, urlStart);
      i = urlStart;
      continue;
    }
    const url = line.slice(urlStart, j);
    const fixed = smartQuoteRe.test(url)
      ? url
          .replace(/[\u2018\u2019\u201C\u201D]/g, (q) =>
            q === "\u201C" || q === "\u201D" ? "%22" : "%27"
          )
          .replace(/ /g, "%20")
      : url;
    result += line.slice(i, urlStart) + fixed + ")";
    i = j + 1;
  }
  return result;
}

export function renderMarkdownRaw(md: MarkdownIt, source: string): string {
  const block = splitFrontMatter(source);
  const body = block ? block.body : source;
  const offset = block ? block.bodyStartLine - 1 : 0;
  const rawFrontMatter = block ? renderFrontMatter(block) : "";
  return rawFrontMatter + md.render(sanitizeInlineUrlSmartChars(body), { sourceLineOffset: offset });
}

/**
 * 一次 parse 同时产出 未净化 HTML 与标题大纲。
 * 供 Worker 使用:避免 renderMarkdownRaw(内部 render→parse)与 extractHeadingsWith
 * (内部 parse)对同一 source 重复 tokenize,大文档下显著省时。
 */
export function renderMarkdownOnce(
  md: MarkdownIt,
  source: string
): { html: string; headings: Heading[] } {
  const block = splitFrontMatter(source);
  const body = block ? block.body : source;
  const offset = block ? block.bodyStartLine - 1 : 0;
  const rawFrontMatter = block ? renderFrontMatter(block) : "";
  const env = { sourceLineOffset: offset };
  const tokens = md.parse(sanitizeInlineUrlSmartChars(body), env);
  const html =
    rawFrontMatter + md.renderer.render(tokens, md.options, env);
  return { html, headings: extractHeadingsFromTokens(tokens) };
}

/** 从 token 流提取标题大纲(parse 一次后复用,避免二次 tokenize) */
function extractHeadingsFromTokens(tokens: Token[]): Heading[] {
  const headings: Heading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open") {
      const idAttr = t.attrGet("id") || "";
      const level = parseInt(t.tag.slice(1), 10);
      const next = tokens[i + 1];
      const text = next && next.type === "inline" ? next.content : "";
      headings.push({ level, text, id: idAttr });
    }
  }
  return headings;
}

/** 提取标题大纲(worker 与主线程共用同一逻辑) */
export function extractHeadingsWith(md: MarkdownIt, source: string): Heading[] {
  if (source.length > 200_000) {
    return extractHeadingsFallback(source);
  }
  const block = splitFrontMatter(source);
  const body = block ? block.body : source;
  const env = { sourceLineOffset: block ? block.bodyStartLine - 1 : 0 };
  return extractHeadingsFromTokens(md.parse(body, env));
}

/** 大文件 fallback:逐行扫描 heading,避免全量 token 化开销 */
function extractHeadingsFallback(source: string): Heading[] {
  const headings: Heading[] = [];
  const block = splitFrontMatter(source);
  const body = block ? block.body : source;
  for (const line of body.split(/\r?\n/).slice(0, 500)) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const id = encodeURIComponent(text.toLowerCase().replace(/\s+/g, "-"));
    headings.push({ level, text, id });
  }
  return headings;
}
