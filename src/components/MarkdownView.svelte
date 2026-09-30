<script lang="ts">
  /**
   * MarkdownView.vue → MarkdownView.svelte 迁移要点:
   * - defineProps/defineEmits → runes $props() + onRendered/onInternalLink 回调
   * - defineExpose({ root }) → export { rootEl as root }
   * - watch([source, currentFile, rootDir]) / watch(renderTick) → $effect（首跑跳过，
   *   等价 Vue watch 默认非 immediate；调用体经 untrack 排除自触发依赖）
   * - v-html → {@html}；scoped CSS → Tailwind 工具类（容器规则译为工具类，
   *   {@html} 注入的 mermaid SVG 由文件末尾 <style> + :global 承载，见规则 8 注释）
   * - 查看器内层元素原有各自 @click.stop/@dblclick.stop → 统一收口遮罩层
   *   closest 裁决（img 等挂交互事件会触发 Svelte a11y 编译告警，且 img 加
   *   role 会破坏 alt 语义），行为与逐层 stopPropagation 等价
   */
  import { onMount, onDestroy, untrack, tick } from "svelte";
  import { t } from "../i18n/locale.svelte.ts";
  import {
    renderMarkdown,
    renderMath,
    renderMermaid,
    disposeMermaidObserver,
  } from "../composables/useMarkdown";
  import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

  interface Props {
    source: string;
    currentFile: string;
    rootDir: string;
    renderTick?: number;
    /** 原 emit("rendered", el)：渲染管线完成后携带 root 元素 */
    onRendered?: (el: HTMLElement) => void;
    /** 原 emit("internal-link", path, hash)：正文内部链接改写回调 */
    onInternalLink?: (path: string, hash: string) => void;
  }

  let {
    source,
    currentFile,
    rootDir,
    renderTick,
    onRendered,
    onInternalLink,
  }: Props = $props();

  let html = $state("");
  let rootEl = $state<HTMLElement | null>(null);

  // 原 defineExpose({ root })
  export { rootEl as root };

  /** 渲染请求序号:仅最新一次 update 的结果被采用,避免快速切换时旧结果覆盖新内容 */
  let renderSeq = 0;

  async function update(): Promise<void> {
    // 文档切换/重渲染时清理预览与右键菜单
    closeContextMenu();
    closeViewer();
    const seq = ++renderSeq;
    let renderedHtml: string;
    try {
      renderedHtml = await renderMarkdown(source);
    } catch (e) {
      console.error("markdown render failed:", e);
      if (seq !== renderSeq) return;
      html = `<pre class="mermaid-error">Markdown 渲染失败: ${String(
        (e as Error)?.message ?? e
      )}</pre>`;
      return;
    }
    if (seq !== renderSeq) return;
    html = renderedHtml;
    await tick();
    if (seq !== renderSeq) return;
    if (rootEl) {
      rewriteImagesAndLinks(
        rootEl,
        { currentFile, rootDir },
        (path, hash) => onInternalLink?.(path, hash)
      );
      await renderMath(rootEl);
      await renderMermaid(rootEl);
      if (seq !== renderSeq) return;
      onRendered?.(rootEl);
    }
  }

  async function refreshThemeRender(): Promise<void> {
    if (!rootEl) return;
    await renderMermaid(rootEl, true);
    onRendered?.(rootEl);
  }

  onMount(() => {
    void update();
    document.addEventListener("fullscreenchange", onFullscreenChange);
  });

  // 原 watch(() => [source, currentFile, rootDir]) → 非 immediate：首跑由 onMount 承担
  let firstUpdateRun = true;
  $effect(() => {
    // 同步读取建立依赖；update 内部对状态的读取经 untrack 排除，避免自触发
    void source;
    void currentFile;
    void rootDir;
    if (firstUpdateRun) {
      firstUpdateRun = false;
      return;
    }
    untrack(() => {
      void update();
    });
  });

  // 原 watch(() => props.renderTick) → 非 immediate：挂载时不触发 mermaid 重渲染
  let firstTickRun = true;
  $effect(() => {
    void renderTick;
    if (firstTickRun) {
      firstTickRun = false;
      return;
    }
    untrack(() => {
      void refreshThemeRender();
    });
  });

  onDestroy(() => {
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    renderSeq++;
    closeContextMenu();
    closeViewer();
    if (wheelTimer !== null) {
      clearTimeout(wheelTimer);
      wheelTimer = null;
    }
    if (rootEl) {
      disposeMermaidObserver(rootEl);
      rootEl = null;
    }
  });

  /* ============ 统一查看器（图片 + Mermaid） ============ */

  interface ViewerState {
    visible: boolean;
    type: "image" | "mermaid";
    src: string;
    alt: string;
    svgContent: string;
    scale: number;
    translateX: number;
    translateY: number;
    isFullscreen: boolean;
  }

  let viewer = $state<ViewerState>({
    visible: false,
    type: "image",
    src: "",
    alt: "",
    svgContent: "",
    scale: 1,
    translateX: 0,
    translateY: 0,
    isFullscreen: false,
  });

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 10;
  const zoomStep = 1.25;
  const DRAG_THRESHOLD = 4;

  function clampScale(s: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function setZoomScale(next: number): void {
    viewer.scale = clampScale(next);
  }

  function resetZoom(): void {
    viewer.scale = 1;
    viewer.translateX = 0;
    viewer.translateY = 0;
  }

  function toggleZoom(): void {
    if (viewer.scale > 1) {
      resetZoom();
    } else {
      viewer.scale = 3;
    }
  }

  /* ============ 图片右键菜单 ============ */

  interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    src: string;
    alt: string;
  }

  let contextMenu = $state<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    src: "",
    alt: "",
  });

  function onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const img = target.closest<HTMLImageElement>("img[src]");
    if (!img || !rootEl?.contains(img)) return;
    e.preventDefault();
    e.stopPropagation();
    prevFocusEl = document.activeElement as HTMLElement | null;
    contextMenu = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      src: img.currentSrc || img.src,
      alt: img.alt || "",
    };
    void (async () => {
      await tick();
      clampMenuPosition();
      menuEl?.querySelector<HTMLElement>(".image-menu-item")?.focus();
    })();
  }

  function onMenuKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      closeContextMenu();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openImageViewer();
    }
  }

  function clampMenuPosition(): void {
    const el = menuEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = contextMenu;
    if (x + rect.width > window.innerWidth - 4) {
      x = Math.max(4, window.innerWidth - rect.width - 4);
    }
    if (y + rect.height > window.innerHeight - 4) {
      y = Math.max(4, window.innerHeight - rect.height - 4);
    }
    contextMenu.x = x;
    contextMenu.y = y;
  }

  function closeContextMenu(): void {
    contextMenu.visible = false;
  }

  /** 菜单/预览打开前的焦点元素，关闭时还原 */
  let prevFocusEl: HTMLElement | null = null;

  function openImageViewer(): void {
    const { src, alt } = contextMenu;
    closeContextMenu();
    if (!src) return;
    viewer = {
      visible: true,
      type: "image",
      src,
      alt,
      svgContent: "",
      scale: 1,
      translateX: 0,
      translateY: 0,
      isFullscreen: false,
    };
    void (async () => {
      await tick();
      viewerEl?.focus();
    })();
  }

  /* ============ Mermaid 图表点击 ============ */

  /** 为 mermaid SVG 注入暗色背景适配样式并修复清晰度 */
  function injectMermaidDarkSvg(svg: string): string {
    // 保留 width/height 属性（给浏览器提供初始渲染尺寸），
    // 仅清理内联 style 中的 height:100%/width:100%（它们会撑满容器）。
    let cleaned = svg;

    // 1. 清理内联 style 中的固定尺寸(mermaid 输出 style="... height:100%; width:100% ...")
    //    仅匹配独立的 height:/width:，不误删 max-width/min-width 等
    cleaned = cleaned.replace(
      /(<svg[^>]*style=")([^"]*)(")/,
      (_, pre, styles, post) => {
        const cleaned = styles
          .replace(/(?:^|;\s*)(?<!max-|min-)height:\s*100%\s*;?/g, ";")
          .replace(/(?:^|;\s*)(?<!max-|min-)width:\s*100%\s*;?/g, ";")
          .replace(/;{2,}/g, ";")
          .replace(/^;\s*/, "")
          .replace(/;\s*$/, "");
        return pre + cleaned + post;
      }
    );

    const darkStyle = `<style>
    .mermaid-zoom-svg { shape-rendering: geometricPrecision; text-rendering: optimizeLegibility; }
    .mermaid-zoom-svg text { fill: #e0e0e0 !important; }
    .mermaid-zoom-svg .edgeLabel { background: rgba(0,0,0,0.6) !important; color: #e0e0e0 !important; }
    .mermaid-zoom-svg .nodeLabel { color: #e0e0e0 !important; }
    .mermaid-zoom-svg .edgePath .path { stroke: #aaa !important; }
    .mermaid-zoom-svg .edgePath marker path { fill: #aaa !important; }
    .mermaid-zoom-svg line { stroke: #aaa !important; }
    .mermaid-zoom-svg rect { stroke-width: 2px !important; }
    .mermaid-zoom-svg .flowchart-link { stroke: #aaa !important; }
  </style>`;
    return cleaned.replace(/<svg([^>]*)>/, `<svg$1 class="mermaid-zoom-svg">` + darkStyle);
  }

  function onMermaidClick(e: MouseEvent): void {
    if (viewer.visible) return;
    const target = e.target as HTMLElement;
    const block = target.closest<HTMLElement>(".mermaid-rendered");
    if (!block || !rootEl?.contains(block)) return;
    e.preventDefault();
    e.stopPropagation();
    prevFocusEl = document.activeElement as HTMLElement | null;
    const svgContent = injectMermaidDarkSvg(block.innerHTML);
    viewer = {
      visible: true,
      type: "mermaid",
      src: "",
      alt: "",
      svgContent,
      scale: 1,
      translateX: 0,
      translateY: 0,
      isFullscreen: false,
    };
    void (async () => {
      await tick();
      viewerEl?.focus();
    })();
  }

  function onImageClick(e: MouseEvent): void {
    if (viewer.visible) return;
    const target = e.target as HTMLElement;
    const img = target.closest<HTMLImageElement>("img[src]");
    if (!img || !rootEl?.contains(img)) return;
    e.preventDefault();
    e.stopPropagation();
    prevFocusEl = document.activeElement as HTMLElement | null;
    viewer = {
      visible: true,
      type: "image",
      src: img.currentSrc || img.src,
      alt: img.alt || "",
      svgContent: "",
      scale: 1,
      translateX: 0,
      translateY: 0,
      isFullscreen: false,
    };
    void (async () => {
      await tick();
      viewerEl?.focus();
    })();
  }

  function onContentClick(e: MouseEvent): void {
    onMermaidClick(e);
    if (!viewer.visible) onImageClick(e);
  }

  /* ============ 关闭查看器 ============ */

  function closeViewer(): void {
    if (!viewer.visible) return;
    if (viewer.isFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    viewer.visible = false;
    prevFocusEl?.focus();
    prevFocusEl = null;
  }

  /** 内层元素（工具栏/媒体/说明文字）的点击是否命中——统一收口遮罩层裁决 */
  const VIEWER_SINK =
    ".viewer-toolbar, .viewer-image, .viewer-content, .viewer-caption, .viewer-hint";

  function onViewerClick(e: MouseEvent): void {
    if (dragMoved) return;
    const target = e.target as HTMLElement;
    if (target.closest(VIEWER_SINK)) return;
    closeViewer();
  }

  function onViewerDblClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest(".viewer-image, .viewer-content")) return;
    toggleZoom();
  }

  /* ============ 滚轮缩放 ============ */

  let wheelZooming = $state(false);
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  function onViewerWheel(e: WheelEvent): void {
    if (!viewer.visible || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const rect = viewerContentEl?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    wheelZooming = true;
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelZooming = false;
      wheelTimer = null;
    }, 120);
    const delta = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
    const next = clampScale(viewer.scale * delta);
    if (next === viewer.scale) return;
    const ratioX = (e.clientX - rect.left) / rect.width - 0.5;
    const ratioY = (e.clientY - rect.top) / rect.height - 0.5;
    const factor = next / viewer.scale;
    viewer.translateX -= ratioX * rect.width * (factor - 1);
    viewer.translateY -= ratioY * rect.height * (factor - 1);
    viewer.scale = next;
  }

  /* ============ 拖拽平移 ============ */

  let dragging = $state(false);
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  function onViewerMouseDown(e: MouseEvent): void {
    if (!viewer.visible || e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginX = viewer.translateX;
    dragOriginY = viewer.translateY;
    e.preventDefault();
  }

  function onViewerMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    if (
      !dragMoved &&
      (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD)
    ) {
      dragMoved = true;
    }
    viewer.translateX = dragOriginX + (e.clientX - dragStartX);
    viewer.translateY = dragOriginY + (e.clientY - dragStartY);
  }

  function onViewerMouseUp(): void {
    dragging = false;
  }

  /* ============ 全屏 ============ */

  function toggleFullscreen(): void {
    const el = viewerEl;
    if (!el) return;
    if (viewer.isFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }

  function onFullscreenChange(): void {
    viewer.isFullscreen = !!document.fullscreenElement;
    if (!document.fullscreenElement && viewer.visible) {
      resetZoom();
    }
  }

  /* ============ 键盘 ============ */

  function onViewerKeydown(e: KeyboardEvent): void {
    if (!viewer.visible) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeViewer();
      return;
    }
    if (e.key === "Tab") {
      trapFocus(e);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoomScale(viewer.scale * zoomStep);
    } else if (e.key === "-") {
      e.preventDefault();
      setZoomScale(viewer.scale / zoomStep);
    } else if (e.key === "0") {
      e.preventDefault();
      resetZoom();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      viewer.translateY -= 40;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      viewer.translateY += 40;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      viewer.translateX -= 40;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      viewer.translateX += 40;
    }
  }

  function trapFocus(e: KeyboardEvent): void {
    const overlay = viewerEl;
    if (!overlay) return;
    const focusables = Array.from(
      overlay.querySelectorAll<HTMLElement>(
        "button, [href], [tabindex]:not([tabindex='-1'])"
      )
    );
    if (!focusables.length) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ============ 模板引用 ============ */

  let menuEl = $state<HTMLElement | null>(null);
  let viewerEl = $state<HTMLElement | null>(null);
  let viewerContentEl = $state<HTMLElement | null>(null);

  /* ============ 计算 Viewer aria-label ============ */

  function viewerLabel(): string {
    if (viewer.type === "image") {
      return viewer.alt || t("image.zoom");
    }
    return t("mermaid.zoom");
  }

  function viewerHint(): string {
    return viewer.type === "image"
      ? t("image.hint")
      : t("mermaid.hint");
  }

  function viewerZoomInLabel(): string {
    return viewer.type === "image"
      ? t("image.zoomIn")
      : t("mermaid.zoomIn");
  }

  function viewerZoomOutLabel(): string {
    return viewer.type === "image"
      ? t("image.zoomOut")
      : t("mermaid.zoomOut");
  }

  function viewerResetLabel(): string {
    return viewer.type === "image"
      ? t("image.reset")
      : t("mermaid.reset");
  }

  function viewerFullscreenLabel(): string {
    const ns = viewer.type === "image" ? "image" : "mermaid";
    return viewer.isFullscreen
      ? t(`${ns}.exitFullscreen`)
      : t(`${ns}.fullscreen`);
  }

  function viewerCloseLabel(): string {
    return viewer.type === "image"
      ? t("image.close")
      : t("mermaid.close");
  }

  /* ============ 模板类名派生（原跨元素/状态 CSS 规则 → 互斥串，避免同名工具类级联互博） ============ */

  /** 查看器按钮（原 .viewer-btn/.viewer-close；仓库无 preflight，border-0 手动清 UA 边框） */
  const BTN_BASE =
    "viewer-btn flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#ddd] transition-[background-color,color] duration-[120ms] hover:bg-[rgba(255,255,255,0.16)] hover:text-white";
  const BTN_CLOSE =
    BTN_BASE +
    " ml-1.5 border-l border-l-[rgba(255,255,255,0.14)] rounded-l-none";

  /** 媒体尺寸：原 .viewer-overlay.is-fullscreen .viewer-image/.viewer-content 降级规则 */
  const mediaSize = $derived(
    viewer.isFullscreen
      ? "max-w-[100vw] max-h-[100vh]"
      : "max-w-[92vw] max-h-[88vh]"
  );

  /** 媒体过渡：原 .dragging/.wheel-zooming 覆盖 transition:none 规则 */
  const mediaTransition = $derived(
    dragging || wheelZooming
      ? "transition-none"
      : "transition-[transform] duration-[60ms] ease-linear"
  );

  /** 遮罩表皮：原 .viewer-overlay 与 .viewer-overlay.is-fullscreen 两条互斥规则 */
  const overlaySkin = $derived(
    viewer.isFullscreen
      ? "is-fullscreen bg-black backdrop-blur-none"
      : "bg-[rgba(0,0,0,0.88)] backdrop-blur-[4px]"
  );
</script>

<!--
  容器样式（原 .markdown-body scoped 规则，reader.css 未拥有）译为工具类；
  .markdown-body 类名保留供测试与 JS 查询（原 legacy 后代选择器已于 Task 12 删除，
  响应式留白改由工具类承载（注：v4 内建 max-xl=<1280px 与 legacy 1199px 断点不符，
  故用 max-[1199px] 任意变体——它与 max-lg/max-md 同族按宽度降序排列保证级联；
  唯一边界差：v4 语义为 <1199px，恰好 1199px 宽时停用 56px 留白，差 1px 量级）。
  role="presentation"：正文区整体可点（图片/Mermaid 进预览），Svelte a11y
  对静态/非交互元素挂交互事件会编译告警，仓库既有惯例以 presentation 消除。
-->
<article
  bind:this={rootEl}
  role="presentation"
  class="markdown-body mx-auto max-w-[var(--reader-max-width,900px)] px-12 pt-8 pb-20 text-fg max-[1199px]:px-14 max-lg:px-12 max-md:px-5 [font-family:var(--reader-font-family,inherit)] [font-size:var(--reader-font-size,16px)] [line-height:var(--reader-line-height,1.75)] dark:rounded-none dark:border-0 dark:bg-transparent dark:shadow-none"
  oncontextmenu={onContextMenu}
  onclick={onContentClick}
>
  {@html html}
</article>

<!-- 图片右键菜单 -->
{#if contextMenu.visible}
  <div
    bind:this={menuEl}
    class="image-context-menu fixed z-[200] min-w-[120px] rounded-md border border-[var(--border)] bg-[var(--bg-toolbar,#ffffff)] px-0 py-1 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onMenuKeydown}
  >
    <div
      class="image-menu-item flex cursor-pointer items-center gap-2 px-3.5 py-1.5 select-none whitespace-nowrap text-fg transition-[background-color] duration-100 hover:bg-[var(--bg-btn-hover)]"
      role="menuitem"
      tabindex="-1"
      onclick={openImageViewer}
      onkeydown={onMenuKeydown}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      {t("image.zoom")}
    </div>
  </div>
{/if}
{#if contextMenu.visible}
  <div
    class="image-context-overlay fixed inset-0 z-[199]"
    role="presentation"
    onclick={closeContextMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeContextMenu();
    }}
  ></div>
{/if}

<!-- 统一全屏预览（图片 + Mermaid） -->
{#if viewer.visible}
  <div
    bind:this={viewerEl}
    class="viewer-overlay fixed inset-0 z-[300] flex items-center justify-center overflow-hidden select-none outline-none {overlaySkin}"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label={viewerLabel()}
    onwheel={onViewerWheel}
    onmousedown={onViewerMouseDown}
    onmousemove={onViewerMouseMove}
    onmouseup={onViewerMouseUp}
    onmouseleave={onViewerMouseUp}
    onkeydown={onViewerKeydown}
    onclick={onViewerClick}
    ondblclick={onViewerDblClick}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <div
      class="viewer-toolbar absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.14)] bg-[rgba(30,30,30,0.72)] px-2 py-1.5 backdrop-blur-[8px]"
    >
      <span class="viewer-info min-w-[44px] text-center text-xs tabular-nums text-[#ddd]">{Math.round(viewer.scale * 100)}%</span>
      <button class={BTN_BASE} aria-label={viewerZoomOutLabel()} title={viewerZoomOutLabel()} onclick={() => setZoomScale(viewer.scale / zoomStep)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class={BTN_BASE} aria-label={viewerZoomInLabel()} title={viewerZoomInLabel()} onclick={() => setZoomScale(viewer.scale * zoomStep)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class={BTN_BASE} aria-label={viewerResetLabel()} title={viewerResetLabel()} onclick={resetZoom}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        class={BTN_BASE}
        aria-label={viewerFullscreenLabel()}
        title={viewerFullscreenLabel()}
        onclick={toggleFullscreen}
      >
        {#if !viewer.isFullscreen}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        {/if}
      </button>
      <button
        class={BTN_CLOSE}
        aria-label={viewerCloseLabel()}
        title={viewerCloseLabel()}
        onclick={closeViewer}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- 图片内容 -->
    {#if viewer.type === "image"}
      <img
        bind:this={viewerContentEl}
        src={viewer.src}
        alt={viewer.alt}
        class="viewer-image {mediaSize} {mediaTransition} rounded-[2px] object-contain shadow-[0_12px_48px_rgba(0,0,0,0.5)] [will-change:transform]"
        style="transform: translate({viewer.translateX}px, {viewer.translateY}px) scale({viewer.scale}); cursor: {dragging ? "grabbing" : "grab"}"
        draggable="false"
      />
    {:else}
      <!-- Mermaid SVG 内容 -->
      <div
        bind:this={viewerContentEl}
        class="viewer-content {mediaSize} {mediaTransition} flex items-center justify-center rounded-[2px] shadow-[0_12px_48px_rgba(0,0,0,0.5)] [will-change:transform]"
        style="transform: translate({viewer.translateX}px, {viewer.translateY}px) scale({viewer.scale}); cursor: {dragging ? "grabbing" : "grab"}"
      >
        {@html viewer.svgContent}
      </div>
    {/if}

    {#if viewer.type === "image" && viewer.alt}
      <div class="viewer-caption absolute bottom-14 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-md bg-[rgba(0,0,0,0.55)] px-3 py-1 text-center text-xs text-[#eaeaea]">{viewer.alt}</div>
    {/if}
    <div class="viewer-hint absolute bottom-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-[rgba(255,255,255,0.5)]">{viewerHint()}</div>
  </div>
{/if}

<style>
  /*
   * 规则 8（跨元素 + {@html} 注入内容）：mermaid SVG 由动态 HTML 注入，
   * 工具类无法作用其上，保留组件内样式。:global 标记注入节点——
   * 编译器会把 .viewer-content svg 这类未命中模板元素的选择器裁掉。
   */
  .viewer-content :global(svg) {
    max-width: 100%;
    max-height: 88vh;
    shape-rendering: geometricPrecision;
    text-rendering: optimizeLegibility;
  }

  .viewer-overlay.is-fullscreen .viewer-content :global(svg) {
    max-width: 100vw;
    max-height: 100vh;
  }
</style>
