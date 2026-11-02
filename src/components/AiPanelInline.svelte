<script lang="ts">
/**
 * AiPanelInline.svelte — 🤖 AI 辅助浮层面板（浮层内嵌版）。
 *
 * 与 AiPanel.vue 共享同一 useAiPanel 状态，但渲染为浮层内嵌布局：
 * - 无遮罩/居中卡片，直接填充 FloatingPanel 容器
 * - 动作按钮紧凑排列（摘要/翻译/解释/改写）
 * - 选区预览 + 结果展示在面板内滚动
 * - 复制/应用/重试操作按钮
 */
import { t } from "../i18n/locale.svelte.ts";
import type { AiAction } from "../composables/useAiPanel.svelte.ts";
import { SELECTION_ACTIONS } from "../composables/useAiPanel.svelte.ts";
import type { AiError } from "../composables/aiProvider";
import { renderMarkdown } from "../composables/useMarkdown";
import { copyTextToClipboard } from "../composables/clipboard";

interface Props {
  selectionText: string;
  result: string;
  loading: boolean;
  error: AiError | null;
  activeAction: AiAction | null;
  /** 是否有选区（来自批注工具栏的「AI」按钮） */
  hasExternalSelection?: boolean;
  onRunAction?: (action: AiAction) => void;
  onApplyResult?: () => void;
  onClose?: () => void;
}

let { selectionText, result, loading, error, activeAction, onRunAction, onApplyResult }: Props =
  $props();

const ACTIONS: { id: AiAction; key: string }[] = [
  { id: "summarize", key: "ai.summarize" },
  { id: "translate", key: "ai.translate" },
  { id: "explain", key: "ai.explain" },
  { id: "rewrite", key: "ai.rewrite" },
];

const hasSelection = $derived(selectionText.trim().length > 0);
const isRewrite = $derived(activeAction === "rewrite");
const canApply = $derived(isRewrite && result.trim().length > 0 && !loading);

const errorMessage = $derived.by(() => {
  if (!error) return "";
  const title = t(`ai.error.${error.code}`);
  return error.detail ? `${title}：${error.detail}` : title;
});

let renderedHtml = $state("");

// result 变化即异步渲染 Markdown（原 watch immediate）
$effect(() => {
  const r = result;
  if (!r) {
    renderedHtml = "";
    return;
  }
  renderMarkdown(r)
    .then((html) => {
      renderedHtml = html;
    })
    .catch(() => {
      renderedHtml = "";
    });
});

let copied = $state(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function onCopyResult(): Promise<void> {
  if (!result) return;
  try {
    await copyTextToClipboard(result);
    copied = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 2000);
  } catch {
    copied = false;
  }
}

function onAction(action: AiAction): void {
  if (loading) return;
  if (SELECTION_ACTIONS.has(action) && !hasSelection) return;
  onRunAction?.(action);
}

/* 动作按钮：可用态带 hover 换色，禁用态互斥（原 :disabled / .disabled 选择器） */
const BTN_BASE =
  "ai-inline-btn cursor-pointer rounded-[5px] border border-border bg-bg-btn px-2.5 py-1 " +
  "text-[12px] text-fg transition-[background-color] duration-[120ms] ease-[ease] hover:bg-bg-btn-hover";
const BTN_DISABLED =
  "ai-inline-btn cursor-not-allowed rounded-[5px] border border-border bg-bg-btn px-2.5 py-1 " +
  "text-[12px] text-fg opacity-45 transition-[background-color] duration-[120ms] ease-[ease]";

function btnCls(id: AiAction): string {
  const disabled = loading || (SELECTION_ACTIONS.has(id) && !hasSelection);
  return disabled ? BTN_DISABLED : BTN_BASE;
}

/* 结果区两个按钮：apply 覆盖边框/文字色（原 .ai-inline-apply 选择器） */
const COPY_CLS =
  "ai-inline-copy cursor-pointer rounded border border-border bg-bg-btn px-2.5 py-0.5 text-[11px] text-fg";
const APPLY_CLS =
  "ai-inline-apply cursor-pointer rounded border border-critic-ins-color bg-bg-btn px-2.5 py-0.5 text-[11px] text-critic-ins-color";
</script>

<div class="ai-inline flex min-h-0 flex-1 flex-col text-[13px]">
  <div class="ai-inline-header flex shrink-0 items-center gap-2 border-b border-float-panel-header-border px-4 pb-2 pt-3">
    <span class="ai-inline-title text-[12px] uppercase tracking-[0.6px] text-float-panel-header-fg">{t("ai.title")}</span>
    {#if loading}
      <span class="ai-inline-loading text-[11px] text-link animate-[aiPulse_1.2s_ease-in-out_infinite]">{t("ai.loading")}</span>
    {/if}
  </div>

  <div class="ai-inline-body flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3 pt-2">
    <!-- 选区预览 -->
    <div class="ai-inline-section flex flex-col gap-2">
      <div class="ai-inline-selection flex max-h-[60px] items-baseline gap-1.5 overflow-auto rounded-[5px] border border-border bg-bg-btn px-2.5 py-1.5 text-[12px]" data-test="selection">
        {#if hasSelection}
          <span class="ai-inline-sel-label shrink-0 text-[11px] text-fg-muted">{t("ai.selection")}</span>
          <span class="ai-inline-sel-text whitespace-pre-wrap text-[12px] [word-break:break-word]">{selectionText}</span>
        {:else}
          <span class="ai-inline-sel-empty text-[12px] text-fg-muted">
            {t("ai.noSelection")}
          </span>
        {/if}
      </div>
      <div class="ai-inline-actions flex flex-wrap gap-1">
        {#each ACTIONS as a (a.id)}
          <button
            class={btnCls(a.id)}
            data-action={a.id}
            disabled={loading || (SELECTION_ACTIONS.has(a.id) && !hasSelection)}
            onclick={() => onAction(a.id)}
          >
            {t(a.key)}
          </button>
        {/each}
      </div>
    </div>

    <!-- 错误态 -->
    {#if error}
      <div
        class="ai-inline-error flex items-center gap-2 rounded-[5px] border border-[color:color-mix(in_srgb,var(--mdr-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--mdr-danger)_8%,transparent)] px-2.5 py-1.5 text-[12px]"
        data-test="error"
      >
        <span class="ai-inline-error-msg min-w-0 flex-1 text-critic-del-color [word-break:break-word]">{errorMessage}</span>
        {#if activeAction}
          <button
            class="ai-inline-retry shrink-0 cursor-pointer rounded border border-border bg-bg-btn px-2 py-0.5 text-[11px] text-fg"
            data-action="retry"
            onclick={() => onRunAction?.(activeAction)}
          >
            {t("ai.retry")}
          </button>
        {/if}
      </div>
    {/if}

    <!-- 结果区 -->
    {#if result}
      <div class="ai-inline-result flex flex-col gap-1.5 border-t border-border pt-2" data-test="result">
        <div class="ai-inline-result-actions flex justify-end gap-1.5">
          <button class={COPY_CLS} data-action="copy" onclick={onCopyResult}>
            {copied ? t("ai.copied") : t("ai.copy")}
          </button>
          {#if canApply}
            <button class={APPLY_CLS} data-action="apply" onclick={() => onApplyResult?.()}>
              {t("ai.apply")}
            </button>
          {/if}
        </div>
        {#if renderedHtml}
          <div class="ai-inline-result-html markdown-body text-[13px] leading-[1.5]">{@html renderedHtml}</div>
        {:else}
          <pre class="ai-inline-result-plain m-0 whitespace-pre-wrap rounded-[5px] border border-border bg-bg-btn px-2.5 py-1.5 text-[12px] [font-family:var(--editor-font-family,monospace)] [word-break:break-word]">{result}</pre>
        {/if}
      </div>
    {/if}
  </div>
</div>
