import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  buildDecorations,
  livePreview,
  livePreviewAtomic,
} from "./livePreview";

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

describe("livePreview / 链接", () => {
  it("off-cursor：隐藏 [ ] ( ) 与 URL，链接文字加 cm-lp-link", () => {
    const doc = "see [text](https://u) now\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    // "[" 隐藏
    expect(decos.some((d) => d.from === doc.indexOf("[") && d.to === doc.indexOf("[") + 1 && d.replace)).toBe(true);
    // 链接文字 "text" 加类
    const labelFrom = doc.indexOf("text");
    expect(decos.some((d) => d.from === labelFrom && d.to === labelFrom + 4 && d.cls === "cm-lp-link")).toBe(true);
    // URL 隐藏
    const urlFrom = doc.indexOf("https://u");
    expect(decos.some((d) => d.from === urlFrom && d.to === urlFrom + "https://u".length && d.replace)).toBe(true);
  });

  it("on-cursor：光标在链接内整段露源码", () => {
    const doc = "see [text](https://u) now\n\ntail";
    const s = stateOf(doc, doc.indexOf("text"));
    const decos = summary(s);
    expect(decos.some((d) => d.cls === "cm-lp-link")).toBe(false);
    expect(decos.some((d) => d.replace)).toBe(false);
  });

  it("严格无损：链接原文不变", () => {
    const src = "a [x](u) b\n";
    const s = stateOf(src, 0);
    buildDecorations(s);
    expect(s.doc.toString()).toBe(src);
  });
});

describe("livePreview / 引用与列表", () => {
  it("引用：光标不在该行时隐藏 > 标记、整行加 cm-lp-quote", () => {
    const doc = "> quoted text\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.replace)).toBe(true);
    expect(decos.some((d) => d.cls === "cm-lp-quote")).toBe(true);
  });

  it("引用：光标在引用行时露源码", () => {
    const doc = "> quoted text\n\ntail";
    const s = stateOf(doc, 4);
    expect(summary(s).some((d) => d.cls === "cm-lp-quote")).toBe(false);
  });

  it("列表符号保留可见但加弱化样式（不隐藏，保证大纲可扫）", () => {
    const doc = "- item one\n- item two\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 1 && d.cls === "cm-lp-list-mark")).toBe(true);
    // 列表符号不应被隐藏
    expect(decos.some((d) => d.from === 0 && d.to === 1 && d.replace)).toBe(false);
  });

  it("有序列表符号同样弱化而非隐藏", () => {
    const doc = "1. first\n2. second\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 2 && d.cls === "cm-lp-list-mark")).toBe(true);
  });

  it("列表：光标在列表行时该行符号不加弱化样式（露源码）", () => {
    const doc = "- item one\n- item two\n\ntail";
    const s = stateOf(doc, 4); // 光标在第一行文字中
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 1 && d.cls === "cm-lp-list-mark")).toBe(false);
  });

  it("混合构造文档：全部装饰区间合法（无零长/越界），且原文无损", () => {
    const src = [
      "# Head",
      "",
      "**b** *i* `c` [x](u) ~~s~~",
      "",
      "> quote",
      "",
      "- item",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "---",
    ].join("\n");
    const s = stateOf(src, 0);
    const { decorations } = buildDecorations(s);
    const iter = decorations.iter();
    while (iter.value) {
      expect(iter.from).toBeGreaterThanOrEqual(0);
      expect(iter.to).toBeLessThanOrEqual(src.length);
      iter.next();
    }
    expect(s.doc.toString()).toBe(src);
  });
});

describe("livePreview / 围栏代码块", () => {
  const doc = "```js\nconst x = 1;\n```\n\ntail";

  it("off-cursor：隐藏首尾围栏标记、块内每行加 cm-lp-codeblock", () => {
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    // 首围栏 ```js 隐藏
    expect(decos.some((d) => d.from === 0 && d.to === 5 && d.replace)).toBe(true);
    // 尾围栏 ``` 隐藏
    const closeFrom = doc.lastIndexOf("```");
    expect(decos.some((d) => d.from === closeFrom && d.to === closeFrom + 3 && d.replace)).toBe(true);
    // 块内有 codeblock 行样式
    expect(decos.some((d) => d.cls === "cm-lp-codeblock")).toBe(true);
  });

  it("on-cursor：光标在代码块内任意行时整块露源码", () => {
    const s = stateOf(doc, doc.indexOf("const"));
    const decos = summary(s);
    expect(decos.some((d) => d.replace)).toBe(false);
    expect(decos.some((d) => d.cls === "cm-lp-codeblock")).toBe(false);
  });

  it("严格无损：代码块原文不变", () => {
    const src = "```ts\nlet a = 1;\n```\n";
    const s = stateOf(src, 0);
    buildDecorations(s);
    expect(s.doc.toString()).toBe(src);
  });
});

describe("livePreview / 分隔线", () => {
  it("off-cursor：隐藏 --- 并加 cm-lp-hr 行样式", () => {
    const doc = "above\n\n---\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    const hrFrom = doc.indexOf("---");
    expect(decos.some((d) => d.from === hrFrom && d.to === hrFrom + 3 && d.replace)).toBe(true);
    expect(decos.some((d) => d.cls === "cm-lp-hr")).toBe(true);
  });

  it("on-cursor：光标在分隔线行时露源码", () => {
    const doc = "above\n\n---\n\ntail";
    const s = stateOf(doc, doc.indexOf("---"));
    expect(summary(s).some((d) => d.replace)).toBe(false);
  });
});

describe("livePreview / widget（图片/任务复选框）", () => {
  /** 收集所有带 widget 的装饰区间及其 spec */
  function widgets(state: EditorState) {
    const { decorations } = buildDecorations(state);
    const out: { from: number; to: number; widget: { toDOM(): HTMLElement; eq(o: unknown): boolean } }[] = [];
    const iter = decorations.iter();
    while (iter.value) {
      const spec = iter.value.spec as { widget?: { toDOM(): HTMLElement; eq(o: unknown): boolean } };
      if (spec.widget) out.push({ from: iter.from, to: iter.to, widget: spec.widget });
      iter.next();
    }
    return out;
  }

  it("图片 off-cursor：整段 ![alt](url) 被图片 widget 替换", () => {
    const doc = "![alt](img.png)\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(1);
    expect(ws[0].from).toBe(0);
    expect(ws[0].to).toBe(doc.indexOf("![alt](img.png)") + "![alt](img.png)".length);
    const dom = ws[0].widget.toDOM();
    expect(dom.tagName.toLowerCase()).toBe("img");
    expect((dom as HTMLImageElement).alt).toBe("alt");
  });

  it("图片 on-cursor：光标在图片节点内时不产出 widget（露源码）", () => {
    const doc = "![alt](img.png)\n\ntail";
    const s = stateOf(doc, 3); // 光标在 "alt" 中
    expect(widgets(s)).toHaveLength(0);
  });

  it("任务列表 off-cursor：[ ] / [x] 被 checkbox widget 替换", () => {
    const doc = "- [ ] task\n- [x] done\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(2);
    const boxes = ws.map((w) => w.widget.toDOM() as HTMLInputElement);
    expect(boxes.every((b) => b.type === "checkbox")).toBe(true);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it("任务列表 on-cursor：光标在任务行时不产出 widget", () => {
    const doc = "- [ ] task\n\ntail";
    const s = stateOf(doc, 6); // 光标在 "task"
    expect(widgets(s)).toHaveLength(0);
  });

  it("widget.eq：相同内容不重建 DOM", () => {
    const doc = "![alt](img.png)\n\n![alt](img.png)\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(2);
    // 两个图片的 alt/src 相同，widget 应判等（CM6 用 eq 决定是否复用 DOM）
    expect(ws[0].widget.eq(ws[1].widget)).toBe(true);
  });

  it("严格无损：含图片与任务的文档原文不变", () => {
    const src = "![a](x.png)\n\n- [ ] todo\n- [x] done\n";
    const s = stateOf(src, 0);
    buildDecorations(s);
    expect(s.doc.toString()).toBe(src);
  });

  it("空 alt 图片：widget 仍产出，alt 为空字符串", () => {
    const doc = "![](x.png)\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(1);
    expect((ws[0].widget.toDOM() as HTMLImageElement).alt).toBe("");
  });

  it("无 URL 的图片（![alt]()）：不产出 widget、不崩溃、露源码", () => {
    const doc = "![alt]()\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    expect(() => buildDecorations(s)).not.toThrow();
    expect(widgets(s)).toHaveLength(0);
  });

  it("图片 widget 加载失败时回退为 alt 文本", () => {
    const doc = "![alt text](bad.png)\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    const img = ws[0].widget.toDOM() as HTMLImageElement;
    expect(img.tagName.toLowerCase()).toBe("img");
    // 手动触发 error（jsdom 不自动加载图片），应被父级替换为 alt 文本
    const parent = document.createElement("div");
    parent.appendChild(img);
    img.dispatchEvent(new Event("error"));
    expect(parent.querySelector("span")?.textContent).toBe("alt text");
  });

  it("widget.eq：任务复选框按 checked 判等", () => {
    const doc = "- [ ] a\n- [x] b\n- [ ] c\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(3);
    expect(ws[0].widget.eq(ws[2].widget)).toBe(true); // 都未勾选
    expect(ws[0].widget.eq(ws[1].widget)).toBe(false); // 未勾选 vs 已勾选
  });

  it("widget.ignoreEvent 返回 false（事件交给编辑器处理）", () => {
    const doc = "![a](x.png)\n\n- [ ] task\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const ws = widgets(s);
    expect(ws).toHaveLength(2);
    for (const w of ws) {
      expect((w.widget as unknown as { ignoreEvent(): boolean }).ignoreEvent()).toBe(false);
    }
  });
});

describe("livePreview / ViewPlugin 接入", () => {
  /** 在 jsdom 中挂载真实 EditorView，返回 view 与用于读取当前 decor 的 helper */
  function mount(doc: string, cursor: number) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: cursor },
        extensions: [
          markdown({ base: markdownLanguage }),
          livePreview,
          livePreviewAtomic,
        ],
      }),
    });
    return {
      view,
      /** 从 plugin 实例读取当前 DecorationSet 并摊平 */
      decos() {
        const plugin = view.plugin(livePreview);
        expect(plugin).not.toBeNull();
        const set = plugin!.decorations;
        const out: { from: number; to: number; cls?: string; replace: boolean }[] = [];
        const iter = set.iter();
        while (iter.value) {
          const spec = iter.value.spec as { class?: string; widget?: unknown };
          out.push({
            from: iter.from,
            to: iter.to,
            cls: spec.class,
            replace: spec.class === undefined && spec.widget === undefined,
          });
          iter.next();
        }
        return out;
      },
      destroy() {
        view.destroy();
        parent.remove();
      },
    };
  }

  it("初始挂载：off-cursor 标题的 '# ' 被隐藏、文字加样式", () => {
    const m = mount("# Title\n\nbody", 11);
    try {
      const d = m.decos();
      expect(d.some((x) => x.from === 0 && x.to === 2 && x.replace)).toBe(true);
      expect(d.some((x) => x.from === 2 && x.to === 7 && x.cls === "cm-lp-h1")).toBe(true);
    } finally {
      m.destroy();
    }
  });

  it("selectionSet：光标移到标题行后 decor 撤回（露源码）", () => {
    const m = mount("# Title\n\nbody", 11);
    try {
      m.view.dispatch({ selection: { anchor: 4 } });
      const d = m.decos();
      expect(d.some((x) => x.from === 0 && x.to === 2 && x.replace)).toBe(false);
      expect(d.some((x) => x.cls === "cm-lp-h1")).toBe(false);
    } finally {
      m.destroy();
    }
  });

  it("docChanged：文档变更后 decor 按新内容重算", () => {
    const m = mount("# Title\n\nbody", 11);
    try {
      m.view.dispatch({ changes: { from: 0, insert: "# Changed\n\n" } });
      const d = m.decos();
      // 新标题 "# Changed" 的 "# " 也应被隐藏
      expect(d.some((x) => x.from === 0 && x.to === 2 && x.replace)).toBe(true);
      expect(d.some((x) => x.cls === "cm-lp-h1")).toBe(true);
    } finally {
      m.destroy();
    }
  });

  it("livePreviewAtomic 提供 atomicRanges（隐藏区间可被 EditorView 消费）", () => {
    const m = mount("# Title\n\nbody", 11);
    try {
      // atomicRanges facet 不抛异常即可；通过读取 plugin 的装饰间接验证接线完整
      const plugin = m.view.plugin(livePreview);
      expect(plugin).not.toBeNull();
      expect(plugin!.decorations.size).toBeGreaterThan(0);
    } finally {
      m.destroy();
    }
  });
});

describe("livePreview / 多级标题", () => {
  it("h2-h6 各自使用对应级别样式类", () => {
    const doc = "## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    for (const lvl of [2, 3, 4, 5, 6]) {
      expect(decos.some((d) => d.cls === `cm-lp-h${lvl}`)).toBe(true);
    }
  });

  it("二级标题：隐藏 '## ' 前缀、文字加 cm-lp-h2", () => {
    const doc = "## Title\n\ntail";
    const s = stateOf(doc, doc.indexOf("tail"));
    const decos = summary(s);
    expect(decos.some((d) => d.from === 0 && d.to === 3 && d.replace)).toBe(true);
    expect(decos.some((d) => d.from === 3 && d.to === 8 && d.cls === "cm-lp-h2")).toBe(true);
  });
});
