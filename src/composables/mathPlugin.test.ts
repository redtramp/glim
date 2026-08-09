/**
 * mathPlugin 单测
 *
 * 覆盖:行内 $...$ 与块级 $$...$$ 的解析与渲染、HTML 字符转义(escapeAttr)、
 * 反斜杠转义、空白/空内容拒绝、未闭合保持原文、`$$x$$` 同行块、多行块、
 * 引用段落后的块级数学。
 */
import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import mathPlugin from "./mathPlugin";

function md(): MarkdownIt {
  return new MarkdownIt().use(mathPlugin);
}

describe("行内数学", () => {
  it("$x^2$ 渲染为 math-inline 占位", () => {
    expect(md().renderInline("$x^2$")).toBe(
      '<span class="math-inline" data-math="x^2"></span>'
    );
  });

  it("内容中的 HTML 字符被转义", () => {
    expect(md().renderInline("$a<b & c$")).toBe(
      '<span class="math-inline" data-math="a&lt;b &amp; c"></span>'
    );
  });

  it("反斜杠转义字符保留在内容中", () => {
    expect(md().renderInline("$a\\$b$")).toBe(
      '<span class="math-inline" data-math="a\\$b"></span>'
    );
  });

  it("空/纯空白内容不算数学", () => {
    expect(md().renderInline("$ $")).toBe("$ $");
    expect(md().renderInline("$$")).toBe("$$");
  });

  it("未闭合的行内 $ 保持原文", () => {
    expect(md().renderInline("$x +")).toBe("$x +");
  });

  it("行内双美元整体保持原文（不产生游离 $ 配对）", () => {
    // 回归修复:此前 $$x$$ 中的第二个 $ 会命中单美元规则 → $ + math(x) + $
    expect(md().renderInline("a $$x$$ b")).toBe("a $$x$$ b");
  });

  it("未闭合的双美元序列 $$x$ 保持原文", () => {
    expect(md().renderInline("$$x$")).toBe("$$x$");
  });

  it("反斜杠转义的 $ 之后仍可开启行内数学", () => {
    // 回归守护:\$$x$ 中第二个 $ 的前驱是转义对的 $,不应被双美元拒绝逻辑误伤
    expect(md().renderInline("\\$$x$")).toBe(
      '$<span class="math-inline" data-math="x"></span>'
    );
  });

  it("行内双美元不会在块级上下文之外产生 math-block", () => {
    // 块级规则仅在行首生效,行内双美元不会生成 math-block
    const html = md().render("a $$x$$ b");
    expect(html).not.toContain("math-block");
    expect(html).not.toContain("math-inline");
  });
});

describe("块级数学", () => {
  it("单行 $$x$$ 渲染为 math-block", () => {
    const html = md().render("$$x$$");
    expect(html).toContain('<div class="math-block" data-math="x"></div>');
  });

  it("同行 $$ a+b $$ 提取内容", () => {
    const html = md().render("$$a+b$$");
    expect(html).toContain('class="math-block"');
    expect(html).toContain("a+b");
  });

  it("多行块级内容拼接保留换行", () => {
    const html = md().render("$$\na+b\nc\nd\n$$");
    expect(html).toContain('<div class="math-block"');
    expect(html).toContain("a+b");
    expect(html).toContain("c\nd");
  });

  it("块级内容同样转义 HTML 字符", () => {
    const html = md().render("$$a<b$$");
    expect(html).toContain('data-math="a&lt;b"');
  });

  it("未闭合的块级 $$ 保持原文", () => {
    const html = md().render("$$\nx\n");
    expect(html).not.toContain("math-block");
    expect(html).toContain("$$");
  });

  it("引用段落之后的块级数学仍生效", () => {
    const html = md().render("> quote\n\n$$x$$");
    expect(html).toContain('class="math-block"');
  });
});
