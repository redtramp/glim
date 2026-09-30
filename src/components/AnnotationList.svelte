<script lang="ts">
/**
 * AnnotationList.svelte — ✏️ 批注列表浮层面板。
 *
 * 显示当前文档所有 CriticMarkup 批注，按类型分组，点击跳转到对应位置。
 * - 批注数据实时解析自当前文档源文本
 * - 带红色圆点 badge（有未读批注时显示）
 * - 点击条目跳转到批注所在行
 * - 底部固定操作按钮：审阅面板 / 复制给 AI
 */
import { t } from "../i18n/locale.svelte.ts";
import { parseCriticMarkup, type CriticType } from "../composables/criticMarkup";

interface Props {
  /** 当前文档的源文本（含 CriticMarkup 语法） */
  source: string;
  /** 当前文件名（用于显示，沿用 Vue API 保留） */
  fileName?: string;
  onFocus?: (id: number) => void;
  onOpenReview?: () => void;
  onCopyAi?: () => void;
}

let { source, onFocus, onOpenReview, onCopyAi }: Props = $props();

/** 解析所有批注 */
const annotations = $derived(parseCriticMarkup(source));

const count = $derived(annotations.length);

const TYPE_LABELS: Record<CriticType, string> = {
  del: "annotation.del",
  ins: "annotation.ins",
  sub: "annotation.sub",
  hl: "annotation.hl",
  comment: "annotation.comment",
};

const TYPE_ICONS: Record<CriticType, string> = {
  del: "✕",
  ins: "+",
  sub: "⇄",
  hl: "★",
  comment: "💬",
};

/* 分组图标配色（互斥串，同名 text-* 不会同时出现） */
const ICON_CLS: Record<CriticType, string> = {
  del: "text-critic-del-color",
  ins: "text-critic-ins-color",
  sub: "text-critic-ins-color",
  hl: "text-critic-hl-fg",
  comment: "text-critic-comment-color",
};

/** 按类型分组（固定顺序，仅保留存在的类型） */
const grouped = $derived.by(() => {
  const order: CriticType[] = ["del", "ins", "sub", "hl", "comment"];
  return order
    .map((type) => ({
      type,
      items: annotations.filter((ann) => ann.type === type),
      label: t(TYPE_LABELS[type]),
    }))
    .filter((group) => group.items.length > 0);
});

function snippet(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
</script>

<div class="annotation-list flex min-h-0 flex-1 flex-col text-[13px]">
  <div class="al-header flex shrink-0 items-center gap-2 border-b border-float-panel-header-border px-4 pb-2 pt-3">
    <span class="al-title text-[12px] uppercase tracking-[0.6px] text-float-panel-header-fg">{t("float.annotations")}</span>
    {#if count > 0}
      <span class="al-badge inline-flex h-4 min-w-4 items-center justify-center rounded-lg bg-critic-del-color px-1 text-[10px] font-semibold leading-none text-white">{count}</span>
    {/if}
  </div>

  <div class="al-content min-h-0 flex-1 overflow-y-auto">
    {#if count === 0}
      <div class="al-empty flex h-full items-center justify-center p-6 text-center text-[12px] text-fg-muted">
        {t("float.noAnnotations")}
      </div>
    {:else}
      <div class="al-groups flex flex-col py-1">
        {#each grouped as group (group.type)}
          <div class="al-group flex flex-col">
            <div
              class="al-group-header sticky top-0 z-[1] flex items-center gap-1.5 bg-[rgba(255,255,255,0.72)] px-4 pb-1 pt-1.5 text-[11px] text-fg-muted dark:bg-[rgba(24,24,24,0.78)]"
            >
              <span class="al-group-icon w-4 shrink-0 text-center text-[12px] {ICON_CLS[group.type]}">
                {TYPE_ICONS[group.type]}
              </span>
              <span class="al-group-label flex-1 uppercase tracking-[0.4px]">{group.label}</span>
              <span class="al-group-count text-[10px] opacity-60">{group.items.length}</span>
            </div>
            <div class="al-group-items flex flex-col">
              {#each group.items as ann (ann.id)}
                <div
                  class="al-item flex cursor-pointer gap-2 border-l-2 border-l-transparent py-1.5 pl-[38px] pr-4 transition-[background-color,border-color] duration-100 ease-[ease] hover:bg-bg-btn-hover al-item-{ann.type}"
                  data-ann-id={ann.id}
                  role="presentation"
                  onclick={() => onFocus?.(ann.id)}
                >
                  <span class="al-item-line w-9 shrink-0 text-[11px] leading-[1.5] text-fg-muted [font-family:var(--editor-font-family,monospace)]"
                    >L{ann.line}</span
                  >
                  <span class="al-item-text flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap text-ellipsis leading-[1.5]">
                    {#if ann.type === "comment"}
                      💬 {snippet(ann.newText)}
                    {:else if ann.type === "sub"}
                      <span class="al-old line-through text-critic-del-color">{snippet(ann.oldText)}</span>
                      <span class="al-arrow text-[11px] text-fg-muted">→</span>
                      <span class="al-new text-critic-ins-color">{snippet(ann.newText)}</span>
                    {:else if ann.type === "ins"}
                      <span class="al-new text-critic-ins-color">{snippet(ann.newText)}</span>
                    {:else if ann.type === "hl"}
                      <span class="al-hl rounded-sm bg-critic-hl-bg px-0.5 text-critic-hl-fg">{snippet(ann.oldText)}</span>
                    {:else}
                      <span class="al-old line-through text-critic-del-color">{snippet(ann.oldText)}</span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if count > 0}
    <div class="al-footer flex shrink-0 gap-2 border-t border-float-panel-header-border px-4 pb-3 pt-2">
      <button
        class="al-btn flex-1 cursor-pointer rounded-[5px] border border-border bg-bg-btn px-3 py-[5px] text-center text-[12px] text-fg transition-[background-color] duration-[120ms] ease-[ease] hover:bg-bg-btn-hover"
        onclick={() => onOpenReview?.()}
      >
        {t("annotation.review")}
      </button>
      <button
        class="al-btn flex-1 cursor-pointer rounded-[5px] border border-border bg-bg-btn px-3 py-[5px] text-center text-[12px] text-fg transition-[background-color] duration-[120ms] ease-[ease] hover:bg-bg-btn-hover"
        onclick={() => onCopyAi?.()}
      >
        {t("annotation.copyAI")}
      </button>
    </div>
  {/if}
</div>
