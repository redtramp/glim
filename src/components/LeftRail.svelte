<script lang="ts">
/**
 * 左侧竖排图标栏
 *
 * Vue → Svelte 5 迁移要点:
 * - ref → $state；onMounted/onUnmounted → onMount/onDestroy
 * - emit('open-panel') → callback prop onOpenPanel
 * - scoped CSS → Tailwind 工具类（token 见 @theme）
 */
import { onMount, onDestroy } from "svelte";
import { t } from "../i18n/locale.svelte.ts";
import { LEFT_PANEL_META, type LeftPanelID } from "../composables/useFloatLayout.svelte.ts";
import PanelIcon from "./PanelIcon.svelte";

let {
    activePanel,
    dynamicIcons = undefined,
    onOpenPanel,
  }: {
    activePanel: LeftPanelID | null;
    dynamicIcons?: Record<string, string>;
    onOpenPanel?: (id: LeftPanelID) => void;
  } = $props();

let dimmed = $state(false);
let dimTimer: ReturnType<typeof setTimeout> | null = null;
let scrollTarget: HTMLElement | null = null;

const SCROLL_DIM_DELAY = 1500;

function onScroll(): void {
  dimmed = true;
  if (dimTimer !== null) clearTimeout(dimTimer);
  dimTimer = setTimeout(() => {
    dimmed = false;
  }, SCROLL_DIM_DELAY);
}

onMount(() => {
  scrollTarget = document.querySelector("[data-scroll-root]");
  scrollTarget?.addEventListener("scroll", onScroll, { passive: true });
});

onDestroy(() => {
  scrollTarget?.removeEventListener("scroll", onScroll);
  if (dimTimer !== null) clearTimeout(dimTimer);
});

const groupBoundaries = new Set(
  LEFT_PANEL_META.reduce<number[]>((acc, meta, idx) => {
    if (idx < LEFT_PANEL_META.length - 1 && LEFT_PANEL_META[idx + 1].group !== meta.group) {
      acc.push(idx);
    }
    return acc;
  }, [])
);
</script>

<nav
  class="left-rail fixed left-0 top-0 bottom-0 z-[45] flex w-10 flex-col items-center border-r-[0.5px] border-black/[0.04] bg-[var(--float-left-rail-bg)] backdrop-blur-[8px] select-none transition-[opacity,background-color] duration-200 ease-out hover:opacity-100 max-md:hidden {dimmed
    ? 'dimmed opacity-25'
    : 'opacity-100'} dark:border-white/[0.04]"
  aria-label="toolbar"
>
  <div class="left-rail-inner flex w-full flex-1 flex-col items-center justify-center gap-[2px] py-2">
    {#each LEFT_PANEL_META as item, idx (item.id)}
      <button
        class="left-rail-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 transition-[background-color,color] duration-[120ms] ease-out {activePanel ===
        item.id
          ? 'active bg-[var(--float-rail-icon-active-bg)] text-[var(--float-rail-icon-active)]'
          : 'text-[var(--float-rail-icon-color)] hover:bg-[var(--float-rail-icon-hover-bg)] hover:text-fg'}"
        title={t(item.labelKey)}
        aria-label={t(item.labelKey)}
        aria-pressed={activePanel === item.id}
        onclick={() => onOpenPanel?.(item.id)}
      >
        {#if dynamicIcons?.[item.id]}
          <span class="pointer-events-none text-lg leading-none">{dynamicIcons[item.id]}</span>
        {:else}
          <PanelIcon name={item.id} />
        {/if}
      </button>
      {#if groupBoundaries.has(idx)}
        <div
          class="left-rail-sep mx-0 my-1 h-px w-5 shrink-0 bg-[var(--float-rail-separator)] opacity-50"
          aria-hidden="true"
        ></div>
      {/if}
    {/each}
  </div>
</nav>
