<script lang="ts">
/**
 * BookmarkPanel.svelte — 书签浮层面板（分组展示 / 跳转 / 删除 / 清除）。
 */
import { t } from "../i18n/locale.svelte.ts";
import { basename, dirOf } from "../utils/path";
import { useBookmarks } from "../composables/useBookmarks.svelte.ts";

interface Props {
  currentPath?: string;
  showCurrentOnly?: boolean;
  onJump?: (path: string, scrollTop: number) => void;
  onRefresh?: () => void;
}

let {
  currentPath = undefined,
  showCurrentOnly = false,
  onJump,
  onRefresh,
}: Props = $props();

const store = useBookmarks();
const { bookmarks, remove, clearAll, forFile, groupedByFile } = store;

const groups = $derived.by(() => {
  if (showCurrentOnly && currentPath) {
    const items = forFile(currentPath);
    return items.length === 0 ? [] : [{ filePath: currentPath, items }];
  }
  return Array.from(groupedByFile().entries())
    .map(([filePath, items]) => ({ filePath, items }))
    .sort((a, b) => {
      if (a.filePath === currentPath) return -1;
      if (b.filePath === currentPath) return 1;
      return 0;
    });
});

const totalCount = $derived(bookmarks.value.length);

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t("float.minutesAgo", { n: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("float.hoursAgo", { n: hours });
  return new Date(ts).toLocaleDateString();
}

function onClearAll(): void {
  if (totalCount === 0) return;
  if (window.confirm(t("float.clearBookmarksConfirm"))) {
    clearAll();
    onRefresh?.();
  }
}

/** 条目底色/左边框：激活态与 hover 互斥，避免同类工具类覆盖顺序不定 */
function itemState(active: boolean): string {
  return active
    ? "bg-[var(--bg-active)] border-l-2 border-l-[var(--float-marker-bookmark)]"
    : "border-l-2 border-l-transparent hover:bg-[var(--bg-btn-hover)]";
}
</script>

<div class="bookmark-panel flex min-h-0 flex-1 flex-col text-[13px]">
  <div
    class="bm-header flex shrink-0 items-center gap-2 border-b border-[var(--float-panel-header-border)] px-4 pt-3 pb-2"
  >
    <span class="bm-title text-[12px] tracking-[0.6px] text-[var(--float-panel-header-fg)] uppercase"
      >{t("float.bookmark")}</span
    >
    {#if totalCount > 0}
      <span
        class="bm-count inline-flex h-4 min-w-4 items-center justify-center rounded-lg bg-[var(--float-marker-bookmark)] px-1 text-[10px] font-semibold text-white"
        >{totalCount}</span
      >
      <button
        class="bm-clear ml-auto cursor-pointer rounded border border-[var(--border)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--fg-muted)] hover:bg-[var(--critic-del-bg)] hover:text-[var(--critic-del-color)]"
        title={t("float.clearBookmarks")}
        onclick={onClearAll}
      >
        {t("float.clear")}
      </button>
    {/if}
  </div>

  <div class="bm-content min-h-0 flex-1 overflow-y-auto">
    {#if totalCount === 0}
      <div class="bm-empty flex h-full items-center justify-center p-6 text-center text-[12px] text-[var(--fg-muted)]">
        {t("float.noBookmarks")}
      </div>
    {:else}
      <div class="bm-groups flex flex-col py-1">
        {#each groups as group (group.filePath)}
          <div class="bm-group flex flex-col">
            <div
              class="bm-group-header sticky top-0 z-[1] flex items-center gap-1.5 bg-[rgba(255,255,255,0.72)] px-4 pt-[6px] pb-1 text-[11px] text-[var(--fg-muted)] dark:bg-[rgba(24,24,24,0.78)]"
              title={group.filePath}
            >
              <span class="bm-group-file overflow-hidden text-ellipsis whitespace-nowrap font-medium"
                >{basename(group.filePath)}</span
              >
              <span
                class="bm-group-dir flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] opacity-70"
                >{dirOf(group.filePath)}</span
              >
            </div>
            <div class="bm-group-items flex flex-col">
              {#each group.items as bm (bm.id)}
                <div
                  class="bm-item group flex cursor-pointer items-center gap-1.5 px-4 py-1.5 transition-[background-color,border-color] duration-100 {bm.filePath ===
                  currentPath
                    ? 'active ' + itemState(true)
                    : itemState(false)}"
                  role="presentation"
                  onclick={() => onJump?.(bm.filePath, bm.scrollTop)}
                >
                  <span class="bm-item-icon shrink-0 text-[12px]">📌</span>
                  <span class="bm-item-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--fg)]"
                    >{bm.label}</span
                  >
                  <span class="bm-item-ts shrink-0 whitespace-nowrap text-[10px] text-[var(--fg-muted)]"
                    >{formatDate(bm.createdAt)}</span
                  >
                  <button
                    class="bm-item-remove h-5 w-5 shrink-0 cursor-pointer rounded border-none bg-transparent p-0 text-[var(--fg-muted)] opacity-0 group-hover:opacity-60 hover:opacity-100! hover:bg-[var(--critic-del-bg)] hover:text-[var(--critic-del-color)]"
                    title={t("float.removeBookmark")}
                    onclick={(e) => {
                      e.stopPropagation();
                      remove(bm.id);
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
                    >
                      <line x1="18" y1="6" x2="6" y2="18" /><line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                      />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
