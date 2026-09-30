<script lang="ts">
/**
 * ReviewPanel.svelte — CriticMarkup 审阅面板（Accept/Reject）。
 *
 * 交互结构复用 DiffView（overlay 遮罩 + 居中卡片 + 头部关闭）：
 * - 面板持有 source（由 App 透传当前 draftContent），内部实时 parseCriticMarkup，
 *   source 变化自动重解析 → 逐条操作后的位置偏移天然消除；
 * - 每条批注:类型标签 + 行号 + 旧/新内容 + 接受/拒绝按钮；
 * - 顶部工具条:全部接受 / 全部拒绝 / 剩余条数；
 * - 点击条目触发 onFocus(id) 由 App 滚动到对应行；决策结果由 App 计算并 setSource。
 *
 * 组件本身是「展示 + 事件」纯组件：决策逻辑（applyDecision / acceptAll）在
 * App.vue 侧，便于单测（props/emits）与复用。
 */
import { t } from "../i18n/locale.svelte.ts";
import { parseCriticMarkup, type CriticType } from "../composables/criticMarkup";

interface Props {
  visible: boolean;
  source: string;
  fileName: string;
  onApply?: (decision: "accept" | "reject", id: number) => void;
  onApplyAll?: (decision: "accept" | "reject") => void;
  onFocus?: (id: number) => void;
  onClose?: () => void;
}

let { visible, source, fileName, onApply, onApplyAll, onFocus, onClose }: Props =
  $props();

/** 仅在可见时解析,避免面板关闭时反复扫描大文档 */
const annotations = $derived(visible ? parseCriticMarkup(source) : []);

const TYPE_LABELS: Record<CriticType, string> = {
  del: "review.typeDel",
  ins: "review.typeIns",
  sub: "review.typeSub",
  hl: "review.typeHl",
  comment: "review.typeComment",
};

/* 类型 → 类型标签配色（互斥串，同名 bg-* 不会同时出现） */
const TYPE_CLS: Record<CriticType, string> = {
  del: "text-critic-del-color bg-critic-del-bg",
  ins: "text-critic-ins-color bg-critic-ins-bg",
  sub: "text-critic-ins-color bg-critic-ins-bg",
  hl: "text-critic-hl-fg bg-critic-hl-bg",
  comment: "text-critic-comment-color bg-critic-comment-bg",
};

const count = $derived(annotations.length);

function stopPropagation(e: MouseEvent): void {
  e.stopPropagation();
}
</script>

{#if visible}
  <div
    class="rv-overlay fixed inset-0 z-[102] flex items-center justify-center bg-overlay"
    role="presentation"
    onclick={onClose}
  >
    <div
      class="rv-view flex max-h-[82vh] w-[min(760px,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-bg text-fg shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      role="presentation"
      onclick={stopPropagation}
    >
      <div class="rv-header flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 class="rv-title m-0 text-[15px] font-semibold">{t("review.title")}</h3>
        <span
          class="rv-filename flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[13px] text-fg-muted"
          >{fileName}</span
        >
        <span class="rv-count whitespace-nowrap text-[12px] text-fg-muted"
          >{t("review.count", { n: count })}</span
        >
        <button
          class="rv-close flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-fg-muted transition-[color,background-color] duration-150 ease-[ease] hover:bg-bg-btn-hover hover:text-fg"
          data-action="close"
          aria-label={t("review.close")}
          onclick={() => onClose?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="rv-toolbar flex gap-2 border-b border-border px-4 py-2.5">
        <button
          class="btn cursor-pointer rounded-[5px] border border-border bg-bg-btn px-3 py-1 text-[12px] text-fg hover:bg-bg-btn-hover"
          data-action="accept-all"
          onclick={() => onApplyAll?.("accept")}
        >
          {t("review.acceptAll")}
        </button>
        <button
          class="btn cursor-pointer rounded-[5px] border border-border bg-bg-btn px-3 py-1 text-[12px] text-fg hover:bg-bg-btn-hover"
          data-action="reject-all"
          onclick={() => onApplyAll?.("reject")}
        >
          {t("review.rejectAll")}
        </button>
      </div>

      <div class="rv-content flex-1 overflow-auto py-2">
        {#if count === 0}
          <div class="rv-empty p-6 text-center text-[13px] text-fg-muted">
            {t("review.empty")}
          </div>
        {:else}
          <div class="rv-list flex flex-col">
            {#each annotations as ann (ann.id)}
              <div
                class="rv-item flex cursor-pointer items-center gap-2.5 border-b border-border px-4 py-2 text-[13px] transition-[background-color] duration-[120ms] ease-[ease] hover:bg-bg-btn-hover rv-item-{ann.type}"
                data-ann-id={ann.id}
                role="presentation"
                onclick={() => onFocus?.(ann.id)}
              >
                <span
                  class="rv-type w-11 shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-center text-[12px] {TYPE_CLS[ann.type]}"
                  >{t(TYPE_LABELS[ann.type])}</span
                >
                <span class="rv-line w-12 shrink-0 text-[12px] text-fg-muted [font-family:var(--editor-font-family,monospace)]"
                  >L{ann.line}</span
                >
                <div class="rv-text flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-pre-wrap [word-break:break-word]">
                  {#if ann.type === "comment"}
                    <span class="rv-comment italic text-critic-comment-color">💬 {ann.newText}</span>
                  {:else if ann.type === "sub"}
                    <span class="rv-old line-through text-critic-del-color">{ann.oldText}</span>
                    <span class="rv-arrow text-fg-muted">→</span>
                    <span class="rv-new text-critic-ins-color">{ann.newText}</span>
                  {:else if ann.type === "ins"}
                    <span class="rv-new text-critic-ins-color">{ann.newText}</span>
                  {:else if ann.type === "hl"}
                    <span class="rv-hl rounded-sm bg-critic-hl-bg px-0.5 text-critic-hl-fg">{ann.oldText}</span>
                  {:else}
                    <span class="rv-old line-through text-critic-del-color">{ann.oldText}</span>
                  {/if}
                </div>
                <div class="rv-actions flex shrink-0 gap-1.5" role="presentation" onclick={stopPropagation}>
                  <button
                    class="rv-accept cursor-pointer rounded-[5px] border border-border bg-bg-btn px-2.5 py-[3px] text-[12px] text-fg hover:bg-critic-ins-bg hover:text-critic-ins-color"
                    data-action={"accept-" + ann.id}
                    onclick={() => onApply?.("accept", ann.id)}
                  >
                    {t("review.accept")}
                  </button>
                  <button
                    class="rv-reject cursor-pointer rounded-[5px] border border-border bg-bg-btn px-2.5 py-[3px] text-[12px] text-fg hover:bg-critic-del-bg hover:text-critic-del-color"
                    data-action={"reject-" + ann.id}
                    onclick={() => onApply?.("reject", ann.id)}
                  >
                    {t("review.reject")}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
