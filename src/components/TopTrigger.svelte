<script lang="ts">
  import { onDestroy } from "svelte";

  interface Props {
    /** 是否启用（桌面端启用，移动端禁用） */
    enabled?: boolean;
    /** 触发延迟（ms），鼠标进入后等待多久触发滑入 */
    enterDelay?: number;
    /** 收回延迟（ms），鼠标离开后等待多久触发滑出 */
    leaveDelay?: number;
    onShow?: () => void;
    onHide?: () => void;
  }

  let {
    enabled = true,
    enterDelay = 0,
    leaveDelay = 2000,
    onShow,
    onHide,
  }: Props = $props();

  let hovered = $state(false);
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers(): void {
    if (enterTimer !== null) {
      clearTimeout(enterTimer);
      enterTimer = null;
    }
    if (leaveTimer !== null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }

  function onMouseEnter(): void {
    if (!enabled) return;
    clearTimers();
    hovered = true;
    enterTimer = setTimeout(() => {
      onShow?.();
    }, enterDelay);
  }

  function onMouseLeave(): void {
    if (!enabled) return;
    clearTimers();
    hovered = false;
    leaveTimer = setTimeout(() => {
      onHide?.();
    }, leaveDelay);
  }

  onDestroy(clearTimers);
</script>

<div
  class={"top-trigger pointer-events-auto fixed top-0 right-0 left-0 z-[39] cursor-default transition-[height] duration-150 ease-[ease] " +
    (hovered ? "h-3" : "h-2")}
  role="presentation"
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
></div>
