/**
 * CriticMarkup 纯 TS 模块（主线程与 Worker 共用）。
 *
 * 职责:
 * - 语法常量:删除 {--x--} / 新增 {++x++} / 替换 {~~a~>b~~} / 高亮 {==x==} / 评论 {>>c<<}
 * - createCriticMarkupPlugin():markdown-it 插件,与 markdownEngine 的其余插件一起
 *   在主线程与 Worker 中共用,保证两处渲染完全一致。
 * - stripCriticMarkup():移除全部批注语法(「清除全部批注」用)。
 *   语义:删除/评论取空,新增/高亮取内容,替换取新值。
 *
 * 解析策略（与 criticmarkup.com 标准及设计文档一致）:
 * - 栈式匹配:同类型标记可嵌套({=={--x--}==}),找闭合符时按同类型开标记计数;
 * - 段内跨行:inline 规则收到的是整段 src(含换行),闭合符扫描天然跨行;
 * - 代码块/行内代码天然隔离:markdown-it 的 fenced / backticks 规则先于本规则
 *   消费对应内容,插件层无需额外处理;
 * - 字面量:未匹配到完整标记模式时返回 false,由 markdown-it 原样输出;
 *   转义 \{ 由 markdown-it 内置 escape 规则先处理,同样天然安全。
 *
 * stripCriticMarkup 是文本级操作,不受 markdown-it 保护,因此自行跳过
 * 围栏代码块与行内代码段——否则「清除全部批注」会破坏文档中用于讲解
 * CriticMarkup 语法本身的示例（设计文档明确建议用代码块包裹字面语法）。
 */
import type MarkdownIt from "markdown-it";
import type { Options } from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

export type CriticType = "del" | "ins" | "sub" | "hl" | "comment";

interface CriticDef {
  type: CriticType;
  open: string;
  close: string;
}

/** 五种批注语法标记定义（open 第二个字符互不相同,单一位置最多匹配一种） */
export const CRITIC_DEFS: readonly CriticDef[] = [
  { type: "del", open: "{--", close: "--}" },
  { type: "ins", open: "{++", close: "++}" },
  { type: "sub", open: "{~~", close: "~~}" },
  { type: "hl", open: "{==", close: "==}" },
  { type: "comment", open: "{>>", close: "<<}" },
];

/** 替换标记的旧/新值分隔符 */
const SUB_SEPARATOR = "~>";

function findDef(src: string, pos: number): CriticDef | null {
  for (const def of CRITIC_DEFS) {
    if (src.startsWith(def.open, pos)) return def;
  }
  return null;
}

/**
 * 栈式查找与 def.open 同类型的闭合标记位置。
 * 返回闭合标记起始下标;未找到返回 -1。
 * 只对同类型开标记计数,避免内层其它类型标记干扰外层闭合定位
 * （如 {==a {--x--} b==} 中内层 {--x--} 不影响 ==} 的配对）。
 */
function findCloser(src: string, start: number, def: CriticDef): number {
  const openLen = def.open.length;
  const closeLen = def.close.length;
  let depth = 1;
  let i = start;
  const max = src.length;
  while (i < max) {
    if (src.startsWith(def.open, i)) {
      depth++;
      i += openLen;
    } else if (src.startsWith(def.close, i)) {
      depth--;
      if (depth === 0) return i;
      i += closeLen;
    } else {
      i++;
    }
  }
  return -1;
}

/**
 * 一次完整批注标记的扫描结果（文本级扫描核心，供 parseCriticMarkup / stripInCode 共用）。
 * 坐标均为相对传入文本的绝对下标。
 */
interface MarkupScan {
  def: CriticDef;
  contentStart: number; // open 标记之后
  contentEnd: number;   // 闭合标记起始
  closeEnd: number;     // 闭合标记之后
  content: string;      // 内容（含嵌套语法原样）
  sepRel: number;       // 仅 sub：SUB_SEPARATOR 相对 contentStart 的位置；非 sub 为 -1
}

/** 在 sub 内容中查找「顶层」分隔符 ~>（跳过完整嵌套标记，含其内部的 ~>），返回相对内容下标，无则 -1 */
function findTopLevelSubSeparator(content: string): number {
  let i = 0;
  while (i < content.length) {
    if (content.startsWith(SUB_SEPARATOR, i)) return i;
    const def = findDef(content, i);
    if (!def) {
      i++;
      continue;
    }
    const closeAt = findCloser(content, i + def.open.length, def);
    if (closeAt === -1) {
      i++;
      continue;
    }
    i = closeAt + def.close.length;
  }
  return -1;
}

/**
 * 在普通文本中迭代扫描「合法」批注标记（文本级语义，与插件级 findDef/findCloser 同源）:
 * - 未闭合 / 转义 \{ / 缺顶层分隔符的 sub → 按字面量整体跳过(推进到闭合符之后,
 *   与渲染插件一致,避免逐字符扫描误入内部并剥离嵌套标记,如 {~~{--x--}~~} 应整体保留);
 * - 命中合法标记 → yield 并推进到闭合之后。
 * 不深入内容(嵌套批注由调用方决定如何处理:parse 只列顶层,strip 递归剥离)。
 */
function* scanAnnotationsInText(text: string): Generator<MarkupScan> {
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "{") {
      i += 2;
      continue;
    }
    const def = findDef(text, i);
    if (!def) {
      i++;
      continue;
    }
    const contentStart = i + def.open.length;
    const closeAt = findCloser(text, contentStart, def);
    if (closeAt === -1) {
      i++;
      continue;
    }
    const content = text.slice(contentStart, closeAt);
    let sepRel = -1;
    if (def.type === "sub") {
      const idx = findTopLevelSubSeparator(content);
      if (idx === -1) {
        // 缺顶层分隔符:整体按字面量跳过(与渲染插件行为一致)
        i = closeAt + def.close.length;
        continue;
      }
      sepRel = idx;
    }
    yield {
      def,
      contentStart,
      contentEnd: closeAt,
      closeEnd: closeAt + def.close.length,
      content,
      sepRel,
    };
    i = closeAt + def.close.length;
  }
}

/**
 * 将内容递归交给 inline 解析器,并把产出的子 token 追加到外层 token 流。
 * 嵌套的 CriticMarkup / 加粗 / 链接 / 行内代码等都在这里被二次解析。
 * 注意不能用 md.parseInline():它在 inlineMode 下只产出一个未展开的
 * inline 容器 token;必须走 md.inline.parse 才能得到展开后的子 token。
 */
function pushParsedContent(state: StateInline, content: string): void {
  if (!content) return;
  state.md.inline.parse(content, state.md, state.env, state.tokens);
}

/**
 * markdown-it 插件:解析 CriticMarkup 批注语法并注册渲染规则。
 * 注册在 inline.ruler 的 emphasis 之后,保证优先于 link/image 等规则,
 * 同时让加粗等内联语法在批注内容中照常工作。
 */
export function createCriticMarkupPlugin(): (md: MarkdownIt) => void {
  return (mdInstance: MarkdownIt): void => {
    mdInstance.inline.ruler.after("emphasis", "critic_markup", (state, silent) => {
      const src = state.src;
      const start = state.pos;
      const def = findDef(src, start);
      if (!def) return false;

      const contentStart = start + def.open.length;
      const closeAt = findCloser(src, contentStart, def);
      if (closeAt === -1) return false; // 无闭合 → 字面量
      const content = src.slice(contentStart, closeAt);

      // 替换标记需要「顶层」分隔符(与 parse/strip 同源语义,避免嵌套标记内的
      // ~> 干扰分隔符定位,如 {~~{--a~>b--}~>c~~} 应拆为 old={--a~>b--} new=c);
      // 完整闭合但缺顶层分隔符:不是合法替换 → 整体按字面量消费,
      // 否则内部的 ~~ 会被 markdown-it 删除线规则二次解析
      let sepRel = -1;
      if (def.type === "sub") {
        sepRel = findTopLevelSubSeparator(content);
        if (sepRel === -1) {
          if (silent) return true;
          const literal = state.push("text", "", 0);
          literal.content = src.slice(start, closeAt + def.close.length);
          state.pos = closeAt + def.close.length;
          return true;
        }
      }
      if (silent) return true;

      const closeEnd = closeAt + def.close.length;

      if (def.type === "comment") {
        const open = state.push("critic_comment_open", "span", 1);
        open.attrSet("class", "critic-comment");
        open.attrSet("title", content);
        state.push("critic_comment_close", "span", -1);
      } else if (def.type === "sub") {
        const delOpen = state.push("critic_del_open", "del", 1);
        delOpen.attrSet("class", "critic-del");
        pushParsedContent(state, content.slice(0, sepRel));
        state.push("critic_del_close", "del", -1);
        const insOpen = state.push("critic_ins_open", "ins", 1);
        insOpen.attrSet("class", "critic-ins");
        pushParsedContent(state, content.slice(sepRel + SUB_SEPARATOR.length));
        state.push("critic_ins_close", "ins", -1);
      } else {
        const tag = def.type === "hl" ? "mark" : def.type === "ins" ? "ins" : "del";
        const cls = `critic-${def.type === "hl" ? "hl" : def.type === "ins" ? "ins" : "del"}`;
        const open = state.push(`critic_${def.type}_open`, tag, 1);
        open.attrSet("class", cls);
        pushParsedContent(state, content);
        state.push(`critic_${def.type}_close`, tag, -1);
      }

      state.pos = closeEnd;
      return true;
    });

    const renderToken = (
      tokens: Token[],
      idx: number,
      options: Options,
      _env: unknown,
      self: Renderer
    ): string => self.renderToken(tokens, idx, options);

    for (const type of ["del", "ins", "hl"] as const) {
      mdInstance.renderer.rules[`critic_${type}_open`] = renderToken;
      mdInstance.renderer.rules[`critic_${type}_close`] = renderToken;
    }
    mdInstance.renderer.rules.critic_comment_open = renderToken;
    mdInstance.renderer.rules.critic_comment_close = renderToken;
  };
}

/** 文本片段:isCode 为 true 时跳过批注剥离（围栏代码块 / 行内代码） */
interface TextSegment {
  text: string;
  isCode: boolean;
}

/** 行内代码:找 from 之后第一个等长反引号串（更长的反引号串不闭合） */
function findBacktickClose(text: string, from: number, runLen: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "`") continue;
    let j = i;
    while (text[j] === "`") j++;
    if (j - i === runLen) return i;
  }
  return -1;
}

/** 围栏代码块:返回代码块（含闭合行）结束下标;未闭合则到文本末尾 */
function findFenceEnd(text: string, start: number): number {
  const fenceChar = text[start];
  let len = 0;
  while (text[start + len] === fenceChar) len++;
  let nl = text.indexOf("\n", start);
  while (nl !== -1) {
    const lineStart = nl + 1;
    const lineEnd = text.indexOf("\n", lineStart);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const m = line.match(/^[ \t]*([`~]+)[ \t]*$/);
    if (m && m[1][0] === fenceChar && m[1].length >= len) {
      return lineEnd === -1 ? text.length : lineEnd + 1;
    }
    nl = lineEnd;
  }
  return text.length;
}

/** 扫描文本,把围栏代码块与行内代码段与普通文本分开,普通文本参与剥离 */
function splitCodeSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      segments.push({ text: buf, isCode: false });
      buf = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const atLineStart = i === 0 || text[i - 1] === "\n";
    if (atLineStart && (text[i] === "`" || text[i] === "~")) {
      const rest = text.slice(i);
      const m = rest.match(/^(`{3,}|~{3,})/);
      if (m && m[1].length >= 3) {
        flush();
        const end = findFenceEnd(text, i);
        segments.push({ text: text.slice(i, end), isCode: true });
        i = end;
        continue;
      }
    }
    if (text[i] === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const closeAt = findBacktickClose(text, i + run, run);
      if (closeAt !== -1) {
        flush();
        segments.push({ text: text.slice(i, closeAt + run), isCode: true });
        i = closeAt + run;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return segments;
}

/**
 * 剥离一段普通文本中的全部批注语法（递归,内层先剥离）。
 * - 删除 {--x--} / 评论 {>>c<<} → 取空
 * - 新增 {++x++} / 高亮 {==x==} → 取内容
 * - 替换 {~~a~>b~~} → 取新值 b
 * - \{ 转义或缺少闭合/顶层分隔符的标记 → 原样保留
 * 复用 scanAnnotationsInText 作为唯一文本级扫描源，与 parseCriticMarkup 保证同源语义。
 */
function stripInCode(text: string): string {
  let result = "";
  let cursor = 0;
  for (const m of scanAnnotationsInText(text)) {
    // 标记前的字面量（含 \{ 转义等，扫描核心已跳过不 yield）原样保留
    result += text.slice(cursor, m.contentStart - m.def.open.length);
    if (m.def.type === "sub") {
      // 替换取新值：顶层分隔符之后的内容，递归剥离其中可能的嵌套标记
      result += stripInCode(m.content.slice(m.sepRel + SUB_SEPARATOR.length));
    } else if (m.def.type !== "del" && m.def.type !== "comment") {
      result += stripInCode(m.content);
    }
    cursor = m.closeEnd;
  }
  result += text.slice(cursor);
  return result;
}

/**
 * 移除文本中的全部 CriticMarkup 批注语法。
 * 围栏代码块与行内代码段被跳过,避免破坏文档中的语法示例。
 */
export function stripCriticMarkup(text: string): string {
  return splitCodeSegments(text)
    .map((seg) => (seg.isCode ? seg.text : stripInCode(seg.text)))
    .join("");
}

/**
 * 一条结构化批注（审阅面板数据源）。
 * - start/end 为源文本中的绝对偏移（半开区间 [start, end)，end 含闭合标记后一字符）
 * - oldText/newText 为展示用旧/新内容（不含嵌套语法剥离）
 * - line 为 1-based 起始行号
 */
export interface CriticMarkupAnnotation {
  id: number;
  type: CriticType;
  start: number;
  end: number;
  oldText: string;
  newText: string;
  line: number;
}

/**
 * 解析文本中的「顶层」批注列表（审阅面板用）。
 * - 只列顶层：嵌套批注保留在外层 oldText/newText 原文中，由逐条操作后重解析逐层展开
 * - 围栏代码块 / 行内代码段被跳过（与 strip/渲染一致）
 * - 未闭合 / 缺顶层分隔符 / 转义的标记不列出（字面量语义）
 */
export function parseCriticMarkup(text: string): CriticMarkupAnnotation[] {
  const annotations: CriticMarkupAnnotation[] = [];
  // 行首偏移表：1-based 行号 = 第一个偏移 > start 的行首下标（无则末行）
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    return lo; // lineStarts 下标即 1-based 行号（0 占位）
  };

  let cursor = 0;
  for (const seg of splitCodeSegments(text)) {
    if (!seg.isCode) {
      for (const m of scanAnnotationsInText(seg.text)) {
        const start = cursor + m.contentStart - m.def.open.length;
        const end = cursor + m.closeEnd;
        const inner = m.content;
        let oldText = "";
        let newText = "";
        if (m.def.type === "sub") {
          oldText = inner.slice(0, m.sepRel);
          newText = inner.slice(m.sepRel + SUB_SEPARATOR.length);
        } else if (m.def.type === "del" || m.def.type === "hl") {
          oldText = inner;
        } else {
          // ins / comment
          newText = inner;
        }
        annotations.push({
          id: annotations.length,
          type: m.def.type,
          start,
          end,
          oldText,
          newText,
          line: lineOf(start),
        });
      }
    }
    cursor += seg.text.length;
  }
  return annotations;
}

/**
 * 对单条批注应用决策（accept=采纳修改 / reject=拒绝修改），返回新文本。
 * 语义表:
 *   del {--x--}:    accept→""      reject→x
 *   ins {++x++}:    accept→x       reject→""
 *   sub {~~a~>b~~}: accept→b       reject→a
 *   hl {==x==}:     accept→x       reject→x
 *   comment {>>c<<}:accept→""      reject→""
 * 注意:ann 必须来自对同一 text 的 parseCriticMarkup（或由它派生的同源快照），
 * 否则偏移失效。逐条操作后应重新 parse 再取下一条。
 */
export function applyDecision(
  text: string,
  ann: CriticMarkupAnnotation,
  decision: "accept" | "reject"
): string {
  let keep: string;
  switch (ann.type) {
    case "del":
      keep = decision === "accept" ? "" : ann.oldText;
      break;
    case "ins":
      keep = decision === "accept" ? ann.newText : "";
      break;
    case "sub":
      keep = decision === "accept" ? ann.newText : ann.oldText;
      break;
    case "hl":
      keep = ann.oldText; // 接受/拒绝均保留内容（仅去标记）
      break;
    case "comment":
      keep = "";
      break;
  }
  return text.slice(0, ann.start) + keep + text.slice(ann.end);
}

/**
 * 全部接受/拒绝：逐层剥离全部批注（acceptAll 结果与 stripCriticMarkup 接受语义一致）。
 * 实现:反复解析顶层批注并逆序应用决策（先应用靠后的位置，避免偏移失效），
 * 直到无批注；嵌套批注在后续轮次逐层露出。防御上限 MAX_ITERATIONS 防病态输入死循环。
 */
function applyAllDecision(text: string, decision: "accept" | "reject"): string {
  const MAX_ITERATIONS = 1000;
  let current = text;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const annotations = parseCriticMarkup(current);
    if (annotations.length === 0) return current;
    for (let i = annotations.length - 1; i >= 0; i--) {
      current = applyDecision(current, annotations[i], decision);
    }
  }
  // 理论不可达（每轮至少剥离一层批注，嵌套深度有限）；防御性回退到已剥离结果
  return current;
}

export function acceptAllCriticMarkup(text: string): string {
  return applyAllDecision(text, "accept");
}

export function rejectAllCriticMarkup(text: string): string {
  return applyAllDecision(text, "reject");
}
