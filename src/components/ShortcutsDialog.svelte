<script lang="ts">
/**
 * ShortcutsDialog.svelte — 快捷键自定义对话框（录制 / 冲突提示 / 重置）。
 *
 * - window keydown(capture) 录制组合键 → $effect 挂载/卸载（原 onMounted/onBeforeUnmount）
 * - 录制态 / 录入态互斥 class 串：同名 border-* / text-* 不会同时出现
 * - overlay 点击关闭等价 Vue `@click.self`
 */
import { t } from "../i18n/locale.svelte.ts";
import { useShortcuts } from "../composables/useShortcuts";

interface Props {
  visible: boolean;
  onClose?: () => void;
}

let { visible, onClose }: Props = $props();

const sc = useShortcuts();

let recordingId = $state<string | null>(null);
let conflictMsg = $state("");

const categories = [
  { key: "global", label: "shortcuts.categoryGlobal" },
  { key: "find", label: "shortcuts.categoryFind" },
  { key: "editor", label: "shortcuts.categoryEditor" },
] as const;

const grouped = $derived(
  categories.map((cat) => ({
    ...cat,
    items: sc.defs.filter((d) => d.category === cat.key),
  }))
);

function startRecording(id: string): void {
  recordingId = id;
  conflictMsg = "";
}

function cancelRecording(): void {
  recordingId = null;
  conflictMsg = "";
}

function onRecordKey(e: KeyboardEvent): void {
  if (!visible) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === "Escape") {
    if (recordingId) cancelRecording();
    else onClose?.();
    return;
  }

  if (!recordingId) return;

  if (sc.isModifierKey(e.key)) return;

  const combo = sc.normalizeEvent(e);
  if (!sc.isValidCombo(combo)) {
    conflictMsg = t("shortcuts.invalid");
    return;
  }

  const result = sc.setBinding(recordingId, combo);
  if (!result.ok) {
    conflictMsg = t("shortcuts.conflict", { name: result.conflict ?? "" });
  } else {
    recordingId = null;
    conflictMsg = "";
  }
}

// 捕获阶段监听（依赖在处理函数内读取，effect 仅挂载/卸载一次）
$effect(() => {
  window.addEventListener("keydown", onRecordKey, true);
  return () => window.removeEventListener("keydown", onRecordKey, true);
});

/* 录制键样式三态互斥（普通 / 仅读 / 录制），避免同名 border-*、text-* 冲突 */
const KEY_BASE =
  "sc-key min-w-[72px] cursor-pointer rounded border border-[length:1px] " +
  "border-border bg-bg-btn px-2.5 py-[3px] text-center text-[12px] text-fg " +
  "transition-[border-color] duration-150 ease-[ease] hover:border-link " +
  "[font-family:ui-monospace,'Cascadia_Code',Consolas,monospace]";
const KEY_READONLY =
  "sc-key min-w-[72px] cursor-default rounded border border-[length:1px] " +
  "border-border bg-bg-btn px-2.5 py-[3px] text-center text-[12px] text-fg opacity-60 " +
  "transition-[border-color] duration-150 ease-[ease] " +
  "[font-family:ui-monospace,'Cascadia_Code',Consolas,monospace]";
const KEY_RECORDING =
  "sc-key min-w-[72px] cursor-pointer rounded border border-[length:1px] " +
  "border-link bg-bg-btn px-2.5 py-[3px] text-center text-[12px] text-link " +
  "transition-[border-color] duration-150 ease-[ease] " +
  "animate-[scPulse_1s_infinite] " +
  "[font-family:ui-monospace,'Cascadia_Code',Consolas,monospace]";

function keyCls(item: { id: string; readonly?: boolean }): string {
  if (item.readonly) return KEY_READONLY;
  if (recordingId === item.id) return KEY_RECORDING;
  return KEY_BASE;
}

/* 底部按钮两态互斥（primary 优先级与原 .sc-btn.primary 一致，不参与 hover 换色） */
const BTN_BASE =
  "sc-btn cursor-pointer rounded-md border border-border bg-bg-btn px-3.5 " +
  "py-[5px] text-[13px] text-fg transition-[background-color] duration-150 ease-[ease] hover:bg-bg-btn-hover";
const BTN_PRIMARY =
  "sc-btn cursor-pointer rounded-md border border-link bg-link px-3.5 py-[5px] text-[13px] text-white";

function onOverlayClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) onClose?.();
}
</script>

{#if visible}
  <div class="sc-overlay fixed inset-0 z-40 flex items-center justify-center bg-overlay" role="presentation" onclick={onOverlayClick}>
    <div
      class="sc-dialog flex max-h-[80vh] min-w-[460px] max-w-[560px] flex-col rounded-lg border border-border bg-bg px-6 py-5 text-fg shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
      role="dialog"
      aria-modal="true"
      aria-label={t("shortcuts.title")}
    >
      <div class="sc-title mb-3.5 flex items-center justify-between text-[15px] font-semibold">
        {t("shortcuts.title")}
        <button class="sc-close cursor-pointer border-none bg-transparent p-0 text-[14px] text-fg-muted hover:text-fg" onclick={() => onClose?.()}>✕</button>
      </div>
      <div class="sc-content min-h-0 flex-1 overflow-y-auto">
        {#each grouped as cat (cat.key)}
          <div class="sc-category mb-4">
            <div class="sc-cat-title mb-2 border-b border-border pb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-fg-muted">{t(cat.label)}</div>
            {#each cat.items as item (item.id)}
              <div class="sc-item mb-0.5">
                <div class="sc-row flex items-center justify-between py-1 text-[13px]">
                  <span class="sc-desc text-fg">{t(`shortcuts.${item.descKey}`)}</span>
                  <div class="sc-binding flex items-center gap-1.5">
                    {#if !item.readonly}
                      <button class={keyCls(item)} onclick={() => startRecording(item.id)}>
                        {recordingId === item.id
                          ? t("shortcuts.recording")
                          : sc.formatBinding(sc.getBinding(item.id))}
                      </button>
                    {:else}
                      <span class={keyCls(item)}>{item.defaultBinding}</span>
                    {/if}
                    {#if !item.readonly && sc.isCustom(item.id)}
                      <button
                        class="sc-reset cursor-pointer rounded-[3px] border-none bg-transparent px-1 py-0.5 text-[14px] text-fg-muted hover:bg-bg-btn hover:text-fg"
                        title={t("shortcuts.reset")}
                        onclick={() => sc.resetBinding(item.id)}
                      >
                        ↺
                      </button>
                    {/if}
                  </div>
                </div>
                {#if recordingId === item.id && conflictMsg}
                  <div class="sc-conflict mt-0.5 pr-7 text-right text-[11px] text-danger">
                    {conflictMsg}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <div class="sc-footer mt-3.5 flex justify-end gap-2 border-t border-border pt-3.5">
        <button class={BTN_BASE} onclick={() => sc.resetAll()}>
          {t("shortcuts.resetAll")}
        </button>
        <button class={BTN_PRIMARY} onclick={() => onClose?.()}>
          {t("shortcuts.done")}
        </button>
      </div>
    </div>
  </div>
{/if}
