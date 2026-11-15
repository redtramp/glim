import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
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

/**
 * grammar 锁定：把 livePreview 依赖的 Lezer 节点名钉死在测试里。
 * 名称来自 @codemirror/lang-markdown（base: markdownLanguage，含 GFM）实测，
 * 若日后语法升级改了节点名，这里会先失败，避免装饰悄悄失效。
 */
function nodeNames(doc: string): string[] {
  const s = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
  const names: string[] = [];
  syntaxTree(s).iterate({ enter: (n) => { names.push(n.name); } });
  return names;
}

/** 各 construct 依赖的节点名——与 visitor 派发表一一对应 */
const REQUIRED_NODES = [
  "ATXHeading1",
  "HeaderMark",
  "StrongEmphasis",
  "Emphasis",
  "EmphasisMark",
  "InlineCode",
  "CodeMark",
  "Link",
  "LinkMark",
  "URL",
  "Strikethrough",
  "StrikethroughMark",
  "BulletList",
  "OrderedList",
  "ListItem",
  "ListMark",
  "Blockquote",
  "QuoteMark",
  "FencedCode",
  "HorizontalRule",
  "Table",
  "Task",
  "TaskMarker",
  "Image",
] as const;

describe("livePreview / grammar 锁定", () => {
  const sample = [
    "# Title",
    "",
    "**b** *i* `c` [x](u) ~~s~~ ![alt](img.png)",
    "",
    "- item",
    "",
    "1. first",
    "",
    "> quote",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "---",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "- [ ] task",
    "- [x] done",
  ].join("\n");

  it("全部目标 construct 的 Lezer 节点名均存在", () => {
    const names = nodeNames(sample);
    const missing = REQUIRED_NODES.filter((n) => !names.includes(n));
    expect(missing).toEqual([]);
  });

  it("GFM 专用节点（删除线/表格/任务列表）确由 base: markdownLanguage 提供", () => {
    const names = nodeNames(sample);
    expect(names).toContain("Strikethrough");
    expect(names).toContain("Table");
    expect(names).toContain("TaskMarker");
  });
});

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

describe("livePreview / 行内定界符（粗体/斜体/行内代码/删除线）", () => {
  // "**b** *i* `c` ~~s~~" 的区间：
  // [0,2)** [2,3)b [3,5)** | [5,6)空格 [6,7)* [7,8)i [8,9)* | [9,10)空格 [10,11)` [11,12)c [12,13)` | [13,14)空格 [14,16)~~ [16,17)s [17,19)~~
  const doc = "**b** *i* `c` ~~s~~";

  it("off-cursor：隐藏定界符、内容加对应样式类", () => {
    // 光标置于文档末尾之外不可能，改用另一行做光标行
    const s = stateOf(doc + "\n\ntail", doc.length + 3);
    const decos = summary(s);
    // 粗体 **
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 3 && d.to === 5 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 2 && d.to === 3 && d.cls === "cm-lp-strong")).toBe(true);
    // 斜体 *
    expect(decos.some((d) => d.from === 6 && d.to === 7 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 7 && d.to === 8 && d.cls === "cm-lp-em")).toBe(true);
    // 行内代码 `
    expect(decos.some((d) => d.from === 10 && d.to === 11 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 11 && d.to === 12 && d.cls === "cm-lp-code")).toBe(true);
    // 删除线 ~~
    expect(decos.some((d) => d.from === 14 && d.to === 16 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 16 && d.to === 17 && d.cls === "cm-lp-strike")).toBe(true);
  });

  it("on-cursor：光标落在粗体节点内时整段露源码", () => {
    const s = stateOf(doc, 2); // 光标在 "b" 上（粗体节点内）
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(false);
    expect(decos.some((d) => d.cls === "cm-lp-strong")).toBe(false);
  });

  it("严格无损：装饰计算不改写含行内标记的原文", () => {
    const src = "a **b** *i* `c` ~~s~~ z\n";
    const s = stateOf(src, 0);
    buildDecorations(s);
    expect(s.doc.toString()).toBe(src);
  });
});
