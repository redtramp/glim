/**
 * criticMarkup 单测
 *
 * 覆盖:五种语法渲染、嵌套、段内跨行、代码块/行内代码隔离、
 * 字面量原样输出、转义、stripCriticMarkup（含删除/替换取新值、代码段保护）。
 */

import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import {
  createCriticMarkupPlugin,
  stripCriticMarkup,
} from "./criticMarkup";

function render(source: string): string {
  // 不启用 typographer:它会把字面文本里的 -- 转成破折号,
  // 与本插件的解析语义无关,避免干扰对字面量/转义行为的断言
  const md = new MarkdownIt({ html: true });
  md.use(createCriticMarkupPlugin());
  return md.render(source).trim();
}

describe("createCriticMarkupPlugin - 五种语法", () => {
  it("删除 {--x--} → <del class=\"critic-del\">", () => {
    expect(render("a{--bad--}b")).toBe("<p>a<del class=\"critic-del\">bad</del>b</p>");
  });

  it("新增 {++x++} → <ins class=\"critic-ins\">", () => {
    expect(render("a{++good++}b")).toBe("<p>a<ins class=\"critic-ins\">good</ins>b</p>");
  });

  it("替换 {~~a~>b~~} → del(a)+ins(b)", () => {
    expect(render("x{~~old~>new~~}y")).toBe(
      '<p>x<del class="critic-del">old</del><ins class="critic-ins">new</ins>y</p>'
    );
  });

  it("高亮 {==x==} → <mark class=\"critic-hl\">", () => {
    expect(render("a{==key==}b")).toBe('<p>a<mark class="critic-hl">key</mark>b</p>');
  });

  it("评论 {>>c<<} → 空 span 带 title", () => {
    expect(render("a{>>note<<}b")).toBe(
      '<p>a<span class="critic-comment" title="note"></span>b</p>'
    );
  });
});

describe("createCriticMarkupPlugin - 嵌套与跨行", () => {
  it("高亮内嵌删除 {=={--x--}==}", () => {
    expect(render("{=={--x--}==}")).toBe(
      '<p><mark class="critic-hl"><del class="critic-del">x</del></mark></p>'
    );
  });

  it("同类型嵌套 {==a{==b==}c==}", () => {
    expect(render("{==a{==b==}c==}")).toBe(
      '<p><mark class="critic-hl">a<mark class="critic-hl">b</mark>c</mark></p>'
    );
  });

  it("批注内允许 markdown 语法（加粗）", () => {
    expect(render("{++**bold**++}")).toBe(
      '<p><ins class="critic-ins"><strong>bold</strong></ins></p>'
    );
  });

  it("段内跨行标记", () => {
    expect(render("a{==line1\nline2==}b")).toBe(
      '<p>a<mark class="critic-hl">line1\nline2</mark>b</p>'
    );
  });

  it("嵌套替换 {~~{++x++}~>y~~}", () => {
    expect(render("{~~{++x++}~>y~~}")).toBe(
      '<p><del class="critic-del"><ins class="critic-ins">x</ins></del><ins class="critic-ins">y</ins></p>'
    );
  });
});

describe("createCriticMarkupPlugin - 代码隔离与字面量", () => {
  it("围栏代码块内不解析", () => {
    expect(render("```\n{--x--}\n```")).toContain("{--x--}");
    expect(render("```\n{--x--}\n```")).not.toContain("critic-del");
  });

  it("行内代码内不解析", () => {
    expect(render("`{--x--}`")).toContain("<code>{--x--}</code>");
  });

  it("未闭合标记原样输出", () => {
    expect(render("a{--x b")).toBe("<p>a{--x b</p>");
  });

  it("替换缺分隔符原样输出", () => {
    expect(render("a{~~x~~}b")).toBe("<p>a{~~x~~}b</p>");
  });

  it("转义 \\{ 后不解析", () => {
    expect(render("\\{--x--\\}")).toBe("<p>{--x--}</p>");
  });
});

describe("stripCriticMarkup", () => {
  it("删除取空", () => {
    expect(stripCriticMarkup("a{--x--}b")).toBe("ab");
  });

  it("新增/高亮取内容", () => {
    expect(stripCriticMarkup("a{++x++}b")).toBe("axb");
    expect(stripCriticMarkup("a{==x==}b")).toBe("axb");
  });

  it("替换取新值", () => {
    expect(stripCriticMarkup("a{~~old~>new~~}b")).toBe("anewb");
  });

  it("评论取空", () => {
    expect(stripCriticMarkup("a{>>note<<}b")).toBe("ab");
  });

  it("嵌套批注:内层先剥离", () => {
    expect(stripCriticMarkup("{=={--x--}==}")).toBe("");
    expect(stripCriticMarkup("{==a{==b==}c==}")).toBe("abc");
    expect(stripCriticMarkup("{++{--x--}++}")).toBe("");
  });

  it("嵌套替换:内容中的标记先剥离", () => {
    expect(stripCriticMarkup("{~~{--a~>b--}~>c~~}")).toBe("c");
  });

  it("无分隔符替换原样保留", () => {
    expect(stripCriticMarkup("a{~~x~~}b")).toBe("a{~~x~~}b");
  });

  it("未闭合标记原样保留", () => {
    expect(stripCriticMarkup("a{--x b")).toBe("a{--x b");
  });

  it("转义标记原样保留", () => {
    expect(stripCriticMarkup("\\{--x--\\}")).toBe("\\{--x--\\}");
  });

  it("围栏代码块中的语法不被剥离", () => {
    const src = "before\n```md\n{--x--}\n{++y++}\n```\nafter{++z++}";
    expect(stripCriticMarkup(src)).toBe("before\n```md\n{--x--}\n{++y++}\n```\nafterz");
  });

  it("行内代码中的语法不被剥离", () => {
    expect(stripCriticMarkup("`{--x--}` and {==y==}")).toBe("`{--x--}` and y");
  });

  it("无批注文本原样返回", () => {
    expect(stripCriticMarkup("plain text")).toBe("plain text");
  });
});
