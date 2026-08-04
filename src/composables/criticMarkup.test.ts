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
  parseCriticMarkup,
  applyDecision,
  acceptAllCriticMarkup,
  rejectAllCriticMarkup,
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

describe("parseCriticMarkup", () => {
  it("五种语法:类型与展示文本正确", () => {
    const src = "a{--del--}b{++ins++}c{~~old~>new~~}d{==hl==}e{>>cmt<<}f";
    const anns = parseCriticMarkup(src);
    expect(anns.map((a) => a.type)).toEqual([
      "del",
      "ins",
      "sub",
      "hl",
      "comment",
    ]);
    const [del, ins, sub, hl, comment] = anns;
    expect(del.oldText).toBe("del");
    expect(del.newText).toBe("");
    expect(ins.oldText).toBe("");
    expect(ins.newText).toBe("ins");
    expect(sub.oldText).toBe("old");
    expect(sub.newText).toBe("new");
    expect(hl.oldText).toBe("hl");
    expect(comment.newText).toBe("cmt");
  });

  it("偏移:start/end 为源文本绝对位置且按序递增", () => {
    const src = "a{--x--}b{++y++}";
    const anns = parseCriticMarkup(src);
    expect(anns).toHaveLength(2);
    expect(anns[0].start).toBe(1);
    expect(anns[0].end).toBe(8); // "{--x--}"
    expect(anns[1].start).toBe(9);
    expect(anns[1].end).toBe(16);
  });

  it("行号:1-based 起始行号", () => {
    const src = "line1\nline2{==x==}\nline3";
    const anns = parseCriticMarkup(src);
    expect(anns).toHaveLength(1);
    expect(anns[0].line).toBe(2);
  });

  it("嵌套:只列顶层,内层保留在 oldText/newText 中", () => {
    const anns = parseCriticMarkup("{=={--x--}==}");
    expect(anns).toHaveLength(1);
    expect(anns[0].type).toBe("hl");
    expect(anns[0].oldText).toBe("{--x--}");
    expect(anns[0].newText).toBe("");
  });

  it("嵌套 sub:顶层分隔符定位不受内层 ~> 干扰", () => {
    const anns = parseCriticMarkup("{~~{--a~>b--}~>c~~}");
    expect(anns).toHaveLength(1);
    expect(anns[0].type).toBe("sub");
    expect(anns[0].oldText).toBe("{--a~>b--}");
    expect(anns[0].newText).toBe("c");
  });

  it("代码块/行内代码跳过", () => {
    const src = "```\n{--x--}\n```\n`{++y++}` {==z==}";
    const anns = parseCriticMarkup(src);
    expect(anns).toHaveLength(1);
    expect(anns[0].type).toBe("hl");
  });

  it("未闭合/缺顶层分隔符/转义不列出", () => {
    expect(parseCriticMarkup("a{--x b")).toHaveLength(0);
    expect(parseCriticMarkup("a{~~x~~}b")).toHaveLength(0); // 缺分隔符
    expect(parseCriticMarkup("\\{--x--\\}")).toHaveLength(0);
  });

  it("空文本/无批注返回空数组", () => {
    expect(parseCriticMarkup("")).toEqual([]);
    expect(parseCriticMarkup("plain text")).toEqual([]);
  });
});

describe("applyDecision", () => {
  const decide = (src: string, decision: "accept" | "reject") =>
    applyDecision(src, parseCriticMarkup(src)[0], decision);

  it("del:accept 取空,reject 保留原文", () => {
    expect(decide("a{--x--}b", "accept")).toBe("ab");
    expect(decide("a{--x--}b", "reject")).toBe("axb");
  });

  it("ins:accept 保留内容,reject 取空", () => {
    expect(decide("a{++x++}b", "accept")).toBe("axb");
    expect(decide("a{++x++}b", "reject")).toBe("ab");
  });

  it("sub:accept 取新值,reject 取旧值", () => {
    expect(decide("a{~~old~>new~~}b", "accept")).toBe("anewb");
    expect(decide("a{~~old~>new~~}b", "reject")).toBe("aoldb");
  });

  it("sub 边界:旧/新值为空时不被 || 误选", () => {
    expect(decide("a{~~x~>~~}b", "accept")).toBe("ab"); // 新值为空
    expect(decide("a{~~x~>~~}b", "reject")).toBe("axb");
  });

  it("hl:accept/reject 均保留内容", () => {
    expect(decide("a{==x==}b", "accept")).toBe("axb");
    expect(decide("a{==x==}b", "reject")).toBe("axb");
  });

  it("comment:accept/reject 均取空", () => {
    expect(decide("a{>>c<<}b", "accept")).toBe("ab");
    expect(decide("a{>>c<<}b", "reject")).toBe("ab");
  });
});

describe("acceptAll/rejectAllCriticMarkup", () => {
  it("acceptAll 与 stripCriticMarkup 接受语义一致", () => {
    const cases = [
      "a{--x--}b",
      "a{++x++}b",
      "a{~~old~>new~~}b",
      "a{==x==}b",
      "a{>>c<<}b",
      "{=={--x--}==}",
      "{++{--x--}++}",
      "{==a{==b==}c==}",
      "{~~{++x++}~>y~~}",
      "plain text",
      "a{--x--}b{++y++}c{~~o~>n~~}d",
    ];
    for (const src of cases) {
      expect(acceptAllCriticMarkup(src)).toBe(stripCriticMarkup(src));
    }
  });

  it("rejectAll:del 恢复原文", () => {
    expect(rejectAllCriticMarkup("a{--x--}b")).toBe("axb");
  });

  it("rejectAll:ins/comment 移除", () => {
    expect(rejectAllCriticMarkup("a{++x++}b")).toBe("ab");
    expect(rejectAllCriticMarkup("a{>>c<<}b")).toBe("ab");
  });

  it("rejectAll:sub 取旧值", () => {
    expect(rejectAllCriticMarkup("a{~~old~>new~~}b")).toBe("aoldb");
  });

  it("rejectAll:hl 保留内容", () => {
    expect(rejectAllCriticMarkup("a{==x==}b")).toBe("axb");
  });

  it("rejectAll:嵌套逐层拒绝收敛", () => {
    // {=={--x--}==}:hl 拒绝保留内层语法 → del 拒绝恢复 x
    expect(rejectAllCriticMarkup("{=={--x--}==}")).toBe("x");
  });

  it("acceptAll:嵌套逐层接受收敛", () => {
    expect(acceptAllCriticMarkup("{=={--x--}==}")).toBe("");
    expect(acceptAllCriticMarkup("{++{--x--}++}")).toBe("");
  });

  it("批量:代码段内批注不受影响", () => {
    const src = "```\n{--x--}\n```\na{--y--}b";
    expect(acceptAllCriticMarkup(src)).toBe("```\n{--x--}\n```\nab");
  });
});
