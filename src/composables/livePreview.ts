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
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
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
  image: "cm-lp-image",
  task: "cm-lp-task",
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
  /** 产出 widget 替换区间，并登记进 atomicRanges（方向键整块跳过） */
  widget(deco: Decoration, from: number, to: number): void;
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
/**
 * Lezer 对长文档采用增量解析：直接 syntaxTree(state) 可能只解析到文档前半段，
 * 后半段节点（引用 / 表格 / 任务列表等块级构造）尚未生成，装饰会静默缺失。
 * 这里尽力取「解析到文档末尾」的完整树；超时 / 解析中断时回退到当前树，
 * 保证至少处理已解析部分、不阻塞主线程、不抛异常。
 */
const FULL_PARSE_TIMEOUT_MS = 5000;

function fullSyntaxTree(state: EditorState) {
  return (
    ensureSyntaxTree(state, state.doc.length, FULL_PARSE_TIMEOUT_MS) ??
    syntaxTree(state)
  );
}

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

/* ============ Widget（图片 / 任务复选框） ============ */

/**
 * 图片 widget：把整段 ![alt](url) 替换成 <img>。
 * src 暂用原始值（阶段二接入 noteDirectory facet + convertFileSrc 做本地路径解析）；
 * 加载失败时回退为 alt 文本，避免空白占位。
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const img = document.createElement("img");
    img.className = LP_CLASS.image;
    img.alt = this.alt;
    img.src = this.src;
    // 无 src 或加载失败时显示 alt 文本，避免出现破碎图片图标 / 空白
    const showFallback = () => {
      if (!this.alt) return;
      const span = document.createElement("span");
      span.className = `${LP_CLASS.image}-fallback`;
      span.textContent = this.alt;
      img.replaceWith(span);
    };
    if (!this.src) {
      showFallback();
    } else {
      img.addEventListener("error", showFallback, { once: true });
    }
    return img;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** 任务复选框 widget：把 [ ] / [x] 替换成可点击 checkbox */
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked;
  }

  toDOM(): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = LP_CLASS.task;
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** 图片：光标在节点内露源码；否则整段替换为图片 widget */
const visitImage: Visitor = (node, ctx) => {
  if (ctx.isCursorInside(node.from, node.to)) return;
  const linkMarks = childMarks(node, "LinkMark");
  const urls = childMarks(node, "URL");
  if (urls.length === 0) return;
  // alt 位于首个 LinkMark 之后、第二个 LinkMark 之前（Lezer 不为 alt 单独建节点）
  const altFrom = linkMarks.length > 0 ? linkMarks[0].to : node.from;
  const altTo = linkMarks.length > 1 ? linkMarks[1].from : urls[0].from;
  const alt = altFrom < altTo
    ? ctx.state.doc.sliceString(altFrom, altTo)
    : "";
  const src = ctx.state.doc.sliceString(urls[0].from, urls[0].to);
  ctx.widget(Decoration.replace({ widget: new ImageWidget(src, alt) }), node.from, node.to);
};

/** 任务标记：光标在任务行露源码；否则 [ ] / [x] 替换为 checkbox widget */
const visitTaskMarker: Visitor = (node, ctx) => {
  if (ctx.isCursorLine(node.from)) return;
  const raw = ctx.state.doc.sliceString(node.from, node.to);
  const checked = /x/i.test(raw);
  ctx.widget(
    Decoration.replace({ widget: new TaskWidget(checked) }),
    node.from,
    node.to,
  );
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
  Image: visitImage,
  TaskMarker: visitTaskMarker,
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
    widget(deco, from, to) {
      if (from >= to) return;
      const r = deco.range(from, to);
      ranges.push(r);
      atomic.push(r);
    },
  };

  fullSyntaxTree(state).iterate({
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

/* ============ ViewPlugin 接入（供 MarkdownEditor 挂载） ============ */

/**
 * 实时预览 ViewPlugin：把 buildDecorations 的纯函数结果接到 CM6 视图。
 * 文档变更 / 光标移动 / 视口变化时重算装饰；其余情况复用上一次结果。
 */
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view.state).decorations;
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged
    ) {
      this.decorations = buildDecorations(update.state).decorations;
    }
  }
}

/** 供 EditorState.extensions 使用的实时预览扩展 */
export const livePreview = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin) => plugin.decorations,
});

/**
 * 让方向键把被隐藏 / 替换的语法区间当作一个原子单位跳过。
 * 与 livePreview 一起挂载；每次从当前 state 重算，保证与装饰同步。
 */
export const livePreviewAtomic = EditorView.atomicRanges.of((view) => {
  return buildDecorations(view.state).atomicRanges;
});
