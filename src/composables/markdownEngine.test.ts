/**
 * markdownEngine 单测
 *
 * 覆盖:
 * - splitFrontMatter:无/标准/缺失结束符/不足三行/空 front matter/CRLF
 * - renderFrontMatter:data 对象/非对象/null 三种分支与转义
 * - createMarkdownIt + renderMarkdownRaw:标题锚点/data-source-line/外链 target/
 *   代码高亮/未知语言/mermaid 围栏/任务列表/emoji/脚注/数学/front matter 偏移
 * - renderMarkdownOnce:一次 parse 同时产出 html 与 headings
 * - extractHeadingsWith:常规提取、front matter 偏移、>200k 大文件 fallback 与 500 行限制
 */
import { describe, it, expect } from "vitest";
import {
  createMarkdownIt,
  splitFrontMatter,
  renderFrontMatter,
  renderMarkdownRaw,
  renderMarkdownOnce,
  extractHeadingsWith,
} from "./markdownEngine";

function md() {
  return createMarkdownIt();
}

describe("splitFrontMatter", () => {
  it("无 front matter 返回 null", () => {
    expect(splitFrontMatter("# Plain")).toBeNull();
  });

  it("标准 front matter 解析出 raw/body/bodyStartLine", () => {
    const block = splitFrontMatter("---\ntitle: T\n---\n# Body");
    expect(block?.raw).toBe("---\ntitle: T\n---");
    expect(block?.body).toBe("# Body");
    expect(block?.bodyStartLine).toBe(4);
  });

  it("缺失结束符返回 null", () => {
    expect(splitFrontMatter("---\ntitle: T")).toBeNull();
  });

  it("不足三行返回 null", () => {
    expect(splitFrontMatter("---")).toBeNull();
  });

  it("空 front matter（第二行即结束）", () => {
    const block = splitFrontMatter("---\n---\nbody");
    expect(block?.raw).toBe("---\n---");
    expect(block?.body).toBe("body");
    expect(block?.bodyStartLine).toBe(3);
  });

  it("CRLF 换行", () => {
    const block = splitFrontMatter("---\r\ntitle: T\r\n---\r\nbody");
    expect(block?.body).toBe("body");
    expect(block?.bodyStartLine).toBe(4);
  });
});

describe("renderFrontMatter", () => {
  it("data 对象 → 键值表格", () => {
    const html = renderFrontMatter({
      raw: "---",
      body: "",
      bodyStartLine: 1,
      data: { title: "T", tags: ["a", "b"] },
    });
    expect(html).toContain('<section class="front-matter" data-source-line="1">');
    expect(html).toContain("<th>title</th>");
    expect(html).toContain("<td>T</td>");
    expect(html).toContain("tags");
  });

  it("data 非对象 → Value 行", () => {
    const html = renderFrontMatter({
      raw: "---",
      body: "",
      bodyStartLine: 1,
      data: "hello" as unknown as Record<string, unknown>,
    });
    expect(html).toContain("<th>Value</th>");
    expect(html).toContain("<td>hello</td>");
  });

  it("data 缺失 → Raw 行并转义内容", () => {
    const html = renderFrontMatter({ raw: "a < b", body: "", bodyStartLine: 1 });
    expect(html).toContain("<th>Raw</th>");
    expect(html).toContain("a &lt; b");
  });

  it("data 键值中的 HTML 字符被转义", () => {
    const html = renderFrontMatter({
      raw: "---",
      body: "",
      bodyStartLine: 1,
      data: { "<k>": 1 },
    });
    expect(html).toContain("<th>&lt;k&gt;</th>");
  });

  it("data 值为 null → 空单元格", () => {
    const html = renderFrontMatter({ raw: "---", body: "", bodyStartLine: 1, data: { key: null } });
    expect(html).toContain("<td></td>");
  });
});

describe("createMarkdownIt + renderMarkdownRaw", () => {
  it("标题生成锚点 id 与 data-source-line", () => {
    const html = renderMarkdownRaw(md(), "# Hello World\n\n## Sub");
    expect(html).toContain('<h1 id="hello-world"');
    expect(html).toContain('data-source-line="1"');
    expect(html).toContain('<h2 id="sub"');
    expect(html).toContain('data-source-line="3"');
  });

  it("外链自动加 target=_blank 与 rel", () => {
    const html = renderMarkdownRaw(md(), "[官网](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("内部链接不加 target", () => {
    const html = renderMarkdownRaw(md(), "[内部](../other.md)");
    expect(html).toContain('href="../other.md"');
    expect(html).not.toContain('target="_blank"');
  });

  it("已知语言代码块走 hljs 高亮", () => {
    const html = renderMarkdownRaw(md(), "```js\nconst a = 1;\n```");
    expect(html).toContain('<pre class="hljs">');
    // hljs 将关键字/数字包装为语义 span
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">1</span>');
  });

  it("未知语言代码块转义原样输出", () => {
    const html = renderMarkdownRaw(md(), "```unknownlang\n<b>raw</b>\n```");
    expect(html).toContain('<pre class="hljs">');
    expect(html).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });

  it("mermaid 围栏输出 mermaid-block", () => {
    const html = renderMarkdownRaw(md(), "```mermaid\ngraph TD;\n```");
    expect(html).toContain('<div class="mermaid-block">');
    expect(html).toContain("graph TD;");
  });

  it("任务列表输出 checkbox", () => {
    const html = renderMarkdownRaw(md(), "- [x] 完成\n- [ ] 待办");
    // 类名含额外修饰(enabled),仅断言前缀
    expect(html).toContain('class="task-list-item');
    expect(html).toContain('class="task-list-item-checkbox"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("emoji 短码被转换", () => {
    expect(renderMarkdownRaw(md(), ":smile:")).toContain("😄");
  });

  it("脚注输出 footnote 结构", () => {
    const html = renderMarkdownRaw(md(), "脚注[^1]\n\n[^1]: 注释内容");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('class="footnotes"');
  });

  it("行内与块级数学输出占位节点", () => {
    const html = renderMarkdownRaw(md(), "行内 $x^2$ 与块级：\n\n$$\na+b\n$$");
    expect(html).toContain('<span class="math-inline" data-math="x^2"></span>');
    expect(html).toContain('<div class="math-block"');
    expect(html).toContain("a+b");
  });

  it("front matter 渲染为表格且正文偏移正确", () => {
    const src = "---\ntitle: T\n---\n# Hello";
    const html = renderMarkdownRaw(md(), src);
    expect(html).toContain('class="front-matter"');
    expect(html).toContain("<th>Raw</th>");
    // 正文第 4 行 → data-source-line=4
    expect(html).toContain('data-source-line="4"');
  });
});

describe("renderMarkdownOnce", () => {
  it("一次 parse 同时产出 html 与 headings", () => {
    const inst = md();
    const { html, headings } = renderMarkdownOnce(inst, "# A\n\n## B\n\n正文");
    expect(html).toContain('<h1 id="a"');
    expect(headings).toEqual([
      { level: 1, text: "A", id: "a" },
      { level: 2, text: "B", id: "b" },
    ]);
  });

  it("front matter 被剥离后渲染正文", () => {
    const inst = md();
    const { html, headings } = renderMarkdownOnce(inst, "---\nt: 1\n---\n# H");
    expect(html).toContain('class="front-matter"');
    expect(headings).toEqual([{ level: 1, text: "H", id: "h" }]);
  });

  it("headings 与 extractHeadingsWith 结果一致", () => {
    const inst = md();
    const src = "# A\n\n## B\n\n### C";
    const { headings } = renderMarkdownOnce(inst, src);
    expect(headings).toEqual(extractHeadingsWith(inst, src));
  });
});

describe("extractHeadingsWith", () => {
  it("常规文档提取多级标题", () => {
    const hs = extractHeadingsWith(md(), "# A\n## B\n### C");
    expect(hs.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(hs[0]).toEqual({ level: 1, text: "A", id: "a" });
  });

  it("标题内联内容保留原文", () => {
    const hs = extractHeadingsWith(md(), "# **加粗** 标题");
    expect(hs[0].text).toBe("**加粗** 标题");
  });

  it("front matter 不影响标题提取", () => {
    const hs = extractHeadingsWith(md(), "---\nt: 1\n---\n# H");
    expect(hs).toEqual([{ level: 1, text: "H", id: "h" }]);
  });

  it(">200k 源走 fallback 提取", () => {
    const big = "# Top\n\n" + "x".repeat(200_001);
    const hs = extractHeadingsWith(md(), big);
    expect(hs).toEqual([{ level: 1, text: "Top", id: "top" }]);
  });

  it("fallback 仅扫描前 500 行", () => {
    const lines: string[] = ["# First"];
    for (let i = 0; i < 600; i++) lines.push(`line ${i}`);
    lines[600] = "# Late";
    const src = "y".repeat(200_000) + "\n" + lines.join("\n");
    const hs = extractHeadingsWith(md(), src);
    expect(hs.map((h) => h.text)).toEqual(["First"]);
  });
});
