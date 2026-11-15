import type { Heading } from "./useMarkdown";

/**
 * 行位置提供者：把「源码行号 ↔ 滚动位置」的换算与 CM6 解耦，
 * 由 MarkdownEditor 基于 EditorView 实现，便于 jsdom 单测用假实现驱动。
 */
export interface LinePositionSource {
  /** 1-based 源码行号 → 该行在文档内容中的绝对 top（像素）；越界返回 null */
  lineTop(line: number): number | null;
  /** 滚动 top（像素）→ 视口顶部所在的 1-based 行号 */
  lineAtTop(top: number): number;
}

const SCROLL_OFFSET = 16;
const SCROLL_TOLERANCE = 1;
/** 滚动停止后延迟重建位置缓存，吸收编辑 / 图片加载带来的布局变化 */
const LAYOUT_REBUILD_DELAY = 300;
/** jumpTo 在视图尚未就绪时的最大重试帧数（约 0.5s @60fps） */
const JUMP_MAX_RETRIES = 30;

/**
 * 章节标记：追踪当前阅读到的标题，并提供平滑跳转。
 *
 * 阶段二：单一 CM6 视图下不再有 markdown-it 渲染 DOM 的 `[id]` 标题元素，
 * 改为基于 Heading.line（1-based 源码行号）+ LinePositionSource（由 MarkdownEditor
 * 用 CM6 的 lineBlockAt / lineBlockAtHeight 实现）换算滚动位置——不依赖 DOM 查询
 * 或 getBoundingClientRect，与 CM6 位置体系一致，且便于用假位置源单测。
 *
 * - 标题滚动位置按行块缓存，滚动期间复用，避免每帧触发布局计算；
 * - 视图 / 标题变化或滚动停止后重建缓存；
 * - jumpTo 在视图尚未就绪时逐帧重试，保证「打开文档→立即跳锚点」也能生效。
 *
 * 迁移说明（Svelte 5）：参数用 { value } box；$effect.root 管理订阅，dispose() 显式清理。
 */
export function useSectionMarkers(
  headings: { value: Heading[] },
  viewerEl: { value: HTMLElement | null },
  positionSource: { value: LinePositionSource | null },
) {
  const activeId = $state<{ value: string }>({ value: "" });

  /** 标题 id → 滚动位置（缓存）；scrollMapDirty 时在下次读取前重建 */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 过程内滚动位置缓存（dirty 标记驱动重建），无响应式依赖
  const scrollMap = new Map<string, number>();
  let scrollMapDirty = true;
  /** 跳转序列号：防竞态，只有最新的 jumpTo 调用才会执行滚动 */
  let scrollSeq = 0;

  let rafId: number | null = null;
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildScrollMap(): void {
    scrollMap.clear();
    const source = positionSource.value;
    if (!source) return;
    for (const h of headings.value) {
      const top = source.lineTop(h.line);
      if (top === null) continue;
      scrollMap.set(h.id, Math.max(0, top - SCROLL_OFFSET));
    }
    scrollMapDirty = false;
  }

  /** 当前视口顶部对应的源码行号；位置源未就绪时返回 1（文档起始） */
  function currentTopLine(): number {
    const source = positionSource.value;
    const container = viewerEl.value;
    if (!source || !container) return 1;
    return source.lineAtTop(Math.max(0, container.scrollTop));
  }

  function updateActiveId(): void {
    if (scrollMapDirty) rebuildScrollMap();
    const line = currentTopLine();
    let current: Heading | null = null;
    for (const h of headings.value) {
      // 行号不超过视口顶部行的最后一个标题即为当前章节
      if (h.line <= line + SCROLL_TOLERANCE) current = h;
    }
    // 视图未就绪（缓存为空）时默认第一个标题，避免错误指向最后一个
    if (!current && headings.value.length > 0) current = headings.value[0];
    activeId.value = current?.id ?? "";
  }

  function onScroll(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateActiveId();
      // 滚动停止后重建一次：编辑 / 图片异步加载会改变行块位置
      if (layoutTimer !== null) clearTimeout(layoutTimer);
      layoutTimer = setTimeout(() => {
        layoutTimer = null;
        rebuildScrollMap();
      }, LAYOUT_REBUILD_DELAY);
    });
  }

  function jumpTo(id: string): void {
    const jumpSeq = ++scrollSeq;
    if (scrollMapDirty) rebuildScrollMap();
    let top = scrollMap.get(id);
    if (top === undefined) {
      rebuildScrollMap();
      top = scrollMap.get(id);
    }
    const container = viewerEl.value;
    if (top === undefined || !container) {
      // 视图 / 标题尚未就绪，逐帧重试直到缓存建立；已有更新请求则放弃本次
      let retries = 0;
      function retry(): void {
        if (retries >= JUMP_MAX_RETRIES) return;
        retries++;
        if (jumpSeq !== scrollSeq) return;
        if (scrollMapDirty) rebuildScrollMap();
        const t = scrollMap.get(id);
        const c = viewerEl.value;
        if (t === undefined || !c || !positionSource.value) return;
        activeId.value = id;
        c.scrollTo({ top: t, behavior: "smooth" });
      }
      requestAnimationFrame(retry);
      return;
    }
    activeId.value = id;
    container.scrollTo({ top, behavior: "smooth" });
  }

  let scrollTarget: HTMLElement | null = null;

  /** 视图容器变化时重挂 scroll 监听、重建缓存并刷新 activeId */
  function handleViewerChange(
    next: [HTMLElement | null, LinePositionSource | null],
    prev: [HTMLElement | null, LinePositionSource | null] | null,
  ): void {
    const [el] = next;
    const [prevEl] = prev ?? [null];
    if (prevEl && prevEl !== el) prevEl.removeEventListener("scroll", onScroll);
    if (el && el !== scrollTarget) {
      el.addEventListener("scroll", onScroll, { passive: true });
      scrollTarget = el;
    }
    scrollMapDirty = true;
    updateActiveId();
  }

  const baselineEls: [HTMLElement | null, LinePositionSource | null] = [
    viewerEl.value,
    positionSource.value,
  ];
  handleViewerChange(baselineEls, null);
  let lastEls = baselineEls;

  const disposeEffects = $effect.root(() => {
    $effect(() => {
      const next: [HTMLElement | null, LinePositionSource | null] = [
        viewerEl.value,
        positionSource.value,
      ];
      if (next[0] !== lastEls[0] || next[1] !== lastEls[1]) {
        handleViewerChange(next, lastEls);
        lastEls = next;
      }
    });

    // 标题列表变化 → 缓存失效并重算 activeId（首跑跳过，由基线初始化承担）
    let firstHeadings = true;
    $effect(() => {
      void headings.value;
      void headings.value.length;
      if (firstHeadings) {
        firstHeadings = false;
        return;
      }
      scrollMapDirty = true;
      updateActiveId();
    });

    // 位置源就绪（编辑器异步加载完成）→ 缓存失效并重算
    let firstSource = true;
    $effect(() => {
      void positionSource.value;
      if (firstSource) {
        firstSource = false;
        return;
      }
      scrollMapDirty = true;
      updateActiveId();
    });
  });

  function dispose(): void {
    if (scrollTarget) scrollTarget.removeEventListener("scroll", onScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    disposeEffects();
  }

  return {
    activeId,
    jumpTo,
    dispose,
  };
}
