/**
 * useAnnotations 定位与工具单测
 *
 * 覆盖:
 * - locateSelection 唯一 / 歧义 / 失败 三路径 + 跨行归一化匹配
 * - buildMarkupFragment 五种批注片段生成
 * - fillTemplate 占位符替换与模板持久化
 * - resolveSelectionRange / selectionToSourceLines(DOM 侧)
 * - useAnnotations 组合式函数:applyMarkup 写回链路(唯一/歧义/失败)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  locateSelection,
  buildMarkupFragment,
  fillTemplate,
  normalizeWhitespace,
  DEFAULT_AI_TEMPLATE,
  getAITemplate,
  setAITemplate,
  resetAITemplate,
  resolveSelectionRange,
  selectionToSourceLines,
  useAnnotations,
  type AnnotationContext,
} from "./useAnnotations.svelte.ts";

/** vitest4 + jsdom 环境无 localStorage,提供内存实现保证模板持久化可测 */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

describe("locateSelection - 唯一/歧义/失败三路径", () => {
  const source = "第一行\n这是要批注的文本\n第三行也有文本\n这是要批注的文本\n末行";

  it("唯一匹配:返回源文本中的原始下标", () => {
    const loc = locateSelection(source, [2, 2], "这是要批注的文本");
    expect(loc).not.toBeNull();
    expect(loc!.matches).toBe(1);
    expect(source.slice(loc!.start, loc!.end)).toBe("这是要批注的文本");
  });

  it("歧义:多处匹配时取源顺序最近者并报告匹配数", () => {
    const loc = locateSelection(source, [2, 4], "这是要批注的文本");
    expect(loc).not.toBeNull();
    expect(loc!.matches).toBe(2);
    expect(source.slice(loc!.start, loc!.end)).toBe("这是要批注的文本");
    // 取第一个(第 2 行),而非第 4 行
    expect(loc!.start).toBe(source.indexOf("这是要批注的文本"));
  });

  it("歧义:提供 preferOffset 时取偏移最接近的匹配", () => {
    const loc = locateSelection(
      source,
      [2, 4],
      "这是要批注的文本",
      source.lastIndexOf("这是要批注的文本")
    );
    expect(loc).not.toBeNull();
    expect(loc!.matches).toBe(2);
    expect(loc!.start).toBe(source.lastIndexOf("这是要批注的文本"));
  });

  it("失败:选区文本在源行区间内不存在 → null", () => {
    const loc = locateSelection(source, [1, 1], "不存在的文本");
    expect(loc).toBeNull();
  });

  it("失败:选区跨格式化语法边界(渲染文本 ≠ 源文本) → null", () => {
    // 用户选中渲染后跨元素的文本「粗体 内容」,源是 **粗体** 内容,
    // 归一化后 `粗体 内容` 不是源文本子串 → 拒绝
    const src = "包含 **粗体** 内容";
    const loc = locateSelection(src, [1, 1], "粗体 内容");
    expect(loc).toBeNull();
  });

  it("空选区文本 → null", () => {
    expect(locateSelection(source, [1, 1], "   ")).toBeNull();
  });

  it("行范围越界时夹紧处理,不抛错", () => {
    const loc = locateSelection(source, [0, 999], "末行");
    expect(loc).not.toBeNull();
    expect(source.slice(loc!.start, loc!.end)).toBe("末行");
  });
});

describe("locateSelection - 跨行与空白归一化", () => {
  it("选区跨两行(换行被归一化为空格)可匹配", () => {
    const src = "第一行\n第二行内容\n第三行";
    const loc = locateSelection(src, [1, 2], "第一行\n第二行");
    expect(loc).not.toBeNull();
    expect(src.slice(loc!.start, loc!.end)).toBe("第一行\n第二行");
  });

  it("源内多空白与选区单空格归一化后匹配", () => {
    const src = "a   b\t\tc";
    const loc = locateSelection(src, [1, 1], "a b c");
    expect(loc).not.toBeNull();
    expect(src.slice(loc!.start, loc!.end)).toBe("a   b\t\tc");
  });

  it("normalizeWhitespace 折叠连续空白", () => {
    expect(normalizeWhitespace("  a \n\t b  ")).toBe("a b");
  });
});

describe("buildMarkupFragment - 五种片段生成", () => {
  it("删除包裹选中文本", () => {
    expect(buildMarkupFragment("del", "x")).toBe("{--x--}");
  });

  it("新增在选中文本前插入 payload 并保留原文", () => {
    expect(buildMarkupFragment("ins", "x", "新")).toBe("{++新++}x");
  });

  it("替换包裹选中文本并标记新值", () => {
    expect(buildMarkupFragment("sub", "旧", "新")).toBe("{~~旧~>新~~}");
  });

  it("高亮包裹选中文本", () => {
    expect(buildMarkupFragment("hl", "x")).toBe("{==x==}");
  });

  it("评论在选中文本前插入评论并保留原文", () => {
    expect(buildMarkupFragment("comment", "x", "注")).toBe("{>>注<<}x");
  });
});

describe("fillTemplate - 占位符替换", () => {
  it("替换 {{content}} 与 {{file}}", () => {
    const out = fillTemplate("文件 {{file}}\n{{content}}", {
      content: "正文",
      file: "a.md",
    });
    expect(out).toBe("文件 a.md\n正文");
  });

  it("多处占位符全部替换", () => {
    const out = fillTemplate("{{content}} | {{file}} | {{content}}", {
      content: "c",
      file: "f",
    });
    expect(out).toBe("c | f | c");
  });

  it("默认模板包含批注语法说明与 {{content}}", () => {
    expect(DEFAULT_AI_TEMPLATE).toContain("{{content}}");
    expect(DEFAULT_AI_TEMPLATE).toContain("{--删除--}");
    expect(DEFAULT_AI_TEMPLATE).toContain("{~~旧~>新~~}");
  });
});

describe("AI 模板持久化", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("未自定义时返回默认模板", () => {
    expect(getAITemplate()).toBe(DEFAULT_AI_TEMPLATE);
  });

  it("setAITemplate 后返回自定义值", () => {
    setAITemplate("自定义 {{content}}");
    expect(getAITemplate()).toBe("自定义 {{content}}");
  });

  it("resetAITemplate 恢复默认", () => {
    setAITemplate("自定义");
    resetAITemplate();
    expect(getAITemplate()).toBe(DEFAULT_AI_TEMPLATE);
  });
});

describe("DOM 侧:选区 → 源行范围", () => {
  it("resolveSelectionRange 拒绝空/折叠选区", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<p data-source-line="1">hello <strong>world</strong></p>';
    document.body.appendChild(container);

    expect(resolveSelectionRange(container, null)).toBeNull();

    const sel = window.getSelection()!;
    sel.removeAllRanges();
    expect(resolveSelectionRange(container, sel)).toBeNull();

    // 折叠选区 → null
    const range = document.createRange();
    range.setStart(container.firstChild!.firstChild!, 1);
    range.collapse(true);
    sel.addRange(range);
    expect(resolveSelectionRange(container, sel)).toBeNull();

    document.body.removeChild(container);
  });

  it("selectionToSourceLines 从锚点元素反推行号", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<p data-source-line="3">line3</p><p data-source-line="7">line7</p>';
    document.body.appendChild(container);
    const p1 = container.querySelector<HTMLElement>('[data-source-line="3"]')!;
    const p2 = container.querySelector<HTMLElement>('[data-source-line="7"]')!;
    const range = document.createRange();
    range.setStart(p1.firstChild!, 0);
    range.setEnd(p2.firstChild!, 5);
    expect(selectionToSourceLines(range)).toEqual([3, 7]);

    // 无锚点的文本节点 → null
    const orphan = document.createElement("p");
    orphan.textContent = "x";
    document.body.appendChild(orphan);
    const range2 = document.createRange();
    range2.setStart(orphan.firstChild!, 0);
    range2.setEnd(orphan.firstChild!, 1);
    expect(selectionToSourceLines(range2)).toBeNull();
    document.body.removeChild(orphan);
    document.body.removeChild(container);
  });
});

describe("useAnnotations - applyMarkup 写回链路", () => {
  let container: HTMLElement;
  let source: string;
  let setSource: ReturnType<typeof vi.fn<(next: string) => void>>;
  let notices: string[];
  let ctx: AnnotationContext;
  let sel: Selection;

  /** 纯文本段落:渲染 DOM 与源文本一一对应(第 1 行) */
  function makeContainer(text: string): void {
    source = text;
    container = document.createElement("div");
    container.innerHTML = `<p data-source-line="1">${text}</p>`;
    document.body.appendChild(container);
  }

  /** 含加粗的段落:渲染 DOM 与源文本(带 ** 语法)不一致 */
  function makeBoldContainer(): void {
    source = "**bold** text";
    container = document.createElement("div");
    container.innerHTML =
      '<p data-source-line="1"><strong>bold</strong> text</p>';
    document.body.appendChild(container);
  }

  function selectText(text: string): void {
    const p = container.querySelector("p")!;
    const full = p.textContent!;
    const idx = full.indexOf(text);
    expect(idx).toBeGreaterThanOrEqual(0);
    const range = document.createRange();
    range.setStart(p.firstChild!, idx);
    range.setEnd(p.firstChild!, idx + text.length);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** 选中跨 strong 边界的渲染文本「bold text」 */
  function selectAcrossBold(): void {
    const strong = container.querySelector("strong")!;
    const tail = container.querySelector("p")!.childNodes[1] as Text;
    const range = document.createRange();
    range.setStart(strong.firstChild!, 0);
    range.setEnd(tail, tail.length); // tail = " text"(含前导空格)
    sel.removeAllRanges();
    sel.addRange(range);
    expect(range.toString()).toBe("bold text");
  }

  beforeEach(() => {
    setSource = vi.fn();
    notices = [];
    ctx = {
      getSource: () => source,
      getFileName: () => "t.md",
      setSource,
      notify: (k: string) => notices.push(k),
      confirmClear: () => true,
    };
    sel = window.getSelection()!;
    // jsdom 未实现 Range.getBoundingClientRect,selectionchange 定位需要它
    Range.prototype.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 100,
        height: 20,
        right: 110,
        bottom: 40,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
  });

  afterEach(() => {
    if (container?.parentNode) document.body.removeChild(container);
    sel.removeAllRanges();
    delete (Range.prototype as { getBoundingClientRect?: unknown })
      .getBoundingClientRect;
    vi.restoreAllMocks();
  });

  it("唯一匹配:高亮写回源文本并隐藏工具栏", () => {
    makeContainer("正文内容");
    selectText("正文内容");
    const { toolbar, configure, applyMarkup } = useAnnotations();
    configure(() => ctx, () => container);
    applyMarkup("hl");
    expect(setSource).toHaveBeenCalledWith("{==正文内容==}");
    expect(notices).toEqual([]);
    expect(toolbar.visible).toBe(false);
  });

  it("歧义:两处相同文本时取第一个写回", () => {
    makeContainer("AB AB");
    selectText("AB");
    const { configure, applyMarkup } = useAnnotations();
    configure(() => ctx, () => container);
    applyMarkup("del");
    expect(setSource).toHaveBeenCalledWith("{--AB--} AB");
  });

  it("歧义:选中第二处相同文本时按锚点偏移写回第二处", () => {
    makeContainer("AB AB");
    // 选中第二个「AB」(indexOf 从 1 起)
    const p = container.querySelector("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 3);
    range.setEnd(p.firstChild!, 5);
    sel.removeAllRanges();
    sel.addRange(range);
    const { configure, applyMarkup } = useAnnotations();
    configure(() => ctx, () => container);
    applyMarkup("del");
    expect(setSource).toHaveBeenCalledWith("AB {--AB--}");
  });

  it("失败:选区跨格式化语法边界 → 提示且不写文件", () => {
    makeBoldContainer();
    selectAcrossBold();
    const { configure, applyMarkup } = useAnnotations();
    configure(() => ctx, () => container);
    applyMarkup("del");
    expect(notices).toContain("annotation.unsupportedSelection");
    expect(setSource).not.toHaveBeenCalled();
  });

  it("回归:输入态写回——选区被输入框聚焦清空后仍用缓存选区写回", () => {
    makeContainer("正文内容");
    selectText("正文内容");
    const {
      toolbar,
      configure,
      initSelectionWatch,
      dispose,
      applyMarkup,
    } = useAnnotations();
    configure(() => ctx, () => container);
    initSelectionWatch();
    // selectionchange 缓存有效选区(pendingRange)
    document.dispatchEvent(new Event("selectionchange"));
    // 模拟点击输入框后文档选区被清空(输入态)
    sel.removeAllRanges();
    toolbar.mode = "ins";
    applyMarkup("ins", "新增");
    expect(setSource).toHaveBeenCalledWith("{++新增++}正文内容");
    toolbar.mode = "";
    dispose();
  });

  it("替换:选中文本 → {~~旧~>新~~} 写回", () => {
    makeContainer("旧文本");
    selectText("旧文本");
    const { configure, applyMarkup } = useAnnotations();
    configure(() => ctx, () => container);
    applyMarkup("sub", "新");
    expect(setSource).toHaveBeenCalledWith("{~~旧文本~>新~~}");
  });

  it("无上下文时不执行任何操作", () => {
    makeContainer("hello");
    selectText("hello");
    const { configure, applyMarkup } = useAnnotations();
    configure(() => null, () => container);
    applyMarkup("del");
    expect(setSource).not.toHaveBeenCalled();
  });
});
