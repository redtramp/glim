import { ref, computed, Ref } from "vue";

const HL = "find-highlight";
const HL_ACTIVE = "find-highlight-active";
/** 单次查找最大高亮数：避免常见词在大文档中产生海量 span 导致 DOM 爆炸/卡死 */
const MAX_MATCHES = 1000;

export function useFindInPage(bodyRef: Ref<HTMLElement | null>) {
  const visible = ref(false);
  const query = ref("");
  const caseSensitive = ref(false);
  const matches = ref<HTMLElement[]>([]);
  const activeIndex = ref(0);
  const total = computed(() => matches.value.length);

  function clearHighlights() {
    const body = bodyRef.value;
    if (!body) return;
    body.querySelectorAll("." + HL).forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    body.normalize();
    matches.value = [];
    activeIndex.value = 0;
  }

  function collectTextNodes(): Text[] {
    const body = bodyRef.value;
    if (!body) return [];
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = (node as Text).parentElement;
        if (
          parent &&
          parent.closest("script, style, .math-inline, .math-block, .mermaid-block, ." + HL)
        )
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    return nodes;
  }

  function wrapRange(node: Text, start: number, end: number): HTMLElement {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const span = document.createElement("span");
    span.className = HL;
    range.surroundContents(span);
    return span;
  }

  function search(autoScroll = true) {
    clearHighlights();
    const q = query.value;
    if (!q) return;
    const cs = caseSensitive.value;
    const nodes = collectTextNodes();
    const found: HTMLElement[] = [];
    for (const node of nodes) {
      if (found.length >= MAX_MATCHES) break;
      const text = node.nodeValue || "";
      const hay = cs ? text : text.toLowerCase();
      const needle = cs ? q : q.toLowerCase();
      const positions: number[] = [];
      let from = 0;
      while (from <= hay.length - needle.length) {
        const idx = hay.indexOf(needle, from);
        if (idx === -1) break;
        positions.push(idx);
        from = idx + Math.max(needle.length, 1);
      }
      if (positions.length === 0) continue;
      positions.sort((a, b) => b - a);
      for (const pos of positions) {
        if (found.length >= MAX_MATCHES) break;
        try {
          const span = wrapRange(node, pos, pos + needle.length);
          found.push(span);
        } catch {
          /* skip */
        }
      }
    }
    found.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    matches.value = found;
    if (found.length > 0) {
      activeIndex.value = 0;
      if (autoScroll) highlightActive();
    }
  }

  function highlightActive() {
    matches.value.forEach((el, i) => {
      el.classList.toggle(HL_ACTIVE, i === activeIndex.value);
    });
    const active = matches.value[activeIndex.value];
    if (active)
      active.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function next() {
    if (!total.value) return;
    activeIndex.value = (activeIndex.value + 1) % total.value;
    highlightActive();
  }

  function prev() {
    if (!total.value) return;
    activeIndex.value = (activeIndex.value - 1 + total.value) % total.value;
    highlightActive();
  }

  function highlightSearch(text: string) {
    if (!text.trim()) return;
    // 恢复查询但不显示 FindBar（已移除）
    query.value = text;
    clearHighlights();
    // autoScroll=false：由调用方（onRendered/scrollToLine）决定滚动行为
    search(false);
  }

  /** 按源行号滚动到对应匹配项（用于全局搜索面板跳转到当前文档） */
  function scrollToLine(line: number): void {
    if (line <= 0) return;
    // autoScroll=false：避免先滚到第一个匹配项再滚到目标行的视觉跳动
    search(false);
    if (!matches.value.length) return;
    // span 本身不含 data-source-line，需向上查找最近的块级祖先
    const idx = matches.value.findIndex((el) => {
      const srcLine = el.closest<HTMLElement>("[data-source-line]")?.getAttribute("data-source-line");
      return srcLine ? Number(srcLine) === line : false;
    });
    if (idx === -1) {
      // 找不到行号匹配的项时退而求其次：高亮第一个匹配项（不滚动，已在视口内）
      activeIndex.value = 0;
      matches.value.forEach((el, i) => {
        el.classList.toggle(HL_ACTIVE, i === 0);
      });
      return;
    }
    activeIndex.value = idx;
    matches.value.forEach((el, i) => {
      el.classList.toggle(HL_ACTIVE, i === idx);
    });
    matches.value[idx].scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function open() {
    visible.value = true;
  }

  function close() {
    visible.value = false;
    clearHighlights();
  }

  function reset() {
    query.value = "";
    clearHighlights();
  }

  return {
    visible,
    query,
    caseSensitive,
    matches,
    activeIndex,
    total,
    open,
    close,
    search,
    next,
    prev,
    reset,
    clearHighlights,
    highlightSearch,
    scrollToLine,
  };
}
