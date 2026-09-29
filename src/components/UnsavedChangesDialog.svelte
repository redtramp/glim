<script lang="ts">
  import { t } from "../i18n/locale.svelte.ts";

  interface Props {
    visible: boolean;
    title: string;
    message: string;
    fileName: string;
    saveLabel?: string;
    discardLabel?: string;
    cancelLabel?: string;
    onSave?: () => void;
    onDiscard?: () => void;
    onCancel?: () => void;
  }

  let {
    visible,
    title,
    message,
    fileName,
    saveLabel,
    discardLabel,
    cancelLabel,
    onSave,
    onDiscard,
    onCancel,
  }: Props = $props();

  /** 仅点击遮罩本身才取消，等价原 @click.self */
  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onCancel?.();
  }

  /* 三个变体各自带完整 text/bg/border —— 同名 Tailwind 工具类在同一 layer 内顺序不可控，
     不拆分会出现 primary 被 bg-bg-btn 覆盖、danger 被 text-fg 覆盖的问题；
     且 primary 原样式优先级高于 .btn:hover，故不带 hover:bg-*（保持原“悬停不变色”） */
  const btnBase = "btn cursor-pointer rounded-md px-[14px] py-1.5 text-[13px]";
  const btnCancel =
    btnBase + " border border-border bg-bg-btn text-fg hover:bg-bg-btn-hover";
  const btnDanger =
    btnBase + " border border-border bg-bg-btn text-danger hover:bg-bg-btn-hover";
  const btnPrimary = btnBase + " border border-link bg-link text-white";
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
      <div class="title mb-2 text-[16px] font-semibold">{title}</div>
      <div class="file mb-3 truncate text-[13px] text-link" title={fileName}>{fileName}</div>
      <div class="message mb-5 text-[13px] leading-[1.7] text-fg-muted">{message}</div>
      <div class="actions flex justify-end gap-2">
        <button class={btnCancel} onclick={onCancel}>{cancelLabel || t("editor.cancel")}</button>
        <button class={btnDanger} onclick={onDiscard}
          >{discardLabel || t("editor.discardAndContinue")}</button
        >
        <button class={btnPrimary} onclick={onSave}
          >{saveLabel || t("editor.saveAndContinue")}</button
        >
      </div>
    </div>
  </div>
{/if}
