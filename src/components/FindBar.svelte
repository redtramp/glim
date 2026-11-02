<script lang="ts">
  /**
   * FindBar.vue → FindBar.svelte 迁移要点:
   * - defineProps/defineEmits → runes $props() + onXxx 回调
   * - watch(visible) → $effect（firstRun 区分“挂载即可见”与“后续打开”）
   * - scoped CSS → Tailwind 工具类
   */
  import { t } from "../i18n/locale.svelte.ts";

  interface Props {
    visible: boolean;
    query: string;
    caseSensitive: boolean;
    total: number;
    activeIndex: number;
    onQueryChange?: (v: string) => void;
    onCaseSensitiveChange?: (v: boolean) => void;
    onSearch?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    onClose?: () => void;
  }

  let {
    visible,
    query,
    caseSensitive,
    total,
    activeIndex,
    onQueryChange,
    onCaseSensitiveChange,
    onSearch,
    onNext,
    onPrev,
    onClose,
  }: Props = $props();

  let inputEl: HTMLInputElement | null = $state(null);
  let firstRun = true;

  /** 挂载即可见 → 仅 focus（原 onMounted）；后续打开 → focus + select（原 watch） */
  $effect(() => {
    const isFirst = firstRun;
    firstRun = false;
    if (!visible || inputEl === null) return;
    inputEl.focus();
    if (!isFirst) inputEl.select();
  });

  function onInput(evt: Event): void {
    onQueryChange?.((evt.target as HTMLInputElement).value);
    onSearch?.();
  }

  function onKey(evt: KeyboardEvent): void {
    if (evt.key === "Enter") {
      evt.preventDefault();
      if (evt.shiftKey) onPrev?.();
      else onNext?.();
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      onClose?.();
    }
  }

  function toggleCase(): void {
    onCaseSensitiveChange?.(!caseSensitive);
    onSearch?.();
  }

  /* .ic 与 .ic.active 各自带完整 bg/text —— 同名工具类同 layer 内顺序不可控；
     且原样式 .ic.active 在 .ic:hover 之后，激活态悬停不变色，故 active 不带 hover:* */
  const icBase =
    "ic cursor-pointer rounded border border-transparent px-[7px] py-[3px] text-[12px]";
  const icNormal = icBase + " bg-transparent text-fg hover:bg-bg-btn-hover";
  const icActive = icBase + " bg-active text-link";
</script>

{#if visible}
  <div
    class="find-bar fixed right-6 top-[84px] z-[25] flex items-center gap-1 rounded-md border border-border bg-toolbar px-1.5 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
  >
    <input
      bind:this={inputEl}
      type="text"
      class="find-input w-[200px] rounded border border-border bg-bg px-2 py-1 text-[13px] text-fg outline-none focus:border-link"
      placeholder={t("find.placeholder")}
      value={query}
      oninput={onInput}
      onkeydown={onKey}
    />
    <span class="counter min-w-[44px] text-center text-[12px] text-fg-muted">{total === 0
        ? "0/0"
        : `${activeIndex + 1}/${total}`}</span>
    <button
      class={caseSensitive ? icActive : icNormal}
      title={t("find.caseSensitive")}
      aria-label={t("find.caseSensitive")}
      onclick={toggleCase}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 5h11a4 4 0 010 8H3" />
        <path d="M3 19h11a4 4 0 000-8H3" />
        <path d="M15 5v14" />
      </svg>
    </button>
    <button
      class={icNormal}
      title={t("find.previous") + " (Shift+Enter)"}
      aria-label={t("find.previous")}
      onclick={onPrev}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 14 12 17 15 14" />
      </svg>
    </button>
    <button
      class={icNormal}
      title={t("find.next") + " (Enter)"}
      aria-label={t("find.next")}
      onclick={onNext}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 10 12 7 9 10" />
      </svg>
    </button>
    <button
      class={icNormal}
      title={t("find.close") + " (Esc)"}
      aria-label={t("find.close")}
      onclick={onClose}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
{/if}
