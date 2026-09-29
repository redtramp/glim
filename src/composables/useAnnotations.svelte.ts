/**
 * useAnnotations.ts — 批注闭环（选区写回 / 复制给 AI / 清除全部）。
 *
 * 核心难点:预览是 v-html 渲染后的 DOM,用户选中的是渲染文本,
 * 必须映射回源 markdown 的字符位置。方案(设计文档 §5):
 *   1. 选区锚点向上找 [data-source-line] 块 → 源行范围 [L1, L2]
 *   2. 取源文本该行区间子串,归一化空白后匹配选中文本
 *   3. 唯一匹配 → 替换;歧义 → 取源顺序最近者(二次校验即归一化匹配本身);
 *      失败 → 提示「该选区含格式化语法,暂不支持批注」,不写文件
 *
 * 定位/模板相关的核心逻辑全部抽成纯函数,便于单测覆盖
 * 唯一 / 歧义 / 失败三条路径;与 Vue 状态(tabs/draftContent)的接线
 * 通过 AnnotationContext 注入,由 App.vue 提供,保持本模块可独立测试。
 */
import type { CriticType } from "./criticMarkup";
import { stripCriticMarkup } from "./criticMarkup";
import { copyTextToClipboard } from "./clipboard";
import type { AnnotationToolbarMode } from "../components/AnnotationToolbar.vue";

/** App.vue 注入的上下文:读写当前文件的草稿并给出用户提示 */
export interface AnnotationContext {
  getSource: () => string;
  getFileName: () => string;
  setSource: (next: string) => void;
  notify: (messageKey: string) => void;
  /** 清除全部批注的确认;缺省用 window.confirm(文件名) */
  confirmClear?: () => boolean;
}

/** 「复制给 AI」默认模板(占位符 {{content}} / {{file}}) */
export const DEFAULT_AI_TEMPLATE =
  "请根据以下带 CriticMarkup 批注的文档进行修改。批注语法说明：{--删除--} 表示建议删除，{++新增++} 表示建议新增，{~~旧~>新~~} 表示建议替换，{==高亮==} 表示重点，{>>评论<<} 表示评论。\n\n{{content}}";

const TEMPLATE_STORAGE = "glim-reader-ai-template";

export function getAITemplate(): string {
  try {
    const saved = localStorage.getItem(TEMPLATE_STORAGE);
    if (saved != null) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_AI_TEMPLATE;
}

export function setAITemplate(template: string): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE, template);
  } catch {
    /* ignore */
  }
}

export function resetAITemplate(): void {
  try {
    localStorage.removeItem(TEMPLATE_STORAGE);
  } catch {
    /* ignore */
  }
}

/** 模板占位符替换:{{content}} = 全文,{{file}} = 文件名 */
export function fillTemplate(
  template: string,
  vars: { content: string; file: string }
): string {
  return template
    .replace(/\{\{content\}\}/g, vars.content)
    .replace(/\{\{file\}\}/g, vars.file);
}

/**
 * 选区在渲染容器内的判定与提取。
 * 返回非折叠、位于 container 内、文本非空的 Range;否则 null。
 */
export function resolveSelectionRange(
  container: HTMLElement,
  selection: Selection | null
): Range | null {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  const common = range.commonAncestorContainer;
  const commonEl =
    common.nodeType === Node.ELEMENT_NODE
      ? (common as Element)
      : (common as Text).parentElement;
  if (!commonEl || !container.contains(commonEl)) return null;
  if (!range.toString().trim()) return null;
  return range;
}

/**
 * 由选区 Range 反推源行范围。
 * 锚点容器(或自身)向上找最近的 [data-source-line] 元素,
 * 取 start/end 两侧行号的 min/max;任一侧缺失则返回 null(跨代码块等无锚点场景)。
 */
export function selectionToSourceLines(range: Range): [number, number] | null {
  const lineOf = (node: Node): number | null => {
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : (node as Text).parentElement;
    if (!el) return null;
    const anchor = el.closest("[data-source-line]");
    if (!anchor) return null;
    const n = Number(anchor.getAttribute("data-source-line"));
    return Number.isFinite(n) ? n : null;
  };
  const a = lineOf(range.startContainer);
  const b = lineOf(range.endContainer);
  if (a == null || b == null) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/** 第 line 行(1-based)在源文本中的起始偏移;越界返回文本长度 */
function lineStartOffset(source: string, line: number): number {
  let offset = 0;
  for (let n = 1; n < line; n++) {
    const nl = source.indexOf("\n", offset);
    if (nl === -1) return source.length;
    offset = nl + 1;
  }
  return offset;
}

/**
 * 归一化空白(连续空白折叠为单个空格)并记录每个输出字符对应的原始下标。
 * map[i] = 归一化文本第 i 个字符在原始文本中的下标。
 */
interface NormResult {
  text: string;
  map: number[];
}

function normalizeWithMap(s: string): NormResult {
  const map: number[] = [];
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      if (out.length > 0 && out[out.length - 1] !== " ") {
        out += " ";
        map.push(i);
      }
      while (i < s.length && /\s/.test(s[i])) i++;
    } else {
      out += s[i];
      map.push(i);
      i++;
    }
  }
  return { text: out, map };
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 在源文本的行区间内定位选区文本(归一化空白后匹配)。
 *
 * preferOffset:歧义时的「最近」偏好——传入选区锚点在源文本中的近似偏移,
 * 多个匹配时选偏移最接近者(对应渲染 DOM 顺序与源顺序一致的场景)。
 *
 * 返回:
 * - null:未匹配(选区含 ** / ` / []() 等行内语法导致渲染文本 ≠ 源文本)
 * - { start, end, matches }:[start, end) 为源文本中的原始下标,
 *   matches 为归一化匹配次数(>1 表示歧义)
 */
export function locateSelection(
  source: string,
  lineRange: [number, number],
  selectedText: string,
  preferOffset?: number
): { start: number; end: number; matches: number } | null {
  const sel = normalizeWhitespace(selectedText);
  if (!sel) return null;

  const lines = source.split(/\r?\n/);
  const from = Math.max(1, Math.min(lineRange[0], lines.length));
  const to = Math.max(from, Math.min(lineRange[1], lines.length));
  if (from > to) return null;

  const blockStart = lineStartOffset(source, from);
  const blockEnd = lineStartOffset(source, to + 1);
  const block = source.slice(blockStart, blockEnd);

  const normBlock = normalizeWithMap(block);
  const normSel = normalizeWhitespace(sel);

  const matches: number[] = [];
  let idx = normBlock.text.indexOf(normSel);
  while (idx !== -1) {
    matches.push(idx);
    idx = normBlock.text.indexOf(normSel, idx + 1);
  }
  if (matches.length === 0) return null;

  let m = matches[0];
  if (matches.length > 1 && preferOffset != null) {
    const target = preferOffset - blockStart;
    let bestDist = Math.abs(normBlock.map[m] - target);
    for (let k = 1; k < matches.length; k++) {
      const d = Math.abs(normBlock.map[matches[k]] - target);
      if (d < bestDist) {
        bestDist = d;
        m = matches[k];
      }
    }
  }

  const start = blockStart + normBlock.map[m];
  const end = blockStart + normBlock.map[m + normSel.length - 1] + 1;
  return { start, end, matches: matches.length };
}

/**
 * 生成写回源文本的 CriticMarkup 片段(替换选中文本的最终文本):
 * - 删除 {--sel--} / 高亮 {==sel==}:包裹选中文本
 * - 新增 {++payload++}sel / 评论 {>>payload<<}sel:在选中文本前插入(保留原文)
 * - 替换 {~~sel~>payload~~}:包裹并标记新值
 */
export function buildMarkupFragment(
  type: CriticType,
  selectedText: string,
  payload = ""
): string {
  switch (type) {
    case "del":
      return `{--${selectedText}--}`;
    case "ins":
      return `{++${payload}++}${selectedText}`;
    case "sub":
      return `{~~${selectedText}~>${payload}~~}`;
    case "hl":
      return `{==${selectedText}==}`;
    case "comment":
      return `{>>${payload}<<}${selectedText}`;
  }
}

/** 工具栏状态(位置 + 可见性 + 输入态),由 App.vue 绑定到 AnnotationToolbar */
export interface AnnotationToolbarState {
  visible: boolean;
  x: number;
  y: number;
  mode: AnnotationToolbarMode;
}

/** 需要输入内容的批注类型:输入态下忽略 selectionchange,避免聚焦输入框时工具栏消失 */
const INPUT_TYPES: ReadonlySet<CriticType> = new Set(["ins", "sub", "comment"]);

/** 统计 el 内、target 节点之前的所有文本字符数,加 target 内偏移 */
function charOffsetInElement(
  el: Element,
  target: Node,
  offsetInTarget: number
): number {
  let count = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === target) return count + offsetInTarget;
    count += (node as Text).length;
    node = walker.nextNode();
  }
  return count;
}

/**
 * 计算选区锚点在源文本中的近似偏移(歧义匹配的「最近」偏好)。
 * 锚点须落在 [data-source-line] 块内的文本节点上;纯文本行时该偏移精确,
 * 含行内标签时按 DOM 文本长度近似(渲染顺序与源顺序一致,偏好仍有效)。
 */
function anchorOffsetHint(
  source: string,
  range: Range
): number | undefined {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return undefined;
  const anchorEl = (node as Text).parentElement?.closest("[data-source-line]");
  if (!anchorEl) return undefined;
  const line = Number(anchorEl.getAttribute("data-source-line"));
  if (!Number.isFinite(line)) return undefined;
  const domOffset = charOffsetInElement(anchorEl, node, range.startOffset);
  return lineStartOffset(source, line) + domOffset;
}

export function useAnnotations() {
  // 旧 vue reactive() → $state（per-call 实例语义不变）
  const toolbar = $state<AnnotationToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    mode: "",
  });

  let getCtx: () => AnnotationContext | null = () => null;
  let getContainer: () => HTMLElement | null = () => null;
  let teardown: (() => void) | null = null;
  /**
   * 缓存的有效选区:输入态下点击输入框聚焦会清空文档选区,
   * 但批注仍应作用于用户最初选中的文本,写回时回退到此缓存。
   */
  let pendingRange: Range | null = null;

  /** 由 App.vue 注入上下文与渲染容器获取器(在 onMounted 渲染完成后调用) */
  function configure(
    ctx: () => AnnotationContext | null,
    container: () => HTMLElement | null
  ): void {
    getCtx = ctx;
    getContainer = container;
  }

  function hide(): void {
    toolbar.visible = false;
    toolbar.mode = "";
    pendingRange = null;
  }

  /** 监听 selectionchange:选区有效时按选区位置显示工具栏,否则隐藏 */
  function initSelectionWatch(): void {
    if (teardown) return;
    const onSelectionChange = () => {
      // 输入态下忽略选区变化:用户点击输入框聚焦会改变选区,不能隐藏工具栏
      if (toolbar.mode !== "" && INPUT_TYPES.has(toolbar.mode)) return;
      const ctx = getCtx();
      const container = getContainer();
      if (!ctx || !container) {
        hide();
        return;
      }
      const range = resolveSelectionRange(container, window.getSelection());
      if (!range) {
        pendingRange = null;
        hide();
        return;
      }
      pendingRange = range;
      const rect = range.getBoundingClientRect();
      toolbar.visible = true;
      toolbar.x = rect.left + rect.width / 2;
      toolbar.y = rect.bottom;
      toolbar.mode = "";
    };
    document.addEventListener("selectionchange", onSelectionChange);
    teardown = () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }

  function dispose(): void {
    teardown?.();
    teardown = null;
    hide();
  }

  /** 选区写回:定位 → 生成片段 → 替换源文本 → 触发重渲染 */
  function applyMarkup(type: CriticType, payload?: string): void {
    const ctx = getCtx();
    const container = getContainer();
    if (!ctx || !container) return;

    const selection = window.getSelection();
    // 输入态下文档选区可能已被输入框聚焦清空,回退到 selectionchange 时缓存的有效选区
    const range = resolveSelectionRange(container, selection) ?? pendingRange;
    if (!range) return;

    const lines = selectionToSourceLines(range);
    const selectedText = range.toString().trim();
    if (!lines || !selectedText) {
      ctx.notify("annotation.locateFailed");
      hide();
      return;
    }

    const loc = locateSelection(
      ctx.getSource(),
      lines,
      selectedText,
      anchorOffsetHint(ctx.getSource(), range)
    );
    if (!loc) {
      // 匹配失败:选区含格式化语法,不写文件
      ctx.notify("annotation.unsupportedSelection");
      hide();
      return;
    }

    const fragment = buildMarkupFragment(type, selectedText, payload ?? "");
    const source = ctx.getSource();
    const next = source.slice(0, loc.start) + fragment + source.slice(loc.end);
    ctx.setSource(next);
    hide();
    selection?.removeAllRanges();
  }

  /** 复制给 AI:模板占位符替换 → 剪贴板;失败提示,不静默 */
  async function copyForAI(): Promise<void> {
    const ctx = getCtx();
    if (!ctx) return;
    const text = fillTemplate(getAITemplate(), {
      content: ctx.getSource(),
      file: ctx.getFileName(),
    });
    try {
      await copyTextToClipboard(text);
      ctx.notify("annotation.copyDone");
    } catch {
      ctx.notify("annotation.copyFailed");
    }
  }

  /** 清除全部批注:确认 → stripCriticMarkup 全文 → 更新草稿 */
  async function clearAll(): Promise<void> {
    const ctx = getCtx();
    if (!ctx) return;
    const ok = ctx.confirmClear
      ? ctx.confirmClear()
      : window.confirm(ctx.getFileName());
    if (!ok) return;
    ctx.setSource(stripCriticMarkup(ctx.getSource()));
    // 全文已变化,选区不再有效;隐藏工具栏避免残留
    hide();
    ctx.notify("annotation.clearDone");
  }

  return {
    toolbar,
    configure,
    initSelectionWatch,
    dispose,
    hide,
    applyMarkup,
    copyForAI,
    clearAll,
  };
}
