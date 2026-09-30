<script lang="ts">
/**
 * FloatingPanel.svelte — 浮动面板容器（左侧栏 / 底部抽屉，滑入滑出动画 + 自动收回）。
 *
 * - Vue `<slot>` → `{@render children?.()}`
 * - watch(visible) → $effect（首次运行只记录基线，等价非 immediate）
 * - onUnmounted → $effect 返回清理函数
 */
import type { Snippet } from "svelte";

interface Props {
  visible: boolean;
  side?: "left" | "bottom";
  width?: number;
  autoHideDelay?: number;
  zIndex?: number;
  onClose?: () => void;
  children?: Snippet;
}

let {
  visible,
  side = "left",
  width = 320,
  autoHideDelay = 1500,
  zIndex = 50,
  onClose,
  children,
}: Props = $props();

/** 面板挂载态：隐藏后延迟 250ms 才卸载，给离场动画留时间（初值由下方 $effect 首轮写入 visible） */
let showContent = $state(false);

const panelStyle = $derived(
  side === "left"
    ? `width: ${width}px; z-index: ${zIndex}`
    : `z-index: ${zIndex}`
);

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
let unmountTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoHide(): void {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function scheduleAutoHide(): void {
  clearAutoHide();
  if (autoHideDelay <= 0) return;
  autoHideTimer = setTimeout(() => onClose?.(), autoHideDelay);
}

function stopPropagation(e: MouseEvent): void {
  e.stopPropagation();
}

// visible 变化：取消定时器 → 显示即挂载，隐藏则延迟卸载（原 watch 非 immediate）
let prevVisible: boolean | null = null;
$effect(() => {
  const v = visible;
  if (prevVisible === null) {
    // 首轮 = 挂载基线（原 showContent 初始值取 visible，原 watch 非 immediate 不触发）
    prevVisible = v;
    showContent = v;
    return;
  }
  prevVisible = v;
  clearAutoHide();
  if (unmountTimer !== null) {
    clearTimeout(unmountTimer);
    unmountTimer = null;
  }
  if (v) {
    showContent = true;
  } else {
    unmountTimer = setTimeout(() => {
      showContent = false;
    }, 250);
  }
});

// 组件卸载：清理两组定时器
$effect(() => () => {
  clearAutoHide();
  if (unmountTimer !== null) clearTimeout(unmountTimer);
});

/* 同名工具类同 layer 内顺序不可控，故按「侧边 × 动画态」拼互斥 class 串：
   位置/尺寸归侧边，transform/opacity/transition 归动画态，互不重叠。 */
const common =
  "floating-panel flex flex-col overflow-hidden pointer-events-auto " +
  "bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(24,24,24,0.78)] " +
  "backdrop-blur-[16px] backdrop-saturate-[1.2] dark:backdrop-saturate-[1.1] " +
  "[will-change:transform,opacity]";

const leftBase =
  "left fixed left-0 top-0 bottom-0 " +
  "border-r-[length:0.5px] border-r-[color:rgba(0,0,0,0.06)] " +
  "dark:border-r-[color:rgba(255,255,255,0.06)] " +
  "shadow-[4px_0_24px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.3)]";

const bottomBase =
  "bottom fixed bottom-0 left-0 right-0 top-auto h-[60vh] max-h-[80vh] " +
  "border-t-[length:0.5px] border-t-[color:rgba(0,0,0,0.06)] " +
  "dark:border-t-[color:rgba(255,255,255,0.06)] " +
  "rounded-t-[12px] shadow-[0_-4px_24px_rgba(0,0,0,0.1)] " +
  "dark:shadow-[0_-4px_24px_rgba(0,0,0,0.3)]";

const leftEntering =
  "entering opacity-100 [transform:translateX(0)] " +
  "transition-[transform_150ms_cubic-bezier(0.16,1,0.3,1),opacity_120ms_ease]";
const leftLeaving =
  "leaving opacity-0 [transform:translateX(-100%)] " +
  "transition-[transform_200ms_ease-in,opacity_150ms_ease]";
const bottomEntering =
  "entering opacity-100 [transform:translateY(0)] transition-[transform_200ms_ease-out]";
const bottomLeaving =
  "leaving opacity-0 [transform:translateY(100%)] transition-[transform_250ms_ease-in]";

const panelClass = $derived(
  [
    common,
    side === "left" ? leftBase : bottomBase,
    visible
      ? side === "left"
        ? leftEntering
        : bottomEntering
      : side === "left"
        ? leftLeaving
        : bottomLeaving,
  ].join(" ")
);
</script>

{#if showContent}
  <div
    class={panelClass}
    style={panelStyle}
    role="dialog"
    tabindex="-1"
    aria-modal={visible}
    aria-label="功能面板"
    onmouseenter={clearAutoHide}
    onmouseleave={scheduleAutoHide}
  >
    {#if side === "bottom"}
      <div
        class="fp-handle flex shrink-0 cursor-grab items-center justify-center pt-2 pb-1"
        role="presentation"
        aria-hidden="true"
        onclick={stopPropagation}
      >
        <span class="fp-handle-bar h-1 w-9 rounded-sm bg-border opacity-50"></span>
      </div>
    {/if}
    <div
      class="fp-body flex min-h-0 flex-1 flex-col overflow-hidden"
      role="presentation"
      onclick={stopPropagation}
    >
      {@render children?.()}
    </div>
  </div>
{/if}
