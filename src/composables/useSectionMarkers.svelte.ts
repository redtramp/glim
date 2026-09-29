import type { Heading } from "./useMarkdown";

const SCROLL_OFFSET = 16;
const SCROLL_TOLERANCE = 1;
/** 滚动停止后延迟重建位置缓存，吸收图片/mermaid 加载带来的布局变化 */
const LAYOUT_REBUILD_DELAY = 300;

/** CSS.escape 的降级实现：jsdom / 旧 WebView 未实现时直接返回 id */
function escapeCssId(id: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(id)
    : id;
}

/**
 * 章节标记：追踪当前阅读到的标题，并提供平滑跳转。
 *
 * - 标题的滚动位置会被缓存：滚动期间复用缓存，避免每帧触发布局读取；
 *   标题 / 视图容器变化或滚动停止后重建。
 * - 渲染时序安全：jumpTo 在目标位置尚未缓存时会先重建一次，
 *   保证「打开文档 → 立即跳转到锚点」在首次渲染后也能生效。
 *
 * 迁移说明（Svelte 5）：
 * - 参数由 vue Ref 改为 { value } box，内部 .value 访问形状不变；
 * - 旧 immediate watch → 同步初始化一次 + $effect（对基线变化才触发）；
 * - 旧非 immediate deep watch → $effect 首次运行跳过；
 * - 旧 tryOnUnmounted → 显式 dispose()。
 */
export function useSectionMarkers(
  headings: { value: Heading[] },
  viewerEl: { value: HTMLElement | null },
  bodyRef: { value: HTMLElement | null },
) {
  const activeId = $state<{ value: string }>({ value: "" });

  /** 标题 id → 滚动位置（缓存）；scrollMapDirty 时在下次读取前重建 */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 过程内滚动位置缓存（dirty 标记驱动重建），无响应式依赖
  const scrollMap = new Map<string, number>();
  let scrollMapDirty = true;
  /** 跳转序列号：用于防竞态，确保只有最新的 jumpTo 调用才能执行滚动 */
  let scrollSeq = 0;

  let rafId: number | null = null;
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildScrollMap(): void {
    scrollMap.clear();
    const body = bodyRef.value;
    if (!body) return;
    const container = viewerEl.value;
    for (const h of headings.value) {
      const el = body.querySelector(`#${escapeCssId(h.id)}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const top = container
        ? rect.top + container.scrollTop - container.getBoundingClientRect().top
        : rect.top + window.scrollY;
      scrollMap.set(h.id, Math.max(0, top - SCROLL_OFFSET));
    }
    scrollMapDirty = false;
  }

  function updateActiveId(): void {
    if (scrollMapDirty) rebuildScrollMap();
    const container = viewerEl.value;
    const scrollTop = container ? container.scrollTop : 0;
    let current: Heading | null = null;
    // 缓存为空（文档刚渲染、标题元素未就绪）时默认第一个标题：
    // 若用 ?? 0 遍历，空缓存会让所有标题都算作当前章节，错误指向最后一个标题
    if (scrollMap.size > 0) {
      // 最后一个顶部位置不超过视口顶部的标题即为当前章节
      for (const h of headings.value) {
        const st = scrollMap.get(h.id) ?? 0;
        if (st <= scrollTop + SCROLL_TOLERANCE) current = h;
      }
    }
    if (!current && headings.value.length > 0) current = headings.value[0];
    activeId.value = current?.id ?? "";
  }

  function onScroll(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateActiveId();
      // 滚动停止后重建一次位置缓存：图片/图表异步加载会改变标题位置
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
      // 首次渲染后缓存尚未建立（标题元素刚出现），重建一次再尝试
      rebuildScrollMap();
      top = scrollMap.get(id);
    }
    const container = viewerEl.value;
    if (top === undefined || !container) {
      // DOM 尚未就绪，反复重试直到文档渲染完成
      let retries = 0;
      const MAX_RETRIES = 30;
      function retry(): void {
        if (retries >= MAX_RETRIES) return;
        retries++;
        // 已有更新的跳转请求，放弃本次
        if (jumpSeq !== scrollSeq) return;
        if (scrollMapDirty) rebuildScrollMap();
        const t = scrollMap.get(id);
        const c = viewerEl.value;
        const body = bodyRef.value;
        // bodyRef 已变（切换了文档），放弃本次跳转
        if (t === undefined || !c || body === null) return;
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

  /** 旧 immediate watch 回调（prev 缺省视为 [null]） */
  function handleViewerChange(
    next: [HTMLElement | null, HTMLElement | null],
    prev: [HTMLElement | null, HTMLElement | null] | null,
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

  // 旧 immediate watch：同步初始化一次，随后 $effect 只在相对基线变化时触发
  const baselineEls: [HTMLElement | null, HTMLElement | null] = [
    viewerEl.value,
    bodyRef.value,
  ];
  handleViewerChange(baselineEls, null);
  let lastEls = baselineEls;

  const disposeEffects = $effect.root(() => {
    $effect(() => {
      const next: [HTMLElement | null, HTMLElement | null] = [
        viewerEl.value,
        bodyRef.value,
      ];
      if (next[0] !== lastEls[0] || next[1] !== lastEls[1]) {
        handleViewerChange(next, lastEls);
        lastEls = next;
      }
    });

    // 旧非 immediate deep watch：首次运行跳过
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
  });

  /** 旧 tryOnUnmounted：显式清理（事件 / rAF / 定时器 / effect root） */
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
