/**
 * useFindInPage 测试
 *
 * 测试目标:
 * - search: 高亮计数、激活项、大小写敏感、空查询、MAX_MATCHES 上限
 * - collectTextNodes: 跳过 script/style/数学与 mermaid 块
 * - next/prev 循环、highlightActive 类切换
 * - clearHighlights / reset / open / close
 * - highlightSearch（恢复查询不显示 FindBar）
 * - scrollToLine: 行号定位、行号缺失回退首项、非法行/无匹配直接返回
 * - bodyRef 为空时的容错
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useFindInPage } from "./useFindInPage.svelte.ts";

function setup(html: string): HTMLDivElement {
  const body = document.createElement("div");
  body.innerHTML = html;
  document.body.appendChild(body);
  return body;
}

describe("useFindInPage", () => {
  beforeEach(() => {
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView =
      vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("搜索高亮全部匹配并激活首项", () => {
    const body = setup("<p>foo bar foo</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "foo";
    f.search();
    expect(f.total.value).toBe(2);
    expect(body.querySelectorAll(".find-highlight")).toHaveLength(2);
    expect(f.matches.value[0].classList.contains("find-highlight-active")).toBe(true);
  });

  it("大小写敏感开关", () => {
    const body = setup("<p>Foo foo</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "foo";
    f.caseSensitive.value = true;
    f.search();
    expect(f.total.value).toBe(1);
    f.caseSensitive.value = false;
    f.search();
    expect(f.total.value).toBe(2);
  });

  it("空查询清除高亮", () => {
    const body = setup("<p>abc</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "";
    f.search();
    expect(f.total.value).toBe(0);
  });

  it("超过 MAX_MATCHES 上限截断为 1000", () => {
    const body = setup(`<p>${"a".repeat(1100)}</p>`);
    const f = useFindInPage({ value: body });
    f.query.value = "a";
    f.search();
    expect(f.total.value).toBe(1000);
  });

  it("跳过 script/style/数学与 mermaid 块中的文本", () => {
    const body = setup(
      '<p>hello</p><script>hello</script><style>hello</style>' +
        '<span class="math-inline">hello</span><span class="mermaid-block">hello</span>'
    );
    const f = useFindInPage({ value: body });
    f.query.value = "hello";
    f.search();
    expect(f.total.value).toBe(1);
  });

  it("next/prev 循环切换激活项", () => {
    const body = setup("<p>foo foo foo</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "foo";
    f.search();
    expect(f.activeIndex.value).toBe(0);

    f.next();
    expect(f.activeIndex.value).toBe(1);
    expect(f.matches.value[1].classList.contains("find-highlight-active")).toBe(true);
    expect(f.matches.value[0].classList.contains("find-highlight-active")).toBe(false);

    f.prev();
    expect(f.activeIndex.value).toBe(0);
    f.prev();
    expect(f.activeIndex.value).toBe(2); // 回绕到末项
    f.next();
    expect(f.activeIndex.value).toBe(0); // 回绕到首项
  });

  it("无匹配时 next/prev 不改变索引", () => {
    const body = setup("<p>abc</p>");
    const f = useFindInPage({ value: body });
    f.next();
    f.prev();
    expect(f.activeIndex.value).toBe(0);
  });

  it("clearHighlights 还原文本", () => {
    const body = setup("<p>foo</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "foo";
    f.search();
    f.clearHighlights();
    expect(body.querySelectorAll(".find-highlight")).toHaveLength(0);
    expect(body.textContent).toBe("foo");
    expect(f.total.value).toBe(0);
  });

  it("reset 清空查询与高亮", () => {
    const body = setup("<p>foo</p>");
    const f = useFindInPage({ value: body });
    f.query.value = "foo";
    f.search();
    f.reset();
    expect(f.query.value).toBe("");
    expect(f.total.value).toBe(0);
  });

  it("open/close 控制可见性并在关闭时清高亮", () => {
    const body = setup("<p>foo</p>");
    const f = useFindInPage({ value: body });
    f.open();
    expect(f.visible.value).toBe(true);
    f.query.value = "foo";
    f.search();
    f.close();
    expect(f.visible.value).toBe(false);
    expect(f.total.value).toBe(0);
  });

  it("highlightSearch 恢复查询并高亮（无查询时不动作）", () => {
    const body = setup("<p>foo</p>");
    const f = useFindInPage({ value: body });
    f.highlightSearch("   ");
    expect(f.total.value).toBe(0);
    f.highlightSearch("foo");
    expect(f.query.value).toBe("foo");
    expect(f.total.value).toBe(1);
  });

  it("scrollToLine 定位到对应源行匹配项", () => {
    const body = setup(
      '<p data-source-line="1">x one</p><p data-source-line="2">x two</p>'
    );
    const f = useFindInPage({ value: body });
    f.query.value = "x";
    f.scrollToLine(2);
    expect(f.activeIndex.value).toBe(1);
    expect(f.matches.value[1].classList.contains("find-highlight-active")).toBe(true);
  });

  it("scrollToLine: 行号缺失时回退高亮首项", () => {
    const body = setup(
      '<p data-source-line="1">x one</p><p data-source-line="3">x three</p>'
    );
    const f = useFindInPage({ value: body });
    f.query.value = "x";
    f.scrollToLine(2);
    expect(f.activeIndex.value).toBe(0);
  });

  it("scrollToLine: 非法行号或无匹配直接返回", () => {
    const body = setup('<p data-source-line="1">x</p>');
    const f = useFindInPage({ value: body });
    f.scrollToLine(0);
    f.scrollToLine(-3);
    f.query.value = "";
    f.scrollToLine(5);
    expect(f.total.value).toBe(0);
  });

  it("bodyRef 为空时各操作安全返回", () => {
    const f = useFindInPage({ value: null });
    expect(() => f.clearHighlights()).not.toThrow();
    f.query.value = "x";
    f.search();
    expect(f.total.value).toBe(0);
    f.scrollToLine(5);
    f.next();
    f.prev();
    expect(f.total.value).toBe(0);
  });
});
