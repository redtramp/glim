<script lang="ts">
/**
 * AiPanel.svelte — 内置 AI 面板（Phase 3，Vue → Svelte 5 迁移）。
 *
 * 交互结构复用 DiffView（overlay 遮罩 + 居中卡片 + 头部关闭）:
 * - 输入区:选区预览(只读截断) + 动作按钮(摘要/翻译/解释/按批注改写);
 *   摘要/翻译/解释需要选区,无选区时禁用;「按批注改写」作用于全文;
 * - 输出区:结果经 renderMarkdown(现有 Worker + DOMPurify 管线)渲染,
 *   提供「复制结果」;改写动作额外提供「应用到文档」;
 * - 错误态:按 AiError.code 映射 i18n 文案 + detail,提供重试;
 * - 关闭/中止由 App.vue 侧 useAiPanel 处理(本组件只回调 onClose)。
 *
 * 组件是「展示 + 事件」纯组件,动作编排与网络在 App.vue / useAiPanel 侧,便于单测。
 *
 * 迁移要点:
 * - defineEmits(run-action/apply-result/close) → 回调 props onRunAction/onApplyResult/onClose
 * - computed → $derived；ref + watch(immediate) → $state + $effect（异步渲染 Markdown）
 * - 遮罩点击关闭：原 @click + 内层 .stop → 遮罩 e.target===e.currentTarget 判定（等价）
 * - <style scoped> 全量转工具类；选区/动作按钮用「可用/禁用」互斥类串避免 hover 冲突
 */
import { t } from "../i18n/locale.svelte.ts";
import type { AiAction } from "../composables/useAiPanel.svelte.ts";
import { SELECTION_ACTIONS } from "../composables/useAiPanel.svelte.ts";
import type { AiError } from "../composables/aiProvider";
import { renderMarkdown } from "../composables/useMarkdown";
import { copyTextToClipboard } from "../composables/clipboard";

interface Props {
  visible: boolean;
  selectionText: string;
  result: string;
  loading: boolean;
  error: AiError | null;
  activeAction: AiAction | null;
  onRunAction?: (action: AiAction) => void;
  onApplyResult?: () => void;
  onClose?: () => void;
}

let { visible, selectionText, result, loading, error, activeAction, onRunAction, onApplyResult, onClose }: Props =
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

/** 错误标题:按 code 映射 i18n 文案;detail 追加展示 */
const errorMessage = $derived.by(() => {
  if (!error) return "";
  const title = t(`ai.error.${error.code}`);
  return error.detail ? `${title}：${error.detail}` : title;
});

let renderedHtml = $state("");

// result 变化即异步渲染 Markdown（原 watch immediate；失败兜底为空走纯文本区）
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

/** 遮罩点击关闭（等价原 overlay @click + 内层 @click.stop） */
function onOverlayClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) onClose?.();
}

/* 动作按钮：可用态带 hover 换色，禁用态互斥（原 :disabled / .disabled 选择器） */
const ACTION_BASE =
  "ai-action cursor-pointer rounded-md border border-border bg-bg-btn px-3.5 py-[5px] " +
  "text-[13px] text-fg hover:bg-bg-btn-hover";
const ACTION_DISABLED =
  "ai-action cursor-not-allowed rounded-md border border-border bg-bg-btn px-3.5 py-[5px] " +
  "text-[13px] text-fg opacity-45";

function actionCls(id: AiAction): string {
  return loading || (SELECTION_ACTIONS.has(id) && !hasSelection)
    ? ACTION_DISABLED
    : ACTION_BASE;
}

/* 结果区两个按钮：共享底座，apply 覆盖边框/文字色（原 .ai-result-actions .ai-apply） */
const RESULT_BTN =
  "cursor-pointer rounded-[5px] border border-border bg-bg-btn px-3 py-[3px] text-[12px] text-fg";
const APPLY_BTN =
  "cursor-pointer rounded-[5px] border border-critic-ins-color bg-bg-btn px-3 py-[3px] text-[12px] text-critic-ins-color";
</script>

{#if visible}
  <div class="ai-overlay fixed inset-0 z-[103] flex items-center justify-center bg-overlay" role="presentation" onclick={onOverlayClick}>
    <div class="ai-view flex max-h-[80vh] w-[min(720px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-bg text-fg shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
      <div class="ai-header flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 class="ai-title m-0 text-[15px] font-semibold">{t("ai.title")}</h3>
        {#if loading}
          <span class="ai-loading text-[12px] text-link">{t("ai.loading")}</span>
        {/if}
        <button class="ai-close ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent p-0 text-fg-muted hover:bg-bg-btn-hover hover:text-fg" data-action="close" aria-label={t("ai.close")} onclick={() => onClose?.()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="ai-body flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3">
        <div class="ai-section flex flex-col">
          <div class="ai-selection flex max-h-[72px] items-baseline gap-2 overflow-auto rounded-md border border-border bg-bg-btn px-2.5 py-2 text-[13px]" data-test="selection">
            {#if hasSelection}
              <span class="ai-selection-label shrink-0 text-[12px] text-fg-muted">{t("ai.selection")}</span>
              <span class="ai-selection-text whitespace-pre-wrap [word-break:break-word]">{selectionText}</span>
            {:else}
              <span class="ai-selection-empty text-[13px] text-fg-muted">{t("ai.noSelection")}</span>
            {/if}
          </div>
          <div class="ai-actions mt-2 flex flex-wrap gap-2">
            {#each ACTIONS as a (a.id)}
              <button
                class={actionCls(a.id)}
                data-action={a.id}
                disabled={loading || (SELECTION_ACTIONS.has(a.id) && !hasSelection)}
                onclick={() => onAction(a.id)}
              >
                {t(a.key)}
              </button>
            {/each}
          </div>
        </div>

        {#if error}
          <div class="ai-error flex items-center gap-2.5 rounded-md border border-[color:color-mix(in_srgb,var(--mdr-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--mdr-danger)_8%,transparent)] px-3 py-2 text-[13px]" data-test="error">
            <span class="ai-error-msg min-w-0 flex-1 text-critic-del-color [word-break:break-word]">{errorMessage}</span>
            {#if activeAction}
              <button class="ai-retry shrink-0 cursor-pointer rounded-[5px] border border-border bg-bg-btn px-2.5 py-[3px] text-[12px] text-fg" data-action="retry" onclick={() => onRunAction?.(activeAction)}>
                {t("ai.retry")}
              </button>
            {/if}
          </div>
        {/if}

        {#if result}
          <div class="ai-result flex flex-col gap-2 border-t border-border pt-2.5" data-test="result">
            <div class="ai-result-actions flex justify-end gap-2">
              <button class={RESULT_BTN} data-action="copy" onclick={onCopyResult}>
                {copied ? t("ai.copied") : t("ai.copy")}
              </button>
              {#if canApply}
                <button class={APPLY_BTN} data-action="apply" onclick={() => onApplyResult?.()}>
                  {t("ai.apply")}
                </button>
              {/if}
            </div>
            {#if renderedHtml}
              <div class="ai-result-html markdown-body text-[14px] leading-[1.6]">{@html renderedHtml}</div>
            {:else}
              <pre class="ai-result-plain m-0 whitespace-pre-wrap rounded-md border border-border bg-bg-btn px-2.5 py-2 text-[13px] [font-family:var(--editor-font-family,monospace)] [word-break:break-word]">{result}</pre>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
