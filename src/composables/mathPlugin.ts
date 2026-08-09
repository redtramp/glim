import type MarkdownIt from "markdown-it";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function mathPlugin(mdInstance: MarkdownIt): void {
  mdInstance.inline.ruler.after("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x24) return false;
    if (state.src.charCodeAt(start + 1) === 0x24) return false;
    // 前一个字符同为 $（如 $$x$$ 中的第二个 $）时拒绝：
    // 首字符因后继是 $ 已被拒绝,若这里放行会产生游离的 $ 配对（$ + math(x) + $）。
    // 仅当前驱 $ 本身不是 \$ 转义对的一部分时才拒绝（escape 规则会整体消费 \$,
    // 因此 \$$x$ 中第二个 $ 的前驱是转义对的 $,不应误拒其后合法的 $x$ 数学）。
    if (
      start > 0 &&
      state.src.charCodeAt(start - 1) === 0x24 &&
      state.src.charCodeAt(start - 2) !== 0x5c
    ) {
      return false;
    }
    const max = state.posMax;
    let pos = start + 1;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 0x5c) {
        pos += 2;
        continue;
      }
      if (ch === 0x24) break;
      pos++;
    }
    if (pos >= max) return false;
    const content = state.src.slice(start + 1, pos);
    if (!content || /^\s+$/.test(content)) return false;
    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.markup = "$";
      token.content = content;
    }
    state.pos = pos + 1;
    return true;
  });

  mdInstance.block.ruler.after(
    "blockquote",
    "math_block",
    (state, startLine, endLine, silent) => {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const maxPos = state.eMarks[startLine];
      if (startPos + 2 > maxPos) return false;
      if (state.src.slice(startPos, startPos + 2) !== "$$") return false;
      let nextLine = startLine;
      let found = false;
      let content = "";
      const firstLineRest = state.src.slice(startPos + 2, maxPos).trim();
      if (firstLineRest.endsWith("$$") && firstLineRest.length >= 2) {
        content = firstLineRest.slice(0, -2);
        found = true;
      } else {
        if (firstLineRest) content = firstLineRest + "\n";
        for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineEnd = state.eMarks[nextLine];
          const line = state.src.slice(lineStart, lineEnd);
          if (line.trimEnd().endsWith("$$")) {
            content += line.replace(/\$\$\s*$/, "");
            found = true;
            break;
          }
          content += line + "\n";
        }
      }
      if (!found) return false;
      if (silent) return true;
      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.markup = "$$";
      token.content = content;
      token.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    },
    { alt: [] }
  );

  mdInstance.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math-inline" data-math="${escapeAttr(
      tokens[idx].content
    )}"></span>`;
  mdInstance.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block" data-math="${escapeAttr(
      tokens[idx].content
    )}"></div>`;
}
