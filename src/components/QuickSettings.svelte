<script lang="ts">
  /**
   * QuickSettings.vue → .svelte 迁移要点:
   * - defineEmits("toggle-theme") 等 → 回调 prop onToggleTheme / onSetMaxWidth / …
   * - computed(themeLabel) → $derived
   * - const { settings } = useReadingSettings() 会固化初始 settings 对象，
   *   改为持有 rs，在模板内读 rs.settings.* 以跟随 store 的整体重赋值
   * - scoped CSS → Tailwind；同名工具类同 layer 内顺序不可控，故按态拆完整类串
   */
  import { t } from "../i18n/locale.svelte.ts";
  import { useReadingSettings } from "../composables/useReadingSettings.svelte.ts";

  interface Props {
    theme: "light" | "dark";
    fontSize: number;
    floatLayoutEnabled?: boolean;
    onToggleTheme?: () => void;
    onOpenSettings?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onSetMaxWidth?: (width: number) => void;
    onSetLineHeight?: (height: number) => void;
    onToggleFloatLayout?: () => void;
  }

  let {
    theme,
    fontSize,
    floatLayoutEnabled,
    onToggleTheme,
    onOpenSettings,
    onZoomIn,
    onZoomOut,
    onSetMaxWidth,
    onSetLineHeight,
    onToggleFloatLayout,
  }: Props = $props();

  const rs = useReadingSettings();

  const themeLabel = $derived(
    theme === "dark" ? t("float.lightMode") : t("float.darkMode")
  );

  const MAX_WIDTH_PRESETS = [
    { label: "float.widthNarrow", value: 600 },
    { label: "float.widthMedium", value: 750 },
    { label: "float.widthWide", value: 900 },
  ];

  const LINE_HEIGHT_PRESETS = [
    { label: "float.lineHeightTight", value: 1.4 },
    { label: "float.lineHeightNormal", value: 1.75 },
    { label: "float.lineHeightRelaxed", value: 2.0 },
  ];

  /* .qs-btn.active 源顺序在 .qs-btn:hover 之后 → 激活态悬停不变色，故 active 不带 hover:bg-*；
     .qs-icon-btn 覆盖 padding 为 0，故图标按钮不复用 btnBase 的 px/py */
  const btnBase =
    "qs-btn cursor-pointer whitespace-nowrap rounded-[5px] border px-2.5 py-[3px] text-[12px] disabled:cursor-not-allowed disabled:opacity-40";
  const btnNormal = btnBase + " border-border bg-bg-btn text-fg hover:bg-bg-btn-hover";
  const btnActive = btnBase + " border-link bg-active text-link";
  const iconBtnBase =
    "qs-btn qs-icon-btn flex h-7 w-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-[5px] border p-0 text-[12px] disabled:cursor-not-allowed disabled:opacity-40";
  const iconBtnNormal =
    iconBtnBase + " border-border bg-bg-btn text-fg hover:bg-bg-btn-hover";
  const linkBtn =
    "qs-link-btn flex cursor-pointer items-center rounded-[5px] border border-border bg-transparent px-3 py-1 text-[12px] text-link hover:bg-active";
</script>

<div class="qs flex min-h-0 flex-1 flex-col text-[13px]">
  <div
    class="qs-header flex-none border-b border-float-panel-header-border px-4 pb-2 pt-3 text-[12px] tracking-[0.6px] uppercase text-float-panel-header-fg">{t("float.quickSettings")}</div
  >

  <div class="qs-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
    <div class="qs-row flex items-center gap-2.5">
      <span class="qs-label shrink-0 basis-[60px] whitespace-nowrap text-[12px] text-fg-muted">{t("float.theme")}</span>
      <button class={btnNormal} onclick={onToggleTheme}>{themeLabel}</button>
    </div>

    <div class="qs-row flex items-center gap-2.5">
      <span class="qs-label shrink-0 basis-[60px] whitespace-nowrap text-[12px] text-fg-muted">{t("float.fontSize")}</span>
      <div class="qs-control flex items-center gap-1.5">
        <button
          class={iconBtnNormal}
          disabled={fontSize <= 10}
          aria-label={t("float.zoomOut")}
          onclick={onZoomOut}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <span class="qs-value min-w-[24px] text-center text-[12px] tabular-nums text-fg">{fontSize}</span>
        <button
          class={iconBtnNormal}
          disabled={fontSize >= 28}
          aria-label={t("float.zoomIn")}
          onclick={onZoomIn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
    </div>

    <div class="qs-row flex items-center gap-2.5">
      <span class="qs-label shrink-0 basis-[60px] whitespace-nowrap text-[12px] text-fg-muted">{t("float.maxWidth")}</span>
      <div class="qs-btn-group flex flex-wrap gap-1">
        {#each MAX_WIDTH_PRESETS as preset (preset.value)}
          <button
            class={rs.settings.maxWidth === preset.value ? btnActive : btnNormal}
            onclick={() => onSetMaxWidth?.(preset.value)}>{t(preset.label)}</button
          >
        {/each}
      </div>
    </div>

    <div class="qs-row flex items-center gap-2.5">
      <span class="qs-label shrink-0 basis-[60px] whitespace-nowrap text-[12px] text-fg-muted">{t("float.lineHeight")}</span>
      <div class="qs-btn-group flex flex-wrap gap-1">
        {#each LINE_HEIGHT_PRESETS as preset (preset.value)}
          <button
            class={Math.abs(rs.settings.lineHeight - preset.value) < 0.01
              ? btnActive
              : btnNormal}
            onclick={() => onSetLineHeight?.(preset.value)}>{t(preset.label)}</button
          >
        {/each}
      </div>
    </div>

    <div class="qs-row flex items-center gap-2.5">
      <span class="qs-label shrink-0 basis-[60px] whitespace-nowrap text-[12px] text-fg-muted">{t("float.floatLayout")}</span>
      <button
        class={floatLayoutEnabled ? btnActive : btnNormal}
        onclick={onToggleFloatLayout}>{floatLayoutEnabled
          ? t("float.floatLayoutOn")
          : t("float.floatLayoutOff")}</button
      >
    </div>
  </div>

  <div
    class="qs-footer flex flex-none justify-end border-t border-float-panel-header-border px-4 pb-3 pt-2"
  >
    <button class={linkBtn} onclick={onOpenSettings}>{t("float.fullSettings")}<svg class="ml-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
  </div>
</div>
