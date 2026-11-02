<script lang="ts">
  /**
   * HistoryPanel.vue → .svelte 迁移要点:
   * - defineEmits("open"/"clear") → 回调 prop onOpen / onClear
   * - const { recent } = useHistory() 只会在初始化时求值一次 getter，
   *   故改为持有 history 对象，在 $derived 内读 history.recent 以保持响应
   * - 原 recent.value.slice(...) 为 Vue ref 残留（store 已返回裸数组），类型层修正为 history.recent
   * - scoped CSS → Tailwind 工具类
   */
  import { t } from "../i18n/locale.svelte.ts";
  import { basename, dirOf } from "../utils/path";
  import { type RecentItem, useHistory } from "../composables/useHistory";

  interface Props {
    items?: RecentItem[];
    currentPath?: string;
    onOpen?: (path: string) => void;
    onClear?: () => void;
  }

  let { items, currentPath, onOpen, onClear }: Props = $props();

  const history = useHistory();

  const displayItems = $derived(items ?? history.recent.slice(0, 20));

  function formatTimestamp(ts: number): string {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("float.justNow");
    if (minutes < 60) return t("float.minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("float.hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("float.daysAgo", { n: days });
    return new Date(ts).toLocaleDateString();
  }

  function handleClear(): void {
    history.clearRecent();
    onClear?.();
  }

  /* .hp-item.active 源顺序在 .hp-item:hover 之后 → 激活态悬停不变色，故 active 不带 hover:bg-*；
     两者共用的 padding/transition 抽到 itemBase，冲突的 border-left 颜色按态分支 */
  const itemBase =
    "hp-item flex cursor-pointer flex-col gap-0.5 border-l-2 px-4 py-2 transition-[background-color,border-color] duration-100 ease-[ease]";
  const itemNormal = itemBase + " border-l-transparent hover:bg-bg-btn-hover";
  const itemActive = itemBase + " border-l-link bg-active";
</script>

<div class="history-panel flex min-h-0 flex-1 flex-col text-[13px]">
  <div
    class="hp-header flex flex-none items-center gap-2 border-b border-float-panel-header-border px-4 pb-2 pt-3"
  >
    <span class="hp-title text-[12px] tracking-[0.6px] uppercase text-float-panel-header-fg">{t("float.recentDocuments")}</span>
    {#if displayItems.length > 0}
      <button
        class="hp-clear ml-auto cursor-pointer rounded border border-border bg-transparent px-2 py-[2px] text-[11px] text-fg-muted hover:bg-critic-del-bg hover:text-critic-del-color"
        title={t("float.clearHistory")}
        onclick={handleClear}>{t("float.clear")}</button
      >
    {/if}
  </div>

  <div class="hp-content min-h-0 flex-1 overflow-y-auto">
    {#if displayItems.length === 0}
      <div class="hp-empty flex h-full items-center justify-center p-6 text-[12px] text-fg-muted">{t("float.noHistory")}</div>
    {:else}
      <div class="hp-list flex flex-col py-1">
        {#each displayItems as item (item.path + item.ts)}
          <div
            class={item.path === currentPath ? itemActive : itemNormal}
            role="presentation"
            title={item.path}
            onclick={() => onOpen?.(item.path)}
          >
            <span class="hp-item-name overflow-hidden text-ellipsis whitespace-nowrap font-medium text-fg">{item.name || basename(item.path)}</span>
            <span class="hp-item-meta flex items-center gap-2 text-[11px] text-fg-muted"><span class="hp-item-dir flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dirOf(item.path)}</span><span class="hp-item-ts shrink-0 whitespace-nowrap">{formatTimestamp(item.ts)}</span></span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
