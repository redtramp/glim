import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { buildDecorations } from "./livePreview";

/**
 * 用 GFM 语法构造 EditorState。base: markdownLanguage 会加载 GFM 扩展
 * （表格 / 删除线 / 任务列表），与 MarkdownEditor.svelte 的 markdown() 保持一致。
 */
function stateOf(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

interface DecoRecord {
  from: number;
  to: number;
  /** mark / line 装饰的 class；replace 装饰无 class */
  cls?: string;
  /** 是否为 replace（隐藏）装饰 */
  replace: boolean;
  /** 是否为 widget 装饰 */
  widget: boolean;
}

/** 把 DecorationSet 摊平成可读记录，便于精确断言区间 */
function summary(state: EditorState): DecoRecord[] {
  const { decorations } = buildDecorations(state);
  const out: DecoRecord[] = [];
  const iter = decorations.iter();
  while (iter.value) {
    const spec = iter.value.spec as {
      class?: string;
      widget?: unknown;
    };
    // replace 装饰的 spec 为空对象（无 class / 无 widget）；
    // mark / line 有 class；widget 有 widget。据此三类互斥判定。
    const isWidget = spec.widget !== undefined;
    const isReplace =
      spec.class === undefined && !isWidget && iter.from !== iter.to;
    out.push({
      from: iter.from,
      to: iter.to,
      cls: spec.class,
      replace: isReplace,
      widget: isWidget,
    });
    iter.next();
  }
  return out;
}

describe("livePreview / ATX 一级标题", () => {
  it("光标不在标题行：隐藏 '# ' 前缀、标题文字加 cm-lp-h1 类", () => {
    const s = stateOf("# Title\n\nbody", 11); // cursor 在 "body"
    const decos = summary(s);
    // "# " 占 [0,2)，HeaderMark 仅 [0,1)，其后的空格 [1,2) 也应一并隐藏
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(true);
    // 标题文字 "Title" 占 [2,7)
    expect(decos.some((d) => d.from === 2 && d.to === 7 && d.cls === "cm-lp-h1")).toBe(true);
  });

  it("光标在标题文字中：撤回装饰，露出完整源码", () => {
    const s = stateOf("# Title\n\nbody", 4); // cursor 在 "Title" 中
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(false);
    expect(decos.some((d) => d.cls === "cm-lp-h1")).toBe(false);
  });

  it("光标在 '#' 标记上：同样撤回装饰（该行处于编辑态）", () => {
    const s = stateOf("# Title\n\nbody", 0);
    expect(summary(s).some((d) => d.replace)).toBe(false);
  });

  it("多个标题：仅光标所在标题露源码，其余正常渲染", () => {
    const doc = "# One\n\n# Two\n\ntext";
    const s = stateOf(doc, doc.indexOf("Two")); // 光标在第二个标题
    const decos = summary(s);
    // 第一个标题（第 1 行）仍被渲染
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 2 && d.to === 5 && d.cls === "cm-lp-h1")).toBe(true);
    // 第二个标题（第 3 行，起始 7）不隐藏
    expect(decos.some((d) => d.from === 7 && d.to === 9 && d.replace)).toBe(false);
  });

  it("无标题文档：不产生任何装饰", () => {
    const s = stateOf("plain text\n", 3);
    expect(summary(s)).toEqual([]);
  });

  it("只有 '#' 没有内容的标题：不越界、不产生内容 mark", () => {
    const s = stateOf("#\n\nbody", 5);
    const decos = summary(s);
    // 边界：内容区间为空时不应生成 from>=to 的 mark
    expect(decos.every((d) => d.from < d.to)).toBe(true);
  });

  it("atomicRanges 只含被隐藏的 replace 区间，不含内容 mark", () => {
    const s = stateOf("# Title\n\nbody", 11);
    const { atomicRanges } = buildDecorations(s);
    const atomic: { from: number; to: number }[] = [];
    const iter = atomicRanges.iter();
    while (iter.value) {
      atomic.push({ from: iter.from, to: iter.to });
      iter.next();
    }
    // 隐藏的 "# " 应进 atomicRanges
    expect(atomic.some((r) => r.from === 0 && r.to === 2)).toBe(true);
    // 标题文字的 mark 不应进 atomicRanges（否则光标会被困在样式外）
    expect(atomic.some((r) => r.from === 2 && r.to === 7)).toBe(false);
  });

  it("严格无损：计算装饰不改写 EditorState.doc", () => {
    const src = "# Title\n\n**bold** and `code`\n";
    const s = stateOf(src, 12);
    buildDecorations(s);
    expect(s.doc.toString()).toBe(src);
  });

  it("标记后多个空格：隐藏范围含全部空白，内容从首个非空白字符开始", () => {
    const doc = "#   Title\n\nbody";
    const s = stateOf(doc, doc.indexOf("body"));
    const decos = summary(s);
    // "#   " 共 4 字符 [0,4)，全部隐藏；"Title" 占 [4,9)
    expect(decos.some((d) => d.from === 0 && d.to === 4 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 4 && d.to === 9 && d.cls === "cm-lp-h1")).toBe(true);
  });

  it("带闭合 # 的标题（# Title #）：闭合标记一并隐藏，只渲染文字", () => {
    const doc = "# Title #\n\nbody";
    const s = stateOf(doc, doc.indexOf("body"));
    const decos = summary(s);
    // 前置 "# " 隐藏 [0,2)
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(true);
    // 标题文字 "Title" 加类 [2,7)，不含尾部 " #"
    expect(decos.some((d) => d.from === 2 && d.to === 7 && d.cls === "cm-lp-h1")).toBe(true);
    // 尾部 " #"（空格 [7,8) + 闭合 # [8,9)）一并隐藏
    expect(decos.some((d) => d.from === 7 && d.to === 9 && d.replace)).toBe(true);
  });
});
