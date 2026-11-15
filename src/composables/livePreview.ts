/**
 * 就地实时预览（WYSIWYG Live Preview）的装饰计算——纯函数层。
 *
 * 设计要点（见 docs/2026-11-15-wysiwyg-live-preview-design.md）：
 * - 文档真相源始终是纯 Markdown 文本（EditorState.doc），本模块只产出「视图层装饰」，
 *   不改写文档，保证严格无损。
 * - 遍历 Lezer markdown 语法树，对每个语法构造按「光标是否在该行 / 该节点内」决定：
 *   off-cursor → 隐藏语法标记（replace）+ 给内容加样式类（mark / line）；
 *   on-cursor  → 撤回装饰，露出原始 Markdown 供编辑。
 * - 纯函数不依赖 EditorView / DOM，可在 jsdom 下直接对 EditorState 测试。
 * - visitor 按 Lezer 节点名派发（节点名由 livePreview.test.ts 的 grammar 锁定测试钉死）。
 */
import { EditorState, RangeSet, type Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
} from "@codemirror/view";

/** 装饰 class 名统一命名，避免样式表与逻辑各自硬编码 */
export const LP_CLASS = {
  h1: "cm-lp-h1",
  h2: "cm-lp-h2",
  h3: "cm-lp-h3",
  h4: "cm-lp-h4",
  h5: "cm-lp-h5",
  h6: "cm-lp-h6",
  strong: "cm-lp-strong",
  em: "cm-lp-em",
  code: "cm-lp-code",
  link: "cm-lp-link",
  strike: "cm-lp-strike",
  quote: "cm-lp-quote",
  listMark: "cm-lp-list-mark",
  codeBlock: "cm-lp-codeblock",
  hr: "cm-lp-hr",
} as const;

/** 预建装饰实例，避免每次重算都重新分配（cairn 模式） */
const HIDE = Decoration.replace({});
const MARKS = {
  h1: Decoration.mark({ class: LP_CLASS.h1 }),
  h2: Decoration.mark({ class: LP_CLASS.h2 }),
  h3: Decoration.mark({ class: LP_CLASS.h3 }),
  h4: Decoration.mark({ class: LP_CLASS.h4 }),
  h5: Decoration.mark({ class: LP_CLASS.h5 }),
  h6: Decoration.mark({ class: LP_CLASS.h6 }),
  strong: Decoration.mark({ class: LP_CLASS.strong }),
  em: Decoration.mark({ class: LP_CLASS.em }),
  code: Decoration.mark({ class: LP_CLASS.code }),
  link: Decoration.mark({ class: LP_CLASS.link }),
  strike: Decoration.mark({ class: LP_CLASS.strike }),
};
const LINES = {
  quote: Decoration.line({ class: LP_CLASS.quote }),
  codeBlock: Decoration.line({ class: LP_CLASS.codeBlock }),
  hr: Decoration.line({ class: LP_CLASS.hr }),
};
/** 列表符号保留可见（隐藏会破坏大纲扫描），仅加弱化样式 */
const LIST_MARK = Decoration.mark({ class: LP_CLASS.listMark });

export interface LivePreviewDecorations {
  /** 供 ViewPlugin 的 decorations 字段使用：mark / line / replace / widget 全集合 */
  decorations: DecorationSet;
  /** 供 EditorView.atomicRanges 使用：仅 replace / widget，方向键整块跳过隐藏语法 */
  atomicRanges: RangeSet<Decoration>;
}

/** visitor 上下文：收集区间 + 共用判定/产出 helper */
interface BuildContext {
  state: EditorState;
  cursorLine: number;
  cursorPos: number;
  docEnd: number;
  ranges: Range<Decoration>[];
  atomic: Range<Decoration>[];
  /** 该位置所在行是否为光标行（行级构造判据） */
  isCursorLine(pos: number): boolean;
  /** 光标是否落在 [from,to] 内（行内构造判据） */
  isCursorInside(from: number, to: number): boolean;
  /** 产出 replace 隐藏区间，并登记进 atomicRanges */
  hide(from: number, to: number): void;
  /** 产出 mark 装饰区间 */
  mark(deco: Decoration, from: number, to: number): void;
  /** 产出 line 装饰（按行锚点，from===to） */
  line(deco: Decoration, at: number): void;
}

/** Lezer 节点引用（iterate 回调参数的最小结构） */
interface NodeRef {
  name: string;
  from: number;
  to: number;
  node: { cursor(): TreeCursorLike };
}
interface TreeCursorLike {
  firstChild(): boolean;
  nextSibling(): boolean;
  name: string;
  from: number;
  to: number;
}

type Visitor = (node: NodeRef, ctx: BuildContext) => void;

/**
 * 「该行是否应露出源码」：光标所在行（按主选区 head 所在行）始终露源码。
 * 行级构造（标题 / 引用 / 列表 / 围栏等）用此判据。
 */
/** 标记本体之后到正文之间可能有若干空白，动态扫描返回「正文起始位置」——不写死 +1/+2 */
function skipInlineSpace(state: EditorState, from: number, limit: number): number {
  let pos = from;
  while (pos < limit) {
    const ch = state.doc.sliceString(pos, pos + 1);
    if (ch !== " " && ch !== "\t") break;
    pos += 1;
  }
  return pos;
}

/** 收集节点下所有指定名字的子节点（如标题的全部 HeaderMark，含闭合 #） */
function childMarks(node: NodeRef, childName: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const cursor = node.node.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name === childName) {
        out.push({ from: cursor.from, to: cursor.to });
      }
    } while (cursor.nextSibling());
  }
  return out;
}

/* ============ 行内构造 ============ */

/** 通用：成对定界符（**x** / *x* / ~~x~~ / `x`）的隐藏 + 内容样式 */
function delimitedInline(node: NodeRef, ctx: BuildContext, deco: Decoration, markName: string): void {
  // 光标在该节点内 → 整段露源码
  if (ctx.isCursorInside(node.from, node.to)) return;
  const marks = childMarks(node, markName);
  if (marks.length === 0) return;
  const open = marks[0];
  const close = marks[marks.length - 1];
  ctx.hide(open.from, open.to);
  if (close.to > open.to) ctx.hide(close.from, close.to);
  if (open.to < close.from) ctx.mark(deco, open.to, close.from);
}

const visitStrong: Visitor = (node, ctx) =>
  delimitedInline(node, ctx, MARKS.strong, "EmphasisMark");
const visitEmphasis: Visitor = (node, ctx) =>
  delimitedInline(node, ctx, MARKS.em, "EmphasisMark");
const visitStrike: Visitor = (node, ctx) =>
  delimitedInline(node, ctx, MARKS.strike, "StrikethroughMark");
const visitInlineCode: Visitor = (node, ctx) =>
  delimitedInline(node, ctx, MARKS.code, "CodeMark");

/** 链接 [label](url)：隐藏两侧 LinkMark 与 URL，链接文字加样式；光标在内时整段露源码 */
const visitLink: Visitor = (node, ctx) => {
  if (ctx.isCursorInside(node.from, node.to)) return;
  const linkMarks = childMarks(node, "LinkMark");
  const urls = childMarks(node, "URL");
  // 隐藏所有 LinkMark（[ ] ( )）与 URL 段
  for (const m of [...linkMarks, ...urls]) ctx.hide(m.from, m.to);
  // 链接文字 = 第一个 LinkMark 之后到第二个 LinkMark 之前
  if (linkMarks.length >= 2) {
    const labelFrom = linkMarks[0].to;
    const labelTo = linkMarks[1].from;
    if (labelFrom < labelTo) ctx.mark(MARKS.link, labelFrom, labelTo);
  }
};

/* ============ 行级构造 ============ */

/** 通用：ATX 标题（1-6 级），隐藏前置/闭合 HeaderMark，文字加对应级别样式 */
function atxHeading(deco: Decoration): Visitor {
  return (node, ctx) => {
    // 光标所在行：整行露源码，不产出装饰
    if (ctx.isCursorLine(node.from)) return;
    const line = ctx.state.doc.lineAt(node.from);
    const lineEnd = Math.min(line.to, ctx.docEnd);
    const marks = childMarks(node, "HeaderMark");
    if (marks.length === 0) return;
    const first = marks[0];
    const last = marks[marks.length - 1];
    const contentStart = skipInlineSpace(ctx.state, first.to, lineEnd);
    if (contentStart > first.from) ctx.hide(first.from, contentStart);
    let contentEnd = lineEnd;
    if (marks.length > 1) {
      contentEnd = last.from;
      while (contentEnd > contentStart) {
        const ch = ctx.state.doc.sliceString(contentEnd - 1, contentEnd);
        if (ch !== " " && ch !== "\t") break;
        contentEnd -= 1;
      }
      if (last.to > contentEnd) ctx.hide(contentEnd, last.to);
    }
    if (contentStart < contentEnd) ctx.mark(deco, contentStart, contentEnd);
  };
}

/** 引用 > q：隐藏 QuoteMark 及其后空白，整行加引用样式 */
const visitBlockquote: Visitor = (node, ctx) => {
  if (ctx.isCursorLine(node.from)) return;
  const line = ctx.state.doc.lineAt(node.from);
  const lineEnd = Math.min(line.to, ctx.docEnd);
  for (const m of childMarks(node, "QuoteMark")) {
    // 与标题一致：标记后的空白也一并隐藏，避免渲染后正文前残留空格
    const contentStart = skipInlineSpace(ctx.state, m.to, lineEnd);
    ctx.hide(m.from, contentStart);
  }
  ctx.line(LINES.quote, line.from);
};

/** 列表：符号保留可见但加弱化样式；光标行不装饰 */
const visitListMark: Visitor = (node, ctx) => {
  if (ctx.isCursorLine(node.from)) return;
  ctx.mark(LIST_MARK, node.from, node.to);
};

/** 围栏代码块：隐藏首尾 CodeMark 与首行语言标识 CodeInfo，块内每行加代码样式 */
const visitFencedCode: Visitor = (node, ctx) => {
  const firstLine = ctx.state.doc.lineAt(node.from).number;
  const lastLine = ctx.state.doc.lineAt(node.to).number;
  // 光标在块内任意行 → 整块露源码
  if (ctx.cursorLine >= firstLine && ctx.cursorLine <= lastLine) return;
  // 首围栏 ``` 与紧随的语言标识 js 一并隐藏（否则渲染后残留孤立的 "js"）；
  // 尾围栏 ``` 同样隐藏。CodeInfo 是 CodeMark 之外的独立子节点，需单独收集。
  // 把首行上相邻的标记区间合并为一段，避免中间出现零宽空隙。
  const fenceMarks = [
    ...childMarks(node, "CodeMark"),
    ...childMarks(node, "CodeInfo"),
  ].sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const m of fenceMarks) {
    const last = merged[merged.length - 1];
    if (last && m.from <= last.to) {
      last.to = Math.max(last.to, m.to);
    } else {
      merged.push({ from: m.from, to: m.to });
    }
  }
  for (const m of merged) ctx.hide(m.from, m.to);
  for (let ln = firstLine; ln <= lastLine; ln++) {
    ctx.line(LINES.codeBlock, ctx.state.doc.line(ln).from);
  }
};

/** 分隔线 ---：光标不在该行时隐藏语法、加线样式 */
const visitHorizontalRule: Visitor = (node, ctx) => {
  if (ctx.isCursorLine(node.from)) return;
  ctx.hide(node.from, node.to);
  const line = ctx.state.doc.lineAt(node.from);
  ctx.line(LINES.hr, line.from);
};

/** visitor 派发表：节点名 → 处理函数 */
const VISITORS: Record<string, Visitor> = {
  ATXHeading1: atxHeading(MARKS.h1),
  ATXHeading2: atxHeading(MARKS.h2),
  ATXHeading3: atxHeading(MARKS.h3),
  ATXHeading4: atxHeading(MARKS.h4),
  ATXHeading5: atxHeading(MARKS.h5),
  ATXHeading6: atxHeading(MARKS.h6),
  StrongEmphasis: visitStrong,
  Emphasis: visitEmphasis,
  Strikethrough: visitStrike,
  InlineCode: visitInlineCode,
  Link: visitLink,
  Blockquote: visitBlockquote,
  ListMark: visitListMark,
  FencedCode: visitFencedCode,
  HorizontalRule: visitHorizontalRule,
};

/**
 * 计算一份文档的全部实时预览装饰。
 *
 * 边界处理：空构造不生成零长 mark；无匹配节点返回空集；光标所在行/节点整段露源码；
 * 所有 replace 区间登记进 atomicRanges（方向键整块跳过隐藏语法）。
 */
export function buildDecorations(state: EditorState): LivePreviewDecorations {
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const docEnd = state.doc.length;
  const cursorPos = state.selection.main.head;
  const cursorLine = state.doc.lineAt(cursorPos).number;

  const ctx: BuildContext = {
    state,
    cursorLine,
    cursorPos,
    docEnd,
    ranges,
    atomic,
    isCursorLine: (pos) => state.doc.lineAt(pos).number === cursorLine,
    isCursorInside: (from, to) => cursorPos >= from && cursorPos <= to,
    hide(from, to) {
      if (from >= to) return;
      const r = HIDE.range(from, to);
      ranges.push(r);
      atomic.push(r);
    },
    mark(deco, from, to) {
      if (from >= to) return;
      ranges.push(deco.range(from, to));
    },
    line(deco, at) {
      ranges.push(deco.range(at, at));
    },
  };

  syntaxTree(state).iterate({
    enter(node) {
      const visitor = VISITORS[node.name];
      if (visitor) visitor(node as unknown as NodeRef, ctx);
    },
  });

  return {
    decorations: Decoration.set(ranges, true),
    atomicRanges: RangeSet.of<Decoration>(atomic, true),
  };
}
