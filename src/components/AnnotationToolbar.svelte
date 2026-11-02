<script lang="ts">
/**
 * AnnotationToolbar.svelte — CriticMarkup 批注浮动工具栏（Vue → Svelte 5 迁移）。
 *
 * 交互:
 * - 删除 / 高亮即时执行:点击直接回调 onApply(type)
 * - 新增 / 替换 / 评论需要输入:点击回调 onInputStart(type),
 *   父组件把 mode 切到对应类型后,本组件展开输入弹层(输入框 + 确定/取消)
 * - 复制给 AI / 清除全部 / 审阅 / AI 面板:分别回调对应事件
 *
 * 布局(方案 B):三带横排左标签 —— 剪贴板 / AI / 批注 三类分三行,
 * 左侧组名竖排小标签,右侧按钮横向排布自动换行;AI 组强调色突出。
 *
 * 定位:基于父组件传入的选区坐标 (x, y)(x=选区中心、y=选区底部),
 * 组件自测尺寸后做视口夹紧与下方放不下时翻转到上方。
 *
 * 迁移要点:
 * - 9 个 defineEmits → 同名回调 props（copy-ai → onCopyAi）
 * - watch([visible,x,y,mode]) 非 immediate → $effect + skip_first_run；
 *   依赖必须在 effect 内同步读取（await 之后的读取不会被追踪）
 * - 按钮 hover 配色为同名属性 → 按类型拆互斥类串（BTN_*）
 * - @keyframes at-pop 全局化到 app.css，根浮层用 animate-[atPop_...]
 */
import { tick } from "svelte";
import { t } from "../i18n/locale.svelte.ts";
import type { CriticType } from "../composables/criticMarkup";
import { computeToolbarPosition } from "../composables/toolbarPosition";

export type AnnotationToolbarMode = "" | CriticType;

interface Props {
  visible: boolean;
  x: number;
  y: number;
  mode: AnnotationToolbarMode;
  onApply?: (type: CriticType, payload?: string) => void;
  onInputStart?: (type: CriticType) => void;
  onCancel?: () => void;
  onCopyAi?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onClearAll?: () => void;
  onReview?: () => void;
  onAi?: () => void;
}

let {
  visible,
  x,
  y,
  mode,
  onApply,
  onInputStart,
  onCancel,
  onCopyAi,
  onCopy,
  onPaste,
  onClearAll,
  onReview,
  onAi,
}: Props = $props();

let root: HTMLElement | null = $state(null);
let inputEl: HTMLInputElement | null = $state(null);
let inputText = $state("");
let pos = $state({ left: 0, top: 0 });

/** 需要输入内容的批注类型 */
const INPUT_TYPES: ReadonlySet<CriticType> = new Set(["ins", "sub", "comment"]);

const isInputMode = $derived(mode !== "" && INPUT_TYPES.has(mode));

function reposition(cx: number, cy: number): void {
  if (!root) return;
  const rect = root.getBoundingClientRect();
  pos = computeToolbarPosition({
    x: cx,
    y: cy,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

// 坐标/模式变化时重新定位并聚焦（原 watch([...]) 非 immediate → 首跑跳过）
let firstRun = true;
$effect(() => {
  // 同步读取建立依赖；await 之后的读取不会被追踪
  const show = visible;
  const cx = x;
  const cy = y;
  const m = mode;
  if (firstRun) {
    firstRun = false;
    return;
  }
  if (!show) return;
  void (async () => {
    await tick();
    reposition(cx, cy);
    if (m !== "" && INPUT_TYPES.has(m)) {
      inputText = "";
      await tick();
      inputEl?.focus();
    }
  })();
});

function onAction(type: CriticType): void {
  if (INPUT_TYPES.has(type)) {
    onInputStart?.(type);
  } else {
    onApply?.(type);
  }
}

function confirmInput(): void {
  const payload = inputText.trim();
  if (!mode || !payload) return;
  onApply?.(mode, payload);
}

function cancelInput(): void {
  onCancel?.();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") confirmInput();
  else if (e.key === "Escape") cancelInput();
}

/* 根浮层：毛玻璃 + 暗色覆盖（原 .annotation-toolbar 与 :root[data-theme=dark] 覆盖） */
const ROOT =
  "annotation-toolbar fixed z-[46] flex flex-col gap-0 p-2 " +
  "min-w-[272px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto " +
  "bg-[rgba(255,255,255,0.82)] backdrop-blur-[18px] backdrop-saturate-[1.3] " +
  "border border-[rgba(0,0,0,0.08)] rounded-[14px] " +
  "shadow-[0_12px_32px_rgba(30,40,30,0.12),0_2px_8px_rgba(30,40,30,0.06)] " +
  "text-[13px] animate-[atPop_0.16s_cubic-bezier(0.16,1,0.3,1)] " +
  "[--at-ai-color:#6d28d9] " +
  "dark:bg-[rgba(30,34,30,0.78)] dark:border-[rgba(255,255,255,0.08)] " +
  "dark:shadow-[0_12px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)] " +
  "dark:[--at-ai-color:#a78bfa]";

/* 三带：普通带 / 第二三带带顶部分隔线（原 .at-band 与 .at-band + .at-band） */
const BAND = "at-band flex items-start gap-2.5 px-0.5 py-1";
const BAND_SEP =
  BAND + " border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]";

/* 组名标签：AI 带换强调色 + 不透明度 1（原 .at-band-ai .at-band-label） */
const LABEL =
  "at-band-label w-11 grow-0 shrink-0 pt-[7px] text-[10px] font-semibold " +
  "tracking-[1px] text-fg-muted uppercase opacity-85 select-none";
const LABEL_AI =
  "at-band-label w-11 grow-0 shrink-0 pt-[7px] text-[10px] font-semibold " +
  "tracking-[1px] text-[color:var(--at-ai-color)] uppercase opacity-100 select-none";

/* 按钮底座：不含前景色/光标，由各类型补齐，避免同名属性冲突 */
const BTN_BASE =
  "at-btn inline-flex items-center justify-center border border-transparent rounded-lg " +
  "bg-transparent px-2.5 py-1.5 text-[13px] whitespace-nowrap " +
  "transition-[background-color,color,border-color,box-shadow] duration-[120ms] ease-[ease]";
const BTN_DEFAULT = BTN_BASE + " cursor-pointer text-fg hover:bg-bg-btn-hover";
const BTN_DISABLED =
  BTN_BASE + " cursor-not-allowed text-fg hover:bg-bg-btn-hover opacity-45";
const BTN_DEL =
  BTN_BASE + " cursor-pointer text-fg hover:text-critic-del-color hover:bg-critic-del-bg";
const BTN_INS =
  BTN_BASE + " cursor-pointer text-fg hover:text-critic-ins-color hover:bg-critic-ins-bg";
const BTN_SUB =
  BTN_BASE +
  " cursor-pointer text-fg hover:text-critic-comment-color hover:bg-critic-comment-bg";
const BTN_HL =
  BTN_BASE + " cursor-pointer text-fg hover:text-critic-hl-fg hover:bg-critic-hl-bg";
const BTN_COMMENT = BTN_SUB;
/** 复制给 AI：默认弱化前景，悬停转强调色（原 .at-copy / .at-copy:hover） */
const BTN_COPY =
  BTN_BASE +
  " cursor-pointer text-fg-muted hover:text-[color:var(--at-ai-color)]" +
  " hover:bg-[color-mix(in_srgb,var(--at-ai-color)_8%,transparent)]";
const BTN_CLEAR = BTN_DEL;
const BTN_REVIEW =
  BTN_BASE + " cursor-pointer text-fg hover:text-link hover:bg-bg-active";
/* AI 组强调按钮：常态即带强调色底/边，悬停加深 + 光环（原 .at-band-ai .at-ai(:hover)） */
const BTN_AI =
  BTN_BASE +
  " cursor-pointer text-[color:var(--at-ai-color)]" +
  " bg-[color-mix(in_srgb,var(--at-ai-color)_8%,transparent)]" +
  " border-[color-mix(in_srgb,var(--at-ai-color)_35%,transparent)]" +
  " hover:bg-[color-mix(in_srgb,var(--at-ai-color)_14%,transparent)]" +
  " hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--at-ai-color)_12%,transparent)]";
/** 输入弹层两按钮均分宽度（原 .at-input-actions .at-btn { flex: 1 1 0 }） */
const BTN_WIDE = BTN_DEFAULT + " flex-1";
const BTN_WIDE_OFF = BTN_DISABLED + " flex-1";
</script>

{#if visible}
  <div
    class={ROOT}
    style="left: {pos.left}px; top: {pos.top}px"
    role="toolbar"
    tabindex="-1"
    aria-label="critic markup"
    bind:this={root}
    onmousedown={(e) => e.preventDefault()}
  >
    {#if !isInputMode}
      <!-- 第一带：剪贴板 -->
      <div class={BAND}>
        <span class={LABEL}>{t("annotation.groupClipboard")}</span>
        <div class="at-band-items flex-auto min-w-0 flex flex-wrap gap-[3px]">
          <button class="{BTN_DEFAULT} at-copy-plain" title={t("annotation.copyPlain")} onclick={() => onCopy?.()}>
            {t("annotation.copyPlain")}
          </button>
          <button class="{BTN_DEFAULT} at-paste" title={t("annotation.paste")} onclick={() => onPaste?.()}>
            {t("annotation.paste")}
          </button>
        </div>
      </div>

      <!-- 第二带：AI（强调色） -->
      <div class="{BAND} at-band-ai">
        <span class={LABEL_AI}>{t("annotation.groupAI")}</span>
        <div class="at-band-items flex-auto min-w-0 flex flex-wrap gap-[3px]">
          <button class="{BTN_AI} at-ai" title={t("ai.title")} onclick={() => onAi?.()}>
            ✦ {t("ai.title")}
          </button>
        </div>
      </div>

      <!-- 第三带：批注（其余） -->
      <div class={BAND_SEP}>
        <span class={LABEL}>{t("annotation.groupAnnotations")}</span>
        <div class="at-band-items flex-auto min-w-0 flex flex-wrap gap-[3px]">
          <button class="{BTN_DEL} at-del" title={t("annotation.del")} onclick={() => onAction("del")}>
            {t("annotation.del")}
          </button>
          <button class="{BTN_INS} at-ins" title={t("annotation.ins")} onclick={() => onAction("ins")}>
            {t("annotation.ins")}
          </button>
          <button class="{BTN_SUB} at-sub" title={t("annotation.sub")} onclick={() => onAction("sub")}>
            {t("annotation.sub")}
          </button>
          <button class="{BTN_HL} at-hl" title={t("annotation.hl")} onclick={() => onAction("hl")}>
            {t("annotation.hl")}
          </button>
          <button
            class="{BTN_COMMENT} at-comment"
            title={t("annotation.comment")}
            onclick={() => onAction("comment")}
          >
            {t("annotation.comment")}
          </button>
          <span
            class="at-sep w-px h-[18px] self-center mx-0.5 grow-0 shrink-0 bg-border opacity-60"
            aria-hidden="true"
          ></span>
          <button class="{BTN_COPY} at-copy" title={t("annotation.copyAI")} onclick={() => onCopyAi?.()}>
            {t("annotation.copyAI")}
          </button>
          <button class="{BTN_CLEAR} at-clear" title={t("annotation.clearAll")} onclick={() => onClearAll?.()}>
            {t("annotation.clearAll")}
          </button>
          <button class="{BTN_REVIEW} at-review" title={t("annotation.review")} onclick={() => onReview?.()}>
            {t("annotation.review")}
          </button>
        </div>
      </div>
    {:else}
      <input
        bind:this={inputEl}
        bind:value={inputText}
        class="at-input w-[220px] px-2.5 py-1.5 border border-border rounded-lg bg-bg-btn text-fg text-[13px] outline-none focus:border-[color:var(--at-ai-color)]"
        onmousedown={(e) => e.stopPropagation()}
        onkeydown={onKeydown}
        placeholder={mode === "sub"
          ? t("annotation.subPlaceholder")
          : mode === "comment"
            ? t("annotation.commentPlaceholder")
            : t("annotation.inputPlaceholder")}
      />
      <div class="at-input-actions flex gap-1 mt-0.5">
        <button class="{inputText.trim() ? BTN_WIDE : BTN_WIDE_OFF} at-confirm" disabled={!inputText.trim()} onclick={confirmInput}>
          {t("annotation.confirm")}
        </button>
        <button class="{BTN_WIDE} at-cancel" onclick={cancelInput}>
          {t("annotation.cancel")}
        </button>
      </div>
    {/if}
  </div>
{/if}
