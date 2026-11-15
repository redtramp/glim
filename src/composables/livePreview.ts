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
} as const;

/** 预建装饰实例，避免每次重算都重新分配（cairn 模式） */
const HIDE = Decoration.replace({});
const H1_MARK = Decoration.mark({ class: LP_CLASS.h1 });

export interface LivePreviewDecorations {
  /** 供 ViewPlugin 的 decorations 字段使用：mark / line / replace / widget 全集合 */
  decorations: DecorationSet;
  /** 供 EditorView.atomicRanges 使用：仅 replace / widget，方向键整块跳过隐藏语法 */
  atomicRanges: RangeSet<Decoration>;
}

/**
 * 「该行是否应露出源码」：光标所在行（按主选区 head 所在行）始终露源码。
 * 行级构造（标题 / 引用 / 列表 / 围栏等）用此判据。
 */
function isCursorLine(state: EditorState, from: number): boolean {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  return state.doc.lineAt(from).number === cursorLine;
}

/**
 * HeaderMark 是标记本体（如 "#" 占 [0,1)），其后到正文之间可能有若干空白
 * （"# Title" 的空格 [1,2)、"#   Title" 的多个空格）。这里从标记结束位置
 * 动态扫描空白，返回「正文起始位置」——不写死 +1 / +2，适配任意数量空格与
 * 多级标题（## 的 HeaderMark 占 [0,2)）。
 */
function skipInlineSpace(state: EditorState, from: number, limit: number): number {
  let pos = from;
  while (pos < limit) {
    const ch = state.doc.sliceString(pos, pos + 1);
    if (ch !== " " && ch !== "\t") break;
    pos += 1;
  }
  return pos;
}

/**
 * 计算一份文档的全部实时预览装饰。
 *
 * 阶段一（Task 2）只实现 ATX 一级标题：
 * - HeaderMark + 其后空白 → replace 隐藏，并加入 atomicRanges；
 * - 标题文字 → mark 加 cm-lp-h1 类；
 * - 光标所在行 → 整行不产出任何装饰（露源码）。
 *
 * 边界处理：空标题（"#" 后无内容）不生成 from>=to 的 mark；无标题文档返回空集；
 * 多标题逐一按行判定，互不影响。
 */
export function buildDecorations(state: EditorState): LivePreviewDecorations {
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const docEnd = state.doc.length;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "ATXHeading1") return;
      // 光标所在行：整行露源码，不产出装饰
      if (isCursorLine(state, node.from)) return;

      const line = state.doc.lineAt(node.from);
      const lineEnd = Math.min(line.to, docEnd);
      // 收集该标题节点下全部 HeaderMark：前置 "#" 与（可选）闭合 "#" 都会出现。
      // 不能只取第一个，否则 "# Title #" 的闭合标记会被误当作标题文字渲染。
      const marks: { from: number; to: number }[] = [];
      const cursor = node.node.cursor();
      if (cursor.firstChild()) {
        do {
          if (cursor.name === "HeaderMark") {
            marks.push({ from: cursor.from, to: cursor.to });
          }
        } while (cursor.nextSibling());
      }
      if (marks.length === 0) return;

      const firstMark = marks[0];
      const lastMark = marks[marks.length - 1];
      // 前置标记 + 其后空白 → 隐藏；正文起始位置动态计算（不写死 +1/+2）
      const contentStart = skipInlineSpace(state, firstMark.to, lineEnd);
      if (contentStart > firstMark.from) {
        const hideRange = HIDE.range(firstMark.from, contentStart);
        ranges.push(hideRange);
        atomic.push(hideRange);
      }
      // 正文结束位置：若存在闭合标记，则到闭合标记前（并吸收其前的空白）；
      // 否则到行尾。闭合标记本身单独隐藏。
      let contentEnd = lineEnd;
      if (marks.length > 1) {
        contentEnd = lastMark.from;
        while (contentEnd > contentStart) {
          const ch = state.doc.sliceString(contentEnd - 1, contentEnd);
          if (ch !== " " && ch !== "\t") break;
          contentEnd -= 1;
        }
        const closingFrom = contentEnd;
        if (lastMark.to > closingFrom) {
          const closeRange = HIDE.range(closingFrom, lastMark.to);
          ranges.push(closeRange);
          atomic.push(closeRange);
        }
      }
      // 标题文字：仅当内容区间非空才加 mark，避免 from===to 的零长装饰
      if (contentStart < contentEnd) {
        ranges.push(H1_MARK.range(contentStart, contentEnd));
      }
    },
  });

  return {
    decorations: Decoration.set(ranges, true),
    atomicRanges: RangeSet.of<Decoration>(atomic, true),
  };
}
