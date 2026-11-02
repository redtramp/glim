<script lang="ts">
  // 自研 i18n（原 vue-i18n useI18n → locale 模块 t()）
  import { t } from "../i18n/locale.svelte.ts";
  import type { Tab } from "../composables/useTabs.svelte.ts";

  // 属性与回调：原 defineProps → Svelte 5 runes props
  interface Props {
    tab: Tab | null;
    visible: boolean;
    onReload: () => void;
    onViewDiff: () => void;
    onIgnore: () => void;
    onAutoReload: () => void;
  }

  let { tab, visible, onReload, onViewDiff, onIgnore, onAutoReload }: Props = $props();

  // 原 computed(fileName) → $derived
  const fileName = $derived.by(() => {
    if (!tab) return "";
    const parts = tab.path.split(/[\\/]/);
    return parts[parts.length - 1];
  });

  // 原 computed(timeText) → $derived（相对当前时刻的中文时间描述）
  const timeText = $derived.by(() => {
    if (!tab || !tab.staleSince) return "";
    const diff = Date.now() - tab.staleSince;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    return Math.floor(minutes / 60) + "小时前";
  });
</script>

{#if visible && tab}
  <!-- class 保留 .banner 系列（测试选择器 + 语义锚点）；样式全部转工具类 -->
  <div
    class="banner fixed left-0 right-0 top-10 z-[100] flex items-center gap-3 bg-[var(--banner-bg,#fef3c7)] px-4 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-[background-color,border-color] duration-200 animate-[bannerSlideDown_0.25s_ease-out] border-b border-[color:var(--banner-border,#f59e0b)]"
    role="alert"
    aria-live="polite"
  >
    <span class="banner-icon flex flex-none items-center text-warn">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </span>
    <span class="banner-filename flex-none truncate text-[13px] font-semibold text-fg">{fileName}</span>
    <span class="banner-message flex-1 truncate text-[13px] text-fg-muted">
      {t("editor.externalChangedTitle")}
      <span class="banner-time text-xs text-[color:var(--fg-faint,#9ca3af)]">（{timeText}）</span>
    </span>
    <div class="banner-actions flex flex-none items-center gap-1.5">
      <button
        class="btn-primary cursor-pointer rounded-md border border-link bg-link px-[14px] py-1.5 text-[13px] text-white transition-[background-color,border-color,color] duration-150 hover:brightness-110"
        data-action="reload"
        onclick={onReload}
      >
        {t("banner.reload")}
      </button>
      <button
        class="btn-secondary cursor-pointer rounded-md border border-border bg-transparent px-[14px] py-1.5 text-[13px] text-fg transition-[background-color,border-color,color] duration-150 hover:bg-bg-btn-hover"
        data-action="view-diff"
        onclick={onViewDiff}
      >
        {t("banner.viewDiff")}
      </button>
      <button
        class="btn-secondary cursor-pointer rounded-md border border-border bg-transparent px-[14px] py-1.5 text-[13px] text-fg transition-[background-color,border-color,color] duration-150 hover:bg-bg-btn-hover"
        data-action="ignore"
        onclick={onIgnore}
      >
        {t("banner.ignore")}
      </button>
      <button
        class="btn-secondary cursor-pointer rounded-md border border-border bg-transparent px-[14px] py-1.5 text-[13px] text-fg transition-[background-color,border-color,color] duration-150 hover:bg-bg-btn-hover"
        data-action="auto-reload"
        onclick={onAutoReload}
      >
        {t("banner.autoReload")}
      </button>
    </div>
  </div>
{/if}
