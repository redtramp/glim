<script setup lang="ts">
/**
 * TocCapsule.vue — 右下角胶囊迷你目录。
 *
 * 显示形态：右下角胶囊按钮（图标 + 当前章节名 + 阅读进度），与左侧工具栏
 * （LeftRail）同一套视觉语言：毛玻璃背景、滚动时淡出/悬停恢复、active 高亮、
 * 32px 圆角按钮。点击/悬浮展开大纲面板（从胶囊上方弹出）。
 *
 * 交互：
 * - 悬浮展开：悬停胶囊短暂延迟后弹出面板（临时查看，移开自动收起）
 * - 悬浮隐藏：移出胶囊/面板后短暂延迟自动收起（仅临时悬浮展开时生效）
 * - 点击：固定展开/收起（移动端 / 需要固定时使用）
 * - 点击面板外 / ESC → 收起
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import type { Heading } from "../composables/useMarkdown";

const props = defineProps<{
  headings: Heading[];
  activeId: string;
}>();

const emit = defineEmits<{
  (e: "jump", id: string): void;
}>();

const { t } = useI18n();

const open = ref(false);
/** 固定展开（点击胶囊）：移开鼠标不自动收起 */
const pinned = ref(false);
/** 滚动时淡化（与 LeftRail 一致），悬停恢复 */
const dimmed = ref(false);
const progress = ref(0);
const panelEl = ref<HTMLElement | null>(null);
const SCROLL_ROOT_SELECTOR = "[data-scroll-root]";

/** 悬浮展开延迟：避免鼠标扫过右下角时误弹出 */
const HOVER_OPEN_DELAY = 250;
/** 移开自动收起延迟：给鼠标从胶囊移动到面板留出时间 */
const AUTO_HIDE_DELAY = 600;
/** 滚动淡化延迟（与 LeftRail 一致） */
const SCROLL_DIM_DELAY = 1500;
let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
let dimTimer: ReturnType<typeof setTimeout> | null = null;

function clearHoverOpenTimer(): void {
  if (hoverOpenTimer !== null) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
}

function clearAutoHideTimer(): void {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function clearDimTimer(): void {
  if (dimTimer !== null) {
    clearTimeout(dimTimer);
    dimTimer = null;
  }
}

/** 当前章节文本：优先 activeId 对应标题，其次文档第一个标题 */
const currentHeading = computed(() => {
  if (!props.headings.length) return "";
  const active = props.headings.find((h) => h.id === props.activeId);
  return active?.text ?? props.headings[0].text;
});

const progressText = computed(() => `${Math.min(100, Math.max(0, progress.value))}%`);

const minLevel = computed(() =>
  props.headings.length ? Math.min(...props.headings.map((h) => h.level)) : 1
);

function updateProgress(): void {
  const el = document.querySelector<HTMLElement>(SCROLL_ROOT_SELECTOR);
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  progress.value = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0;
}

/** 滚动时淡化（与 LeftRail 一致），随后恢复 */
function onScroll(): void {
  updateProgress();
  dimmed.value = true;
  clearDimTimer();
  dimTimer = setTimeout(() => {
    dimmed.value = false;
  }, SCROLL_DIM_DELAY);
}

let scrollTarget: HTMLElement | null = null;

function toggleOpen(): void {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  if (open.value && !pinned.value) {
    // 悬浮展开中点击 → 固定保持打开（而不是关闭）
    pinned.value = true;
    return;
  }
  if (open.value) {
    close();
    return;
  }
  // 点击 → 固定展开（移开鼠标不自动收起）
  openPanel(true);
}

/** 展开面板（pin=true 时固定展开，移开鼠标不自动收起） */
function openPanel(pin = true): void {
  clearHoverOpenTimer();
  pinned.value = pin;
  open.value = true;
  scrollActiveIntoView();
}

/** 让当前章节在面板中可见 */
function scrollActiveIntoView(): void {
  nextTick(() => {
    const listEl = panelEl.value?.querySelector(".tc-item.active");
    listEl?.scrollIntoView({ block: "nearest" });
  });
}

/** 悬浮展开：悬停胶囊后短暂延迟弹出（临时查看，移开自动收起） */
function onHoverEnter(): void {
  dimmed.value = false;
  clearDimTimer();
  clearAutoHideTimer();
  if (open.value) return;
  clearHoverOpenTimer();
  hoverOpenTimer = setTimeout(() => openPanel(false), HOVER_OPEN_DELAY);
}

/** 悬浮隐藏：移出胶囊/面板后短暂延迟自动收起（仅临时悬浮展开时生效） */
function onHoverLeave(): void {
  clearHoverOpenTimer();
  if (!open.value || pinned.value) return;
  clearAutoHideTimer();
  autoHideTimer = setTimeout(() => close(), AUTO_HIDE_DELAY);
}

function close(): void {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  pinned.value = false;
  open.value = false;
}

function onJump(id: string): void {
  close();
  emit("jump", id);
}

/** 点击面板外关闭 */
function onGlobalClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest(".toc-capsule")) return;
  close();
}

/** ESC 关闭 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") close();
}

onMounted(() => {
  scrollTarget = document.querySelector(SCROLL_ROOT_SELECTOR);
  scrollTarget?.addEventListener("scroll", onScroll, { passive: true });
  updateProgress();
  document.addEventListener("click", onGlobalClick);
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  clearDimTimer();
  scrollTarget?.removeEventListener("scroll", onScroll);
  document.removeEventListener("click", onGlobalClick);
  window.removeEventListener("keydown", onKeydown);
});

watch(
  () => props.headings,
  () => updateProgress(),
  { deep: true }
);
</script>

<template>
  <div
    class="toc-capsule"
    :class="{ open, dimmed }"
    @mouseenter="onHoverEnter"
    @mouseleave="onHoverLeave"
  >
    <!-- 展开面板：从胶囊上方弹出 -->
    <Transition name="tc-pop">
      <div
        v-if="open"
        id="toc-panel"
        ref="panelEl"
        class="tc-panel"
        :aria-label="t('toc.title')"
        @click.stop
      >
        <div class="tc-panel-title">
          {{ t("toc.title") }}
          <span class="tc-panel-count">{{ headings.length }}</span>
        </div>
        <div v-if="!headings.length" class="tc-empty">{{ t("toc.empty") }}</div>
        <ul v-else class="tc-list">
          <li
            v-for="h in headings"
            :key="h.id"
            class="tc-item"
            :class="{ active: activeId === h.id }"
            :style="{ paddingLeft: (h.level - minLevel) * 12 + 6 + 'px' }"
            :title="h.text"
            tabindex="0"
            @click="onJump(h.id)"
            @keydown.enter.prevent="onJump(h.id)"
            @keydown.space.prevent="onJump(h.id)"
          >
            <span class="tc-item-text">{{ h.text }}</span>
          </li>
        </ul>
        <div class="tc-panel-footer">
          <span>{{ progressText }}</span>
        </div>
      </div>
    </Transition>

    <!-- 胶囊按钮（LeftRail 同款视觉：毛玻璃 / 32px 圆角 / active 高亮） -->
    <button
      class="tc-pill"
      :class="{ active: open }"
      :title="currentHeading || t('toc.title')"
      :aria-expanded="open"
      :aria-controls="open ? 'toc-panel' : undefined"
      aria-haspopup="menu"
      :aria-label="t('toc.title')"
      @click.stop="toggleOpen"
    >
      <svg class="tc-pill-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span class="tc-pill-text">{{ currentHeading || t("toc.title") }}</span>
      <span class="tc-pill-progress">{{ progressText }}</span>
    </button>
  </div>
</template>

<style scoped>
/* ===== 右下角胶囊容器 ===== */
.toc-capsule {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: auto;
  user-select: none;
  transition: opacity 200ms ease;
}

/* 滚动淡出 / 悬停恢复（与 LeftRail 一致） */
.toc-capsule.dimmed { opacity: 0.25; }
.toc-capsule:hover { opacity: 1; }

/* ===== 胶囊按钮（LeftRail 同款视觉语言） ===== */
.tc-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  max-width: 320px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--float-panel-bg, rgba(255, 255, 255, 0.85));
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  color: var(--fg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.15s ease, box-shadow 0.15s ease,
    color 0.12s ease, transform 0.1s ease;
}

.tc-pill:hover {
  background: var(--float-rail-icon-hover-bg, rgba(255, 255, 255, 0.95));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}

/* active 高亮（面板展开时，与 LeftRail 按钮一致） */
.tc-pill.active {
  color: var(--float-rail-icon-active, var(--link));
  background: var(--float-rail-icon-active-bg);
  border-color: color-mix(in srgb, var(--float-rail-icon-active, var(--link)) 40%, var(--border));
}

.tc-pill:active {
  transform: scale(0.97);
}

.tc-pill-icon {
  flex: 0 0 auto;
  color: var(--float-rail-icon-color, var(--fg-muted));
  transition: color 0.12s ease;
}

.tc-pill.active .tc-pill-icon {
  color: var(--float-rail-icon-active, var(--link));
}

.tc-pill-text {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg);
}

.tc-pill-progress {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  min-width: 34px;
  text-align: right;
}

/* ===== 展开面板：从胶囊上方弹出 ===== */
.tc-panel {
  width: 300px;
  max-height: 40vh;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--float-panel-bg, rgba(255, 255, 255, 0.9));
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.tc-panel-title {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--border);
}

.tc-panel-count {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg-btn-hover);
  font-size: 10px;
  letter-spacing: 0;
}

.tc-empty {
  padding: 16px 12px;
  color: var(--fg-muted);
  font-size: 12px;
  text-align: center;
}

.tc-list {
  flex: 1 1 auto;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  min-height: 0;
}

.tc-item {
  display: flex;
  align-items: center;
  padding: 5px 12px 5px 6px;
  font-size: 12px;
  color: var(--toc-item-color, var(--fg));
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.tc-item:hover {
  background: var(--toc-hover-bg, var(--bg-btn-hover));
  color: var(--toc-hover-color, var(--fg));
}

.tc-item.active {
  background: var(--toc-active-bg, var(--bg-active));
  border-left-color: var(--toc-active-line, var(--link));
  color: var(--toc-active-color, var(--fg));
  font-weight: 600;
}

.tc-item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-panel-footer {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--fg-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 弹出动画：向上浮现 */
.tc-pop-enter-active,
.tc-pop-leave-active {
  transition: opacity 0.14s ease, transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}

.tc-pop-enter-from,
.tc-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

/* 暗色模式 */
:root[data-theme="dark"] .tc-pill {
  background: rgba(24, 24, 24, 0.82);
  border-color: rgba(255, 255, 255, 0.1);
}

:root[data-theme="dark"] .tc-panel {
  background: rgba(24, 24, 24, 0.9);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 移动端：避让底部工具栏 */
@media (max-width: 767px) {
  .toc-capsule {
    bottom: 62px;
    right: 12px;
  }
  .tc-pill {
    max-width: 260px;
  }
  .tc-panel {
    width: min(300px, calc(100vw - 24px));
  }
}
</style>
