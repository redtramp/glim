<script lang="ts">
  /**
   * MobileBottomBar.vue → .svelte 迁移要点:
   * - defineEmits("open-panel") → 回调 prop onOpenPanel（与 LeftRail 一致）
   * - scoped CSS → Tailwind 工具类；<768px 断点用任意变体 max-[767px]:
   */
  import { t } from "../i18n/locale.svelte.ts";
  import {
    LEFT_PANEL_META,
    type LeftPanelID,
  } from "../composables/useFloatLayout.svelte.ts";
  import PanelIcon from "./PanelIcon.svelte";

  let {
    activePanel,
    onOpenPanel,
  }: {
    activePanel: LeftPanelID | null;
    onOpenPanel?: (id: LeftPanelID) => void;
  } = $props();
</script>

<nav
  class="mobile-bottom-bar fixed bottom-0 left-0 right-0 z-[45] hidden h-12 items-center border-t-[0.5px] border-black/[0.06] bg-[rgba(255,255,255,0.78)] backdrop-blur-[12px] backdrop-saturate-[1.2] pointer-events-auto select-none [-webkit-overflow-scrolling:touch] max-[767px]:flex dark:border-white/[0.06] dark:bg-[rgba(15,20,16,0.82)] dark:backdrop-saturate-[1.1]"
  aria-label="mobile toolbar"
>
  <div
    class="mbb-inner flex flex-1 items-center justify-around gap-[2px] overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
  >
    {#each LEFT_PANEL_META as item (item.id)}
      <button
        class="mbb-btn relative flex h-9 w-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 transition-[background-color,color] duration-[120ms] ease-[ease] {activePanel === item.id
          ? 'active bg-[var(--float-rail-icon-active-bg)] text-[var(--float-rail-icon-active)]'
          : 'text-[var(--float-rail-icon-color)] hover:bg-[var(--float-rail-icon-hover-bg)] hover:text-fg'}"
        title={t(item.labelKey)}
        aria-label={t(item.labelKey)}
        aria-pressed={activePanel === item.id}
        onclick={() => onOpenPanel?.(item.id)}
      >
        <PanelIcon name={item.id} />
      </button>
    {/each}
  </div>
</nav>
