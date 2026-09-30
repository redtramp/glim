<script lang="ts">
/**
 * TabBar.svelte — 文档标签栏。
 *
 * 支持两种模式：
 * 1. 静态模式（默认）：flex 布局，常驻显示在工具栏下方
 * 2. 悬浮模式（floating）：position: fixed，磨砂玻璃背景，默认隐藏，由外部触发显示
 *
 * 右键菜单：关闭左侧/右侧/其他/全部标签。
 */
import { basename } from "../utils/path";
import type { Tab } from "../composables/useTabs.svelte.ts";
import { t } from "../i18n/locale.svelte.ts";

interface Props {
  tabs: Tab[];
  activeTabId: string;
  autoReload: string[];
  /** 悬浮模式（桌面端顶部悬浮 Tab 条） */
  floating?: boolean;
  /** 悬浮模式显隐 */
  visible?: boolean;
  onActivate?: (id: string) => void;
  onClose?: (id: string) => void;
  onCloseLeft?: (id: string) => void;
  onCloseRight?: (id: string) => void;
  onCloseAll?: () => void;
  onCloseOthers?: (id: string) => void;
  /** 悬浮模式：鼠标进入 Tab 条区域，请求父组件保持显示 */
  onMouseEnter?: () => void;
  /** 悬浮模式：鼠标离开 Tab 条区域，请求父组件开始隐藏计时 */
  onMouseLeave?: () => void;
}

let {
  tabs,
  activeTabId,
  autoReload,
  floating = false,
  visible = true,
  onActivate,
  onClose,
  onCloseLeft,
  onCloseRight,
  onCloseAll,
  onCloseOthers,
  onMouseEnter,
  onMouseLeave,
}: Props = $props();

// 右键菜单状态
let menuState = $state({
  visible: false,
  x: 0,
  y: 0,
  targetId: "",
});

function onMiddle(id: string) {
  onClose?.(id);
}

/** 打开右键菜单 */
function onContextMenu(e: MouseEvent, id: string) {
  e.preventDefault();
  e.stopPropagation();
  menuState = { visible: true, x: e.clientX, y: e.clientY, targetId: id };
}

/** 关闭右键菜单 */
function closeMenu() {
  menuState.visible = false;
}

const hasLeft = $derived(
  tabs.findIndex((tab) => tab.id === menuState.targetId) > 0
);
const hasRight = $derived(
  tabs.findIndex((tab) => tab.id === menuState.targetId) < tabs.length - 1
);
const hasOthers = $derived(tabs.length > 1);

const items = $derived(
  tabs.map((tab) => ({
    id: tab.id,
    name: basename(tab.path),
    path: tab.path,
    isDirty: tab.isDirty,
    isStale:
      tab.staleSince !== null &&
      !tab.isDirty &&
      !autoReload.includes(tab.path.replace(/\\/g, "/").toLowerCase()),
    active: tab.id === activeTabId,
  }))
);

// 根节点 class：静态/悬浮两套互斥样式 + menu-open/visible/hidden 标记类
const rootClass = $derived(
  [
    "tab-bar",
    "shrink-0 items-stretch [scrollbar-width:thin]",
    menuState.visible ? "menu-open" : "",
    floating
      ? "floating fixed inset-x-0 top-0 z-[60] h-8 border-b-[0.5px] border-black/[0.06] bg-white/[0.72] shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-[16px] backdrop-saturate-[120%] pointer-events-auto transition-transform duration-150 ease-out dark:border-white/[0.06] dark:bg-[rgba(24,24,24,0.78)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.2)] " +
        (visible
          ? "visible translate-y-0"
          : "hidden -translate-y-full duration-200 ease-in pointer-events-none")
      : "border-b border-[var(--shell-toolbar-border)] bg-[var(--shell-sidebar-bg)]",
  ]
    .filter(Boolean)
    .join(" ")
);

/** Tab 项 class：按模式选一套 padding/字号，再叠加激活态 */
function itemClass(active: boolean): string {
  const layout = floating
    ? "max-w-[140px] py-[3px] pr-2 pl-[10px] text-[11px]"
    : "max-w-[160px] py-1 pr-2 pl-3 text-xs";
  const base =
    "tab-item flex shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap border-r border-r-[var(--shell-sidebar-border)] border-b-2 transition-[color,background-color,border-color] duration-[120ms] ";
  const state = active
    ? `active border-b-[var(--shell-tab-active-border)] text-[var(--shell-tab-active-color)] ${
        floating ? "bg-[var(--bg-active)]" : "bg-[var(--bg)]"
      }`
    : "border-b-transparent text-[var(--shell-tab-color)] hover:text-[var(--shell-tab-hover-color)]";
  return base + layout + " " + state;
}

/** 右键菜单项 class：禁用态不带 hover 背景 */
function menuClass(disabled: boolean): string {
  return disabled
    ? "menu-item disabled cursor-default select-none whitespace-nowrap bg-transparent px-4 py-1.5 text-[var(--fg-muted)] opacity-50"
    : "menu-item cursor-pointer select-none whitespace-nowrap px-4 py-1.5 text-[var(--fg)] hover:bg-[var(--bg-btn-hover)]";
}
</script>

<!-- .hidden 是外部标记类，用内联 display 保证标签栏始终参与布局（保留滑入/滑出动画） -->
<div
  class={rootClass}
  style:display="flex"
  style:overflow-x={menuState.visible ? "visible" : "auto"}
  style:overflow-y={menuState.visible ? "visible" : "hidden"}
  role="presentation"
  onclick={closeMenu}
  oncontextmenu={closeMenu}
  onmouseenter={() => {
    if (floating) onMouseEnter?.();
  }}
  onmouseleave={() => {
    if (floating) onMouseLeave?.();
  }}
>
  {#each items as item (item.id)}
    <div
      class={itemClass(item.active)}
      title={item.path}
      role="presentation"
      onclick={() => onActivate?.(item.id)}
      onmousedown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onMiddle(item.id);
        }
      }}
      oncontextmenu={(e) => onContextMenu(e, item.id)}
    >
      {#if item.isDirty}
        <span class="dot h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--shell-tab-active-border)]"></span>
      {/if}
      {#if item.isStale}
        <span
          class="stale-warning flex shrink-0 items-center text-[var(--banner-warning,#f59e0b)]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      {/if}
      <span class="name overflow-hidden text-ellipsis">{item.name}</span>
      <button
        class="close m-0 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-inherit opacity-60 transition-[opacity,background-color] duration-150 hover:bg-[var(--bg-btn-hover)] hover:opacity-100"
        title={t("tabs.close")}
        onclick={(e) => {
          e.stopPropagation();
          onClose?.(item.id);
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  {/each}

  {#if menuState.visible}
    <div
      class="context-menu absolute z-[100] min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--bg-toolbar)] px-0 py-1 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
      style="left: {menuState.x}px; top: {menuState.y}px"
      role="presentation"
      onclick={(e) => {
        e.stopPropagation();
        closeMenu();
      }}
    >
      <div
        class={menuClass(!hasLeft)}
        title={hasLeft ? "" : "已经是第一个标签"}
        role="presentation"
        onclick={() => {
          if (hasLeft) onCloseLeft?.(menuState.targetId);
        }}
      >
        {t("tabs.closeLeft")}
      </div>
      <div
        class={menuClass(!hasRight)}
        title={hasRight ? "" : "已经是最后一个标签"}
        role="presentation"
        onclick={() => {
          if (hasRight) onCloseRight?.(menuState.targetId);
        }}
      >
        {t("tabs.closeRight")}
      </div>
      <div
        class={menuClass(!hasOthers)}
        title={hasOthers ? "" : "只有一个标签"}
        role="presentation"
        onclick={() => {
          if (hasOthers) onCloseOthers?.(menuState.targetId);
        }}
      >
        {t("tabs.closeOthers")}
      </div>
      <div
        class={menuClass(false)}
        role="presentation"
        onclick={() => onCloseAll?.()}
      >
        {t("tabs.closeAll")}
      </div>
    </div>
    <div
      class="context-menu-overlay fixed inset-0 z-[99]"
      role="presentation"
      onclick={closeMenu}
    ></div>
  {/if}
</div>
