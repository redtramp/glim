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
  // 文档切换/重渲染时清理图片预览与右键菜单，避免残留旧图片
  closeContextMenu();
  closeZoom();
  const seq = ++renderSeq;
  // 渲染期间保留旧内容,避免切换文档时白屏闪烁;新结果就绪后原子替换
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
  if (seq !== renderSeq) return; // 已有更新的渲染请求,丢弃本次结果
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
  // 只重渲染 mermaid,不参与 markdown 渲染的请求序号,避免废弃进行中的渲染结果
  if (!root.value) return;
  await renderMermaid(root.value, true);
  emit("rendered", root.value);
}

onMounted(() => update());
watch(
  () => [props.source, props.currentFile, props.rootDir],
  () => update()
);
watch(
  () => props.renderTick,
  () => refreshThemeRender()
);

onBeforeUnmount(() => {
  renderSeq++;
  closeContextMenu();
  closeZoom();
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

/* ============ 图片右键菜单 + 全屏预览 ============ */

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** 触发菜单的图片 src */
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

/** 全屏预览状态 */
const zoom = ref<{
  visible: boolean;
  src: string;
  alt: string;
  scale: number;
  translateX: number;
  translateY: number;
}>({
  visible: false,
  src: "",
  alt: "",
  scale: 1,
  translateX: 0,
  translateY: 0,
});

const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const zoomStep = 1.25;
/** 判定为拖拽的最小位移：小于该位移的按下-抬起视为单击 */
const DRAG_THRESHOLD = 4;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function setZoomScale(next: number): void {
  zoom.value.scale = clampScale(next);
}

function resetZoom(): void {
  zoom.value.scale = 1;
  zoom.value.translateX = 0;
  zoom.value.translateY = 0;
}

/** 双击切换 1x / 3x，回到 1x 时同时复位平移 */
function toggleZoom(): void {
  if (zoom.value.scale > 1) {
    resetZoom();
  } else {
    zoom.value.scale = 3;
  }
}

function onContextMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const img = target.closest<HTMLImageElement>("img[src]");
  if (!img || !root.value?.contains(img)) return;
  e.preventDefault();
  e.stopPropagation();
  // 记录焦点基准：右键菜单链（菜单 → 预览）关闭后还原到打开前的位置
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
    // 键盘可达：菜单打开即聚焦菜单项，支持 Enter/Space/Escape
    menuEl.value?.querySelector<HTMLElement>(".image-menu-item")?.focus();
  });
}

/** 图片菜单键盘操作：Enter/Space 激活，Escape/Tab 关闭 */
function onMenuKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" || e.key === "Tab") {
    e.preventDefault();
    closeContextMenu();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onZoomMenuItem();
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

/** 菜单/预览打开前的焦点元素，关闭时还原，避免焦点丢失到 body */
let prevFocusEl: HTMLElement | null = null;

function onZoomMenuItem(): void {
  const { src, alt } = contextMenu.value;
  closeContextMenu();
  if (!src) return;
  zoom.value = { visible: true, src, alt, scale: 1, translateX: 0, translateY: 0 };
  nextTick(() => zoomEl.value?.focus());
}

function closeZoom(): void {
  if (!zoom.value.visible) return;
  zoom.value.visible = false;
  prevFocusEl?.focus();
  prevFocusEl = null;
}

/** 滚轮缩放时临时禁用 CSS 过渡：避免锚点位置随动画中的 transform 漂移 */
const wheelZooming = ref(false);
let wheelTimer: ReturnType<typeof setTimeout> | null = null;

/** 以鼠标位置为中心缩放 */
function onZoomWheel(e: WheelEvent): void {
  // Ctrl/Cmd+滚轮为应用级字体缩放（App 已注册全局处理），这里放行避免图片与字体同时缩放
  if (!zoom.value.visible || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const rect = zoomImageEl.value?.getBoundingClientRect();
  // 图片尚未加载/加载失败时尺寸为 0，除零会产生 NaN 使 transform 失效
  if (!rect || rect.width === 0 || rect.height === 0) return;
  wheelZooming.value = true;
  if (wheelTimer !== null) clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    wheelZooming.value = false;
    wheelTimer = null;
  }, 120);
  const delta = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
  const next = clampScale(zoom.value.scale * delta);
  if (next === zoom.value.scale) return;
  // 计算鼠标相对于图片中心的比例,保持该点不移动
  const ratioX = (e.clientX - rect.left) / rect.width - 0.5;
  const ratioY = (e.clientY - rect.top) / rect.height - 0.5;
  const factor = next / zoom.value.scale;
  zoom.value.translateX -= ratioX * rect.width * (factor - 1);
  zoom.value.translateY -= ratioY * rect.height * (factor - 1);
  zoom.value.scale = next;
}

/** 拖拽平移 */
const dragging = ref(false);
/** 本次按下是否产生了有效拖拽位移（用于抑制拖拽结束时的 click 关闭） */
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

function onZoomMouseDown(e: MouseEvent): void {
  if (!zoom.value.visible || e.button !== 0) return;
  dragging.value = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragOriginX = zoom.value.translateX;
  dragOriginY = zoom.value.translateY;
  e.preventDefault();
}

function onZoomMouseMove(e: MouseEvent): void {
  if (!dragging.value) return;
  if (
    !dragMoved &&
    (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD)
  ) {
    dragMoved = true;
  }
  zoom.value.translateX = dragOriginX + (e.clientX - dragStartX);
  zoom.value.translateY = dragOriginY + (e.clientY - dragStartY);
}

function onZoomMouseUp(): void {
  dragging.value = false;
}

/** 点击遮罩关闭预览；拖拽平移后的 click 事件被忽略 */
function onZoomClick(): void {
  if (dragMoved) return;
  closeZoom();
}

function onZoomKeydown(e: KeyboardEvent): void {
  if (!zoom.value.visible) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeZoom();
    return;
  }
  if (e.key === "Tab") {
    trapFocus(e);
    return;
  }
  // 组合键（如 Ctrl+`+`）交给应用层的字体缩放，不干扰图片预览
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    setZoomScale(zoom.value.scale * zoomStep);
  } else if (e.key === "-") {
    e.preventDefault();
    setZoomScale(zoom.value.scale / zoomStep);
  } else if (e.key === "0") {
    e.preventDefault();
    resetZoom();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    zoom.value.translateY -= 40;
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    zoom.value.translateY += 40;
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    zoom.value.translateX -= 40;
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    zoom.value.translateX += 40;
  }
}

/** 简易焦点陷阱：Tab 在预览内循环，避免焦点逃逸到背景页面 */
function trapFocus(e: KeyboardEvent): void {
  const overlay = zoomEl.value;
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

const menuEl = ref<HTMLElement | null>(null);
const zoomEl = ref<HTMLElement | null>(null);
const zoomImageEl = ref<HTMLElement | null>(null);
</script>

<template>
  <article
    ref="root"
    class="markdown-body"
    v-html="html"
    @contextmenu="onContextMenu"
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
    <div class="image-menu-item" role="menuitem" tabindex="-1" @click="onZoomMenuItem">
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

  <!-- 全屏预览 -->
  <div
    v-if="zoom.visible"
    ref="zoomEl"
    class="zoom-overlay"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    :aria-label="zoom.alt || t('image.zoom')"
    :class="{ dragging, wheelZooming }"
    @wheel="onZoomWheel"
    @mousedown="onZoomMouseDown"
    @mousemove="onZoomMouseMove"
    @mouseup="onZoomMouseUp"
    @mouseleave="onZoomMouseUp"
    @keydown="onZoomKeydown"
    @click="onZoomClick"
    @contextmenu.prevent
  >
    <div class="zoom-toolbar" @click.stop>
      <span class="zoom-info">
        {{ Math.round(zoom.scale * 100) }}%
      </span>
      <button class="zoom-btn" :aria-label="t('image.zoomOut')" :title="t('image.zoomOut')" @click="setZoomScale(zoom.scale / zoomStep)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class="zoom-btn" :aria-label="t('image.zoomIn')" :title="t('image.zoomIn')" @click="setZoomScale(zoom.scale * zoomStep)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button class="zoom-btn" :aria-label="t('image.reset')" :title="t('image.reset')" @click="resetZoom">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button class="zoom-btn zoom-close" :aria-label="t('image.close')" :title="t('image.close')" @click="closeZoom">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
    <img
      ref="zoomImageEl"
      :src="zoom.src"
      :alt="zoom.alt"
      class="zoom-image"
      :style="{
        transform: `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`,
        cursor: dragging ? 'grabbing' : 'grab',
      }"
      draggable="false"
      @click.stop
      @dblclick.stop="toggleZoom"
    />
    <div v-if="zoom.alt" class="zoom-caption" @click.stop>{{ zoom.alt }}</div>
    <div class="zoom-hint" @click.stop>
      {{ t("image.hint") }}
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

/* ===== 全屏预览 ===== */
.zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(4px);
  outline: none;
  overflow: hidden;
  user-select: none;
}

.zoom-image {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  border-radius: 2px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  transition: transform 60ms linear;
  will-change: transform;
}

.zoom-overlay.dragging .zoom-image,
.zoom-overlay.wheel-zooming .zoom-image {
  transition: none;
}

.zoom-toolbar {
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

.zoom-info {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: #ddd;
  font-variant-numeric: tabular-nums;
}

.zoom-btn {
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

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.zoom-close {
  margin-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 0 6px 6px 0;
}

.zoom-caption {
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

.zoom-hint {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  white-space: nowrap;
}
</style>
