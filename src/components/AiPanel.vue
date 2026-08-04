<script setup lang="ts">
/**
 * AiPanel.vue — 内置 AI 面板（Phase 3）。
 *
 * 交互结构复用 DiffView（overlay 遮罩 + 居中卡片 + 头部关闭）:
 * - 输入区:选区预览(只读截断) + 动作按钮(摘要/翻译/解释/按批注改写);
 *   摘要/翻译/解释需要选区,无选区时禁用;「按批注改写」作用于全文;
 * - 输出区:结果经 renderMarkdown(现有 Worker + DOMPurify 管线)渲染,
 *   提供「复制结果」;改写动作额外提供「应用到文档」;
 * - 错误态:按 AiError.code 映射 i18n 文案 + detail,提供重试;
 * - 关闭/中止由 App.vue 侧 useAiPanel 处理(本组件只 emit close)。
 *
 * 组件是「展示 + 事件」纯组件,动作编排与网络在 App.vue / useAiPanel 侧,便于单测。
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AiAction } from "../composables/useAiPanel";
import { SELECTION_ACTIONS } from "../composables/useAiPanel";
import type { AiError } from "../composables/aiProvider";
import { renderMarkdown } from "../composables/useMarkdown";
import { copyTextToClipboard } from "../composables/clipboard";

const props = defineProps<{
  visible: boolean;
  selectionText: string;
  result: string;
  loading: boolean;
  error: AiError | null;
  activeAction: AiAction | null;
}>();

const emit = defineEmits<{
  (e: "run-action", action: AiAction): void;
  (e: "apply-result"): void;
  (e: "close"): void;
}>();

const { t } = useI18n();

const ACTIONS: { id: AiAction; key: string }[] = [
  { id: "summarize", key: "ai.summarize" },
  { id: "translate", key: "ai.translate" },
  { id: "explain", key: "ai.explain" },
  { id: "rewrite", key: "ai.rewrite" },
];

const hasSelection = computed(() => props.selectionText.trim().length > 0);
const isRewrite = computed(() => props.activeAction === "rewrite");
const canApply = computed(
  () => isRewrite.value && props.result.trim().length > 0 && !props.loading
);

/** 错误标题:按 code 映射 i18n 文案;detail 追加展示 */
const errorMessage = computed(() => {
  if (!props.error) return "";
  const title = t(`ai.error.${props.error.code}`);
  return props.error.detail ? `${title}：${props.error.detail}` : title;
});

/** 结果 markdown 渲染(异步,复用 Worker + DOMPurify 管线);immediate 覆盖已带结果打开/切换动作的场景 */
const renderedHtml = ref("");
watch(
  () => props.result,
  async (result) => {
    if (!result) {
      renderedHtml.value = "";
      return;
    }
    try {
      renderedHtml.value = await renderMarkdown(result);
    } catch {
      // 渲染失败兜底:按纯文本展示,不让整个结果区空白
      renderedHtml.value = "";
    }
  },
  { immediate: true }
);

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
async function onCopyResult(): Promise<void> {
  if (!props.result) return;
  try {
    await copyTextToClipboard(props.result);
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    copied.value = false;
  }
}

function onAction(action: AiAction): void {
  if (props.loading) return;
  if (SELECTION_ACTIONS.has(action) && !hasSelection.value) return;
  emit("run-action", action);
}
</script>

<template>
  <div v-if="visible" class="ai-overlay" @click="emit('close')">
    <div class="ai-view" @click.stop>
      <div class="ai-header">
        <h3 class="ai-title">{{ t("ai.title") }}</h3>
        <span v-if="loading" class="ai-loading">{{ t("ai.loading") }}</span>
        <button class="ai-close" data-action="close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="ai-body">
        <div class="ai-section">
          <div class="ai-selection" data-test="selection">
            <template v-if="hasSelection">
              <span class="ai-selection-label">{{ t("ai.selection") }}</span>
              <span class="ai-selection-text">{{ selectionText }}</span>
            </template>
            <span v-else class="ai-selection-empty">{{ t("ai.noSelection") }}</span>
          </div>
          <div class="ai-actions">
            <button
              v-for="a in ACTIONS"
              :key="a.id"
              class="ai-action"
              :class="{ disabled: SELECTION_ACTIONS.has(a.id) && !hasSelection }"
              :data-action="a.id"
              :disabled="loading || (SELECTION_ACTIONS.has(a.id) && !hasSelection)"
              @click="onAction(a.id)"
            >
              {{ t(a.key) }}
            </button>
          </div>
        </div>

        <div v-if="error" class="ai-error" data-test="error">
          <span class="ai-error-msg">{{ errorMessage }}</span>
          <button
            v-if="activeAction"
            class="ai-retry"
            data-action="retry"
            @click="emit('run-action', activeAction)"
          >
            {{ t("ai.retry") }}
          </button>
        </div>

        <div v-if="result" class="ai-result" data-test="result">
          <div class="ai-result-actions">
            <button class="ai-copy" data-action="copy" @click="onCopyResult">
              {{ copied ? t("ai.copied") : t("ai.copy") }}
            </button>
            <button
              v-if="canApply"
              class="ai-apply"
              data-action="apply"
              @click="emit('apply-result')"
            >
              {{ t("ai.apply") }}
            </button>
          </div>
          <div v-if="renderedHtml" class="ai-result-html markdown-body" v-html="renderedHtml"></div>
          <pre v-else class="ai-result-plain">{{ result }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-overlay {
  position: fixed;
  inset: 0;
  z-index: 103;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-view {
  width: min(720px, 92vw);
  max-height: 80vh;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.ai-loading {
  font-size: 12px;
  color: var(--link);
}

.ai-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
}

.ai-close:hover {
  background: var(--bg-btn-hover);
  color: var(--fg);
}

.ai-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-selection {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-btn);
  font-size: 13px;
  max-height: 72px;
  overflow: auto;
}

.ai-selection-label {
  flex: 0 0 auto;
  color: var(--fg-muted);
  font-size: 12px;
}

.ai-selection-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-selection-empty {
  color: var(--fg-muted);
  font-size: 13px;
}

.ai-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.ai-action {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.ai-action:hover:not(:disabled) {
  background: var(--bg-btn-hover);
}

.ai-action:disabled,
.ai-action.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--mdr-danger) 35%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--mdr-danger) 8%, transparent);
  font-size: 13px;
}

.ai-error-msg {
  flex: 1 1 auto;
  color: var(--critic-del-color, #dc2626);
  word-break: break-word;
}

.ai-retry {
  flex: 0 0 auto;
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.ai-result {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-result-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.ai-result-actions button {
  padding: 3px 12px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.ai-result-actions .ai-apply {
  border-color: var(--critic-ins-color, #16a34a);
  color: var(--critic-ins-color, #16a34a);
}

.ai-result-html {
  font-size: 14px;
  line-height: 1.6;
}

.ai-result-plain {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-btn);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--editor-font-family, monospace);
  font-size: 13px;
}
</style>
