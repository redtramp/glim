<script lang="ts">
  // 自研 i18n（原 vue-i18n useI18n → locale 模块 t()）
  import { t } from "../i18n/locale.svelte.ts";

  // 属性与回调：原 defineProps/defineEmits → Svelte 5 runes props
  interface Props {
    visible: boolean;
    dir: string;
    allowLabel?: string;
    denyLabel?: string;
    onAllow?: () => void;
    onDeny?: () => void;
  }

  let {
    visible,
    dir,
    allowLabel = undefined,
    denyLabel = undefined,
    onAllow,
    onDeny,
  }: Props = $props();

  //原 @click.self:仅点击遮罩自身（非对话框内部）才拒绝
  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onDeny?.();
  }
</script>

{#if visible}
  <div
    class="overlay fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.42)]"
    role="presentation"
    onclick={handleOverlayClick}
  >
    <div
      class="dialog w-[min(520px,calc(100vw-40px))] rounded-[10px] border border-border bg-bg px-6 pb-[18px] pt-[22px] text-fg shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
      role="dialog"
      aria-modal="true"
    >
      <div class="title mb-2 text-base font-semibold">{t("grant.title")}</div>
      <div class="dir mb-3 truncate text-[13px] text-link" title={dir}>{dir}</div>
      <div class="message mb-5 text-[13px] leading-[1.7] text-fg-muted">{t("grant.message")}</div>
      <div class="actions flex justify-end gap-2">
        <button
          class="btn cursor-pointer rounded-md border border-border bg-bg-btn px-[14px] py-1.5 text-[13px] text-fg hover:bg-bg-btn-hover"
          onclick={() => onDeny?.()}>{denyLabel || t("grant.deny")}</button
        >
        <button
          class="btn primary cursor-pointer rounded-md border border-link bg-link px-[14px] py-1.5 text-[13px] text-white hover:bg-link"
          onclick={() => onAllow?.()}>{allowLabel || t("grant.allow")}</button
        >
      </div>
    </div>
  </div>
{/if}
