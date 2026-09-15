<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import {
  renderMarkdown,
  renderMath,
  renderMermaid,
  disposeMermaidObserver,
} from "../composables/useMarkdown";
import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

const props = defineProps<{
  source: string;
  currentFile: string;
  rootDir: string;
  renderTick?: number;
}>();
const emit = defineEmits<{
  (e: "rendered", el: HTMLElement): void;
  (e: "internal-link", path: string, hash: string): void;
}>();

const { t } = useI18n();

const html = ref<string>("");
const root = ref<HTMLElement | null>(null);

/** 渲染请求序号:仅最新一次 update 的结果被采用,避免快速切换时旧结果覆盖新内容 */
let renderSeq = 0;

async function update() {
  // 文档切换/重渲染时清理预览与右键菜单
  closeContextMenu();
  closeViewer();
  const seq = ++renderSeq;
  let renderedHtml: string;
  try {
    renderedHtml = await renderMarkdown(props.source);
  } catch (e) {
    console.error("markdown render failed:", e);
    if (seq !== renderSeq) return;
    html.value = `<pre class="mermaid-error">Markdown 渲染失败: ${String(
      (e as Error)?.message ?? e
    )}</pre>`;
    return;
  }
  if (seq !== renderSeq) return;
  html.value = renderedHtml;
  await nextTick();
  if (seq !== renderSeq) return;
  if (root.value) {
    rewriteImagesAndLinks(
      root.value,
      { currentFile: props.currentFile, rootDir: props.rootDir },
      (path, hash) => emit("internal-link", path, hash)
    );
    await renderMath(root.value);
    await renderMermaid(root.value);
    if (seq !== renderSeq) return;
    emit("rendered", root.value);
  }
}

async function refreshThemeRender() {
  if (!root.value) return;
  await renderMermaid(root.value, true);
  emit("rendered", root.value);
}

onMounted(() => {
  update();
  document.addEventListener("fullscreenchange", onFullscreenChange);
});
watch(
  () => [props.source, props.currentFile, props.rootDir],
  () => update()
);
watch(
  () => props.renderTick,
  () => refreshThemeRender()
);

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  renderSeq++;
  closeContextMenu();
  closeViewer();
  if (wheelTimer !== null) {
    clearTimeout(wheelTimer);
    wheelTimer = null;
  }
  if (root.value) {
    disposeMermaidObserver(root.value);
    root.value = null;
  }
});

defineExpose({ root });

/* ============ 统一查看器（图片 + Mermaid） ============ */

const viewer = ref<{
  visible: boolean;
  type: "image" | "mermaid";
  src: string;
  alt: string;
  svgContent: string;
  scale: number;
  translateX: number;
  translateY: number;
  isFullscreen: boolean;
}>({
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
  viewer.value.scale = clampScale(next);
}

function resetZoom(): void {
  viewer.value.scale = 1;
  viewer.value.translateX = 0;
  viewer.value.translateY = 0;
}

function toggleZoom(): void {
  if (viewer.value.scale > 1) {
    resetZoom();
  } else {
    viewer.value.scale = 3;
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

const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  src: "",
  alt: "",
});

function onContextMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const img = target.closest<HTMLImageElement>("img[src]");
  if (!img || !root.value?.contains(img)) return;
  e.preventDefault();
  e.stopPropagation();
  prevFocusEl = document.activeElement as HTMLElement | null;
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    src: img.currentSrc || img.src,
    alt: img.alt || "",
  };
  nextTick(() => {
    clampMenuPosition();
    menuEl.value?.querySelector<HTMLElement>(".image-menu-item")?.focus();
  });
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
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  let { x, y } = contextMenu.value;
  if (x + rect.width > window.innerWidth - 4) {
    x = Math.max(4, window.innerWidth - rect.width - 4);
  }
  if (y + rect.height > window.innerHeight - 4) {
    y = Math.max(4, window.innerHeight - rect.height - 4);
  }
  contextMenu.value.x = x;
  contextMenu.value.y = y;
}

function closeContextMenu(): void {
  contextMenu.value.visible = false;
}

/** 菜单/预览打开前的焦点元素，关闭时还原 */
let prevFocusEl: HTMLElement | null = null;

function openImageViewer(): void {
  const { src, alt } = contextMenu.value;
  closeContextMenu();
  if (!src) return;
  viewer.value = {
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
  nextTick(() => viewerEl.value?.focus());
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
  if (viewer.value.visible) return;
  const target = e.target as HTMLElement;
  const block = target.closest<HTMLElement>(".mermaid-rendered");
  if (!block || !root.value?.contains(block)) return;
  e.preventDefault();
  e.stopPropagation();
  prevFocusEl = document.activeElement as HTMLElement | null;
  const svgContent = injectMermaidDarkSvg(block.innerHTML);
  viewer.value = {
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
  nextTick(() => viewerEl.value?.focus());
}

function onImageClick(e: MouseEvent): void {
  if (viewer.value.visible) return;
  const target = e.target as HTMLElement;
  const img = target.closest<HTMLImageElement>("img[src]");
  if (!img || !root.value?.contains(img)) return;
  e.preventDefault();
  e.stopPropagation();
  prevFocusEl = document.activeElement as HTMLElement | null;
  viewer.value = {
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
  nextTick(() => viewerEl.value?.focus());
}

function onContentClick(e: MouseEvent): void {
  onMermaidClick(e);
  if (!viewer.value.visible) onImageClick(e);
}

/* ============ 关闭查看器 ============ */

function closeViewer(): void {
  if (!viewer.value.visible) return;
  if (viewer.value.isFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  viewer.value.visible = false;
  prevFocusEl?.focus();
  prevFocusEl = null;
}

/* ============ 滚轮缩放 ============ */

const wheelZooming = ref(false);
let wheelTimer: ReturnType<typeof setTimeout> | null = null;

function onViewerWheel(e: WheelEvent): void {
  if (!viewer.value.visible || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const rect = viewerContentEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;
  wheelZooming.value = true;
  if (wheelTimer !== null) clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    wheelZooming.value = false;
    wheelTimer = null;
  }, 120);
  const delta = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
  const next = clampScale(viewer.value.scale * delta);
  if (next === viewer.value.scale) return;
  const ratioX = (e.clientX - rect.left) / rect.width - 0.5;
  const ratioY = (e.clientY - rect.top) / rect.height - 0.5;
  const factor = next / viewer.value.scale;
  viewer.value.translateX -= ratioX * rect.width * (factor - 1);
  viewer.value.translateY -= ratioY * rect.height * (factor - 1);
  viewer.value.scale = next;
}

/* ============ 拖拽平移 ============ */

const dragging = ref(false);
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

function onViewerMouseDown(e: MouseEvent): void {
  if (!viewer.value.visible || e.button !== 0) return;
  dragging.value = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragOriginX = viewer.value.translateX;
  dragOriginY = viewer.value.translateY;
  e.preventDefault();
}

function onViewerMouseMove(e: MouseEvent): void {
  if (!dragging.value) return;
  if (
    !dragMoved &&
    (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD)
  ) {
    dragMoved = true;
  }
  viewer.value.translateX = dragOriginX + (e.clientX - dragStartX);
  viewer.value.translateY = dragOriginY + (e.clientY - dragStartY);
}

function onViewerMouseUp(): void {
  dragging.value = false;
}

function onViewerClick(): void {
  if (dragMoved) return;
  closeViewer();
}

/* ============ 全屏 ============ */

function toggleFullscreen(): void {
  const el = viewerEl.value;
  if (!el) return;
  if (viewer.value.isFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else {
    el.requestFullscreen().catch(() => {});
  }
}

function onFullscreenChange(): void {
  viewer.value.isFullscreen = !!document.fullscreenElement;
  if (!document.fullscreenElement && viewer.value.visible) {
    resetZoom();
  }
}

/* ============ 键盘 ============ */

function onViewerKeydown(e: KeyboardEvent): void {
  if (!viewer.value.visible) return;
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
    setZoomScale(viewer.value.scale * zoomStep);
  } else if (e.key === "-") {
    e.preventDefault();
    setZoomScale(viewer.value.scale / zoomStep);
  } else if (e.key === "0") {
    e.preventDefault();
    resetZoom();
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    viewer.value.translateY -= 40;
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    viewer.value.translateY += 40;
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    viewer.value.translateX -= 40;
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    viewer.value.translateX += 40;
  }
}

function trapFocus(e: KeyboardEvent): void {
  const overlay = viewerEl.value;
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

const menuEl = ref<HTMLElement | null>(null);
const viewerEl = ref<HTMLElement | null>(null);
const viewerContentEl = ref<HTMLElement | null>(null);

/* ============ 计算 Viewer aria-label ============ */

function viewerLabel(): string {
  if (viewer.value.type === "image") {
    return viewer.value.alt || t("image.zoom");
  }
  return t("mermaid.zoom");
}

function viewerHint(): string {
  return viewer.value.type === "image"
    ? t("image.hint")
    : t("mermaid.hint");
}

function viewerZoomInLabel(): string {
  return viewer.value.type === "image"
    ? t("image.zoomIn")
    : t("mermaid.zoomIn");
}

function viewerZoomOutLabel(): string {
  return viewer.value.type === "image"
    ? t("image.zoomOut")
    : t("mermaid.zoomOut");
}

function viewerResetLabel(): string {
  return viewer.value.type === "image"
    ? t("image.reset")
    : t("mermaid.reset");
}

function viewerFullscreenLabel(): string {
  const ns = viewer.value.type === "image" ? "image" : "mermaid";
  return viewer.value.isFullscreen
    ? t(`${ns}.exitFullscreen`)
    : t(`${ns}.fullscreen`);
}

function viewerCloseLabel(): string {
  return viewer.value.type === "image"
    ? t("image.close")
    : t("mermaid.close");
}
</script>

<template>
  <article
    ref="root"
    class="markdown-body"
    v-html="html"
    @contextmenu="onContextMenu"
    @click="onContentClick"
  ></article>

  <!-- 图片右键菜单 -->
  <div
    v-if="contextMenu.visible"
    ref="menuEl"
    class="image-context-menu"
    :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    role="menu"
    @click.stop
    @keydown="onMenuKeydown"
  >
    <div class="image-menu-item" role="menuitem" tabindex="-1" @click="openImageViewer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      {{ t("image.zoom") }}
    </div>
  </div>
  <div v-if="contextMenu.visible" class="image-context-overlay" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>

  <!-- 统一全屏预览（图片 + Mermaid） -->
  <div
    v-if="viewer.visible"
    ref="viewerEl"
    class="viewer-overlay"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    :aria-label="viewerLabel()"
    :class="{ dragging, 'wheel-zooming': wheelZooming, 'is-fullscreen': viewer.isFullscreen }"
    @wheel="onViewerWheel"
    @mousedown="onViewerMouseDown"
    @mousemove="onViewerMouseMove"
    @mouseup="onViewerMouseUp"
    @mouseleave="onViewerMouseUp"
    @keydown="onViewerKeydown"
    @click="onViewerClick"
    @contextmenu.prevent
  >
    <div class="viewer-toolbar" @click.stop>
      <span class="viewer-info">
        {{ Math.round(viewer.scale * 100) }}%
      </span>
      <button class="viewer-btn" :aria-label="viewerZoomOutLabel()" :title="viewerZoomOutLabel()" @click="setZoomScale(viewer.scale / zoomStep)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class="viewer-btn" :aria-label="viewerZoomInLabel()" :title="viewerZoomInLabel()" @click="setZoomScale(viewer.scale * zoomStep)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class="viewer-btn" :aria-label="viewerResetLabel()" :title="viewerResetLabel()" @click="resetZoom">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        class="viewer-btn"
        :aria-label="viewerFullscreenLabel()"
        :title="viewerFullscreenLabel()"
        @click="toggleFullscreen"
      >
        <svg v-if="!viewer.isFullscreen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
      <button
        class="viewer-btn viewer-close"
        :aria-label="viewerCloseLabel()"
        :title="viewerCloseLabel()"
        @click="closeViewer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- 图片内容 -->
    <img
      v-if="viewer.type === 'image'"
      ref="viewerContentEl"
      :src="viewer.src"
      :alt="viewer.alt"
      class="viewer-image"
      :style="{
        transform: `translate(${viewer.translateX}px, ${viewer.translateY}px) scale(${viewer.scale})`,
        cursor: dragging ? 'grabbing' : 'grab',
      }"
      draggable="false"
      @click.stop
      @dblclick.stop="toggleZoom"
    />

    <!-- Mermaid SVG 内容 -->
    <div
      v-else
      ref="viewerContentEl"
      class="viewer-content"
      :style="{
        transform: `translate(${viewer.translateX}px, ${viewer.translateY}px) scale(${viewer.scale})`,
        cursor: dragging ? 'grabbing' : 'grab',
      }"
      @click.stop
      @dblclick.stop="toggleZoom"
      v-html="viewer.svgContent"
    />

    <div v-if="viewer.type === 'image' && viewer.alt" class="viewer-caption" @click.stop>{{ viewer.alt }}</div>
    <div class="viewer-hint" @click.stop>
      {{ viewerHint() }}
    </div>
  </div>
</template>

<style scoped>
.markdown-body {
  padding: 32px 48px 80px;
  max-width: var(--reader-max-width, 900px);
  margin: 0 auto;
  line-height: var(--reader-line-height, 1.75);
  font-size: var(--reader-font-size, 16px);
  font-family: var(--reader-font-family, inherit);
  color: var(--fg);
}

:root[data-theme="dark"] .markdown-body {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* ===== 图片右键菜单 ===== */
.image-context-menu {
  position: fixed;
  z-index: 200;
  min-width: 120px;
  padding: 4px 0;
  background: var(--bg-toolbar, #ffffff);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
  font-size: 12px;
}

.image-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  color: var(--fg);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: background-color 0.1s;
}

.image-menu-item:hover {
  background: var(--bg-btn-hover);
}

.image-context-overlay {
  position: fixed;
  inset: 0;
  z-index: 199;
}

/* ===== 统一全屏预览 ===== */
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(4px);
  outline: none;
  overflow: hidden;
  user-select: none;
}

.viewer-overlay.is-fullscreen {
  background: #000;
  backdrop-filter: none;
}

.viewer-image {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  border-radius: 2px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  transition: transform 60ms linear;
  will-change: transform;
}

.viewer-content {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: 2px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  transition: transform 60ms linear;
  will-change: transform;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-content :deep(svg) {
  max-width: 100%;
  max-height: 88vh;
  shape-rendering: geometricPrecision;
  text-rendering: optimizeLegibility;
}

.viewer-overlay.is-fullscreen .viewer-image {
  max-width: 100vw;
  max-height: 100vh;
}

.viewer-overlay.is-fullscreen .viewer-content {
  max-width: 100vw;
  max-height: 100vh;
}

.viewer-overlay.is-fullscreen .viewer-content :deep(svg) {
  max-width: 100vw;
  max-height: 100vh;
}

.viewer-overlay.dragging .viewer-image,
.viewer-overlay.dragging .viewer-content,
.viewer-overlay.wheel-zooming .viewer-image,
.viewer-overlay.wheel-zooming .viewer-content {
  transition: none;
}

.viewer-toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(30, 30, 30, 0.72);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
}

.viewer-info {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: #ddd;
  font-variant-numeric: tabular-nums;
}

.viewer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #ddd;
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
}

.viewer-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.viewer-close {
  margin-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 0 6px 6px 0;
}

.viewer-caption {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80vw;
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #eaeaea;
  font-size: 12px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-hint {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  white-space: nowrap;
}
</style>
