<script lang="ts">
/**
 * TocCapsule.svelte — 右下角胶囊迷你目录（Vue → Svelte 5 迁移）。
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
 *
 * 迁移要点：
 * - defineEmits("jump") → 回调 prop onJump
 * - onMounted/onUnmounted → onMount/onDestroy（LeftRail 同款）
 * - watch(headings, deep) → $effect 读 headings.length 建立依赖
 * - <Transition name="tc-pop"> → 自定义 tcPop 过渡（css 回调，expoOut 近似原贝塞尔）
 * - .tc-pill.active / .tc-item.active 同名属性覆盖 → 互斥类串（PILL_* 与 ITEM_*，
 *   active 串不带 hover 态，与原 CSS 中 active 规则在 hover 之后的层叠结果一致）
 * - @media (max-width:767px) → max-md: 变体
 */
import { onMount, onDestroy, tick } from "svelte";
import { expoOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";
import { t } from "../i18n/locale.svelte.ts";
import type { Heading } from "../composables/useMarkdown";

interface Props {
  headings: Heading[];
  activeId: string;
  onJump?: (id: string) => void;
}

let { headings, activeId, onJump }: Props = $props();

let open = $state(false);
/** 固定展开（点击胶囊）：移开鼠标不自动收起 */
let pinned = $state(false);
/** 滚动时淡化（与 LeftRail 一致），悬停恢复 */
let dimmed = $state(false);
let progress = $state(0);
let panelEl: HTMLElement | null = $state(null);
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
const currentHeading = $derived(
  headings.length
    ? (headings.find((h) => h.id === activeId)?.text ?? headings[0].text)
    : ""
);

const progressText = $derived(`${Math.min(100, Math.max(0, progress))}%`);

const minLevel = $derived(
  headings.length ? Math.min(...headings.map((h) => h.level)) : 1
);

function updateProgress(): void {
  const el = document.querySelector<HTMLElement>(SCROLL_ROOT_SELECTOR);
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  progress = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0;
}

/** 滚动时淡化（与 LeftRail 一致），随后恢复 */
function onScroll(): void {
  updateProgress();
  dimmed = true;
  clearDimTimer();
  dimTimer = setTimeout(() => {
    dimmed = false;
  }, SCROLL_DIM_DELAY);
}

let scrollTarget: HTMLElement | null = null;

function toggleOpen(): void {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  if (open && !pinned) {
    // 悬浮展开中点击 → 固定保持打开（而不是关闭）
    pinned = true;
    return;
  }
  if (open) {
    close();
    return;
  }
  // 点击 → 固定展开（移开鼠标不自动收起）
  openPanel(true);
}

/** 展开面板（pin=true 时固定展开，移开鼠标不自动收起） */
function openPanel(pin = true): void {
  clearHoverOpenTimer();
  pinned = pin;
  open = true;
  void scrollActiveIntoView();
}

/** 让当前章节在面板中可见（原 nextTick → await tick） */
async function scrollActiveIntoView(): Promise<void> {
  await tick();
  const listEl = panelEl?.querySelector(".tc-item.active");
  listEl?.scrollIntoView({ block: "nearest" });
}

/** 悬浮展开：悬停胶囊后短暂延迟弹出（临时查看，移开自动收起） */
function onHoverEnter(): void {
  dimmed = false;
  clearDimTimer();
  clearAutoHideTimer();
  if (open) return;
  clearHoverOpenTimer();
  hoverOpenTimer = setTimeout(() => openPanel(false), HOVER_OPEN_DELAY);
}

/** 悬浮隐藏：移出胶囊/面板后短暂延迟自动收起（仅临时悬浮展开时生效） */
function onHoverLeave(): void {
  clearHoverOpenTimer();
  if (!open || pinned) return;
  clearAutoHideTimer();
  autoHideTimer = setTimeout(() => close(), AUTO_HIDE_DELAY);
}

function close(): void {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  pinned = false;
  open = false;
}

function onJumpItem(id: string): void {
  close();
  onJump?.(id);
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

onMount(() => {
  scrollTarget = document.querySelector(SCROLL_ROOT_SELECTOR);
  scrollTarget?.addEventListener("scroll", onScroll, { passive: true });
  updateProgress();
  document.addEventListener("click", onGlobalClick);
  window.addEventListener("keydown", onKeydown);
});

onDestroy(() => {
  clearHoverOpenTimer();
  clearAutoHideTimer();
  clearDimTimer();
  scrollTarget?.removeEventListener("scroll", onScroll);
  document.removeEventListener("click", onGlobalClick);
  window.removeEventListener("keydown", onKeydown);
});

// 原 watch(() => props.headings, ..., { deep: true }) → 标题列表更新后刷新进度。
// updateProgress 不读取标题内容，读 length 建立依赖即可覆盖引用/长度变化
$effect(() => {
  void headings.length;
  updateProgress();
});

/**
 * tc-pop：面板向上浮现（原 .tc-pop-enter/leave 为 opacity 0.14s + transform 0.16s
 * 两条时间线，transform-origin: bottom right）。Svelte 自定义过渡只能给一条
 * 时间线，近似为 160ms + expoOut（≈ cubic-bezier(0.16,1,0.3,1)）。
 */
function tcPop(_node: HTMLElement): TransitionConfig {
  return {
    duration: 160,
    easing: expoOut,
    css: (t: number) =>
      `opacity: ${t}; transform: translateY(${(1 - t) * 8}px) scale(${0.98 + 0.02 * t}); transform-origin: bottom right;`,
  };
}

/* 右下角容器：滚动淡出/悬停恢复（原 .toc-capsule + .dimmed + :hover + 移动端避让） */
const ROOT =
  "toc-capsule fixed right-6 bottom-6 z-[45] flex flex-col items-end " +
  "pointer-events-auto select-none transition-[opacity] duration-200 ease " +
  "hover:opacity-100 max-md:bottom-[62px] max-md:right-3";

/* 胶囊按钮底座（颜色/光标外的形状与动效，常态/激活各自补齐配色） */
const PILL_BASE =
  "tc-pill inline-flex items-center gap-2 h-8 max-w-[320px] px-3.5 border rounded-2xl " +
  "cursor-pointer text-xs shadow-[0_4px_16px_rgba(0,0,0,0.14)] " +
  "backdrop-blur-[14px] backdrop-saturate-[1.2] " +
  "transition-[background-color,box-shadow,color,transform] duration-150 ease " +
  "hover:shadow-[0_6px_20px_rgba(0,0,0,0.18)] active:scale-[0.97] " +
  "max-md:max-w-[260px]";
/* 常态：含悬停底色；暗色覆盖原 :root[data-theme=dark] .tc-pill（含悬停，原暗色规则优先级高于 :hover） */
const PILL_REST =
  PILL_BASE +
  " border-border bg-[var(--float-panel-bg,rgba(255,255,255,0.85))] text-fg" +
  " hover:bg-[var(--float-rail-icon-hover-bg,rgba(255,255,255,0.95))]" +
  " dark:bg-[rgba(24,24,24,0.82)] dark:border-[rgba(255,255,255,0.1)]" +
  " dark:hover:bg-[rgba(24,24,24,0.82)]";
/* 激活：active 规则在原 CSS 中位于 :hover 之后 → 不带 hover 底色（悬停仅换阴影） */
const PILL_ACTIVE =
  PILL_BASE +
  " active bg-[var(--float-rail-icon-active-bg)]" +
  " text-[var(--float-rail-icon-active,var(--link))]" +
  " border-[color-mix(in_srgb,var(--float-rail-icon-active,var(--link))_40%,var(--border))]" +
  " dark:bg-[rgba(24,24,24,0.82)] dark:border-[rgba(255,255,255,0.1)]";
const ICON_REST = "tc-pill-icon text-[var(--float-rail-icon-color,var(--fg-muted))]";
const ICON_ACTIVE = "tc-pill-icon text-[var(--float-rail-icon-active,var(--link))]";

/* 展开面板（原 .tc-panel + 暗色 + 移动端宽度） */
const PANEL =
  "tc-panel w-[300px] max-h-[40vh] mb-2 flex flex-col border border-border rounded-[10px] " +
  "bg-[var(--float-panel-bg,rgba(255,255,255,0.9))] backdrop-blur-[16px] backdrop-saturate-[1.2] " +
  "shadow-[0_8px_32px_rgba(0,0,0,0.2)] overflow-hidden " +
  "dark:bg-[rgba(24,24,24,0.9)] dark:border-[rgba(255,255,255,0.1)] " +
  "max-md:w-[min(300px,calc(100vw-24px))]";

/* 目录条目：常态带 hover；active 串不带 hover（原 .tc-item.active 位于 :hover 之后） */
const ITEM_BASE =
  "tc-item flex items-center py-[5px] pr-3 pl-1.5 text-xs cursor-pointer " +
  "border-l-2 border-l-transparent transition-[background-color,color] duration-100 " +
  "text-[var(--toc-item-color,var(--fg))]" +
  " hover:bg-[var(--toc-hover-bg,var(--bg-btn-hover))]" +
  " hover:text-[var(--toc-hover-color,var(--fg))]";
const ITEM_ACTIVE =
  "tc-item active flex items-center py-[5px] pr-3 pl-1.5 text-xs cursor-pointer " +
  "border-l-2 border-l-[color:var(--toc-active-line,var(--link))] " +
  "transition-[background-color,color] duration-100 font-semibold " +
  "bg-[var(--toc-active-bg,var(--bg-active))]" +
  " text-[var(--toc-active-color,var(--fg))]";
</script>

<div
  class="{ROOT} {dimmed ? 'dimmed opacity-25' : 'opacity-100'}{open ? ' open' : ''}"
  role="presentation"
  onmouseenter={onHoverEnter}
  onmouseleave={onHoverLeave}
>
  <!-- 展开面板：从胶囊上方弹出 -->
  {#if open}
    <div
      id="toc-panel"
      bind:this={panelEl}
      class={PANEL}
      role="presentation"
      aria-label={t("toc.title")}
      onclick={(e) => e.stopPropagation()}
      transition:tcPop
    >
      <div
        class="tc-panel-title flex-none flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.6px] text-fg-muted border-b border-border"
      >
        {t("toc.title")}
        <span class="tc-panel-count px-1.5 rounded-lg bg-bg-btn-hover text-[10px] tracking-normal">
          {headings.length}
        </span>
      </div>
      {#if !headings.length}
        <div class="tc-empty px-3 py-4 text-fg-muted text-xs text-center">{t("toc.empty")}</div>
      {:else}
        <ul
          class="tc-list flex-auto min-h-0 overflow-y-auto list-none my-0 py-1"
          role="listbox"
          aria-label={t("toc.title")}
        >
          {#each headings as h (h.id)}
            <li
              class={activeId === h.id ? ITEM_ACTIVE : ITEM_BASE}
              style="padding-left: {(h.level - minLevel) * 12 + 6}px"
              title={h.text}
              role="option"
              aria-selected={activeId === h.id}
              tabindex="0"
              onclick={() => onJumpItem(h.id)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onJumpItem(h.id);
                }
              }}
            >
              <span class="tc-item-text overflow-hidden text-ellipsis whitespace-nowrap">{h.text}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <div
        class="tc-panel-footer flex-none px-3 py-1.5 border-t border-border text-[11px] text-fg-muted text-right tabular-nums"
      >
        <span>{progressText}</span>
      </div>
    </div>
  {/if}

  <!-- 胶囊按钮（LeftRail 同款视觉：毛玻璃 / 32px 圆角 / active 高亮） -->
  <button
    class={open ? PILL_ACTIVE : PILL_REST}
    title={currentHeading || t("toc.title")}
    aria-expanded={open}
    aria-controls={open ? "toc-panel" : undefined}
    aria-haspopup="menu"
    aria-label={t("toc.title")}
    onclick={(e) => {
      e.stopPropagation();
      toggleOpen();
    }}
  >
    <svg
      class="{open ? ICON_ACTIVE : ICON_REST} grow-0 shrink-0 transition-colors duration-[120ms]"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
    <span class="tc-pill-text flex-auto overflow-hidden text-ellipsis whitespace-nowrap text-fg">
      {currentHeading || t("toc.title")}
    </span>
    <span
      class="tc-pill-progress grow-0 shrink-0 min-w-[34px] text-right text-[11px] text-fg-muted tabular-nums"
    >
      {progressText}
    </span>
  </button>
</div>
