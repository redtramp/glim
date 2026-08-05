<script setup lang="ts">
/**
 * AiPanelInline.vue — 🤖 AI 辅助浮层面板（浮层内嵌版）。
 *
 * 与 AiPanel.vue 共享同一 useAiPanel 状态，但渲染为浮层内嵌布局：
 * - 无遮罩/居中卡片，直接填充 FloatingPanel 容器
 * - 动作按钮紧凑排列（摘要/翻译/解释/改写）
 * - 选区预览 + 结果展示在面板内滚动
 * - 复制/应用/重试操作按钮
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AiAction } from "../composables/useAiPanel";
import { SELECTION_ACTIONS } from "../composables/useAiPanel";
import type { AiError } from "../composables/aiProvider";
import { renderMarkdown } from "../composables/useMarkdown";
import { copyTextToClipboard } from "../composables/clipboard";

const props = defineProps<{
  selectionText: string;
  result: string;
  loading: boolean;
  error: AiError | null;
  activeAction: AiAction | null;
  /** 是否有选区（来自批注工具栏的「AI」按钮） */
  hasExternalSelection?: boolean;
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

const errorMessage = computed(() => {
  if (!props.error) return "";
  const title = t(`ai.error.${props.error.code}`);
  return props.error.detail ? `${title}：${props.error.detail}` : title;
});

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
  <div class="ai-inline">
    <div class="ai-inline-header">
      <span class="ai-inline-title">{{ t("ai.title") }}</span>
      <span v-if="loading" class="ai-inline-loading">{{ t("ai.loading") }}</span>
    </div>

    <div class="ai-inline-body">
      <!-- 选区预览 -->
      <div class="ai-inline-section">
        <div class="ai-inline-selection" data-test="selection">
          <template v-if="hasSelection">
            <span class="ai-inline-sel-label">{{ t("ai.selection") }}</span>
            <span class="ai-inline-sel-text">{{ selectionText }}</span>
          </template>
          <span v-else class="ai-inline-sel-empty">
            {{ t("ai.noSelection") }}
          </span>
        </div>
        <div class="ai-inline-actions">
          <button
            v-for="a in ACTIONS"
            :key="a.id"
            class="ai-inline-btn"
            :class="{ disabled: SELECTION_ACTIONS.has(a.id) && !hasSelection }"
            :data-action="a.id"
            :disabled="loading || (SELECTION_ACTIONS.has(a.id) && !hasSelection)"
            @click="onAction(a.id)"
          >
            {{ t(a.key) }}
          </button>
        </div>
      </div>

      <!-- 错误态 -->
      <div v-if="error" class="ai-inline-error" data-test="error">
        <span class="ai-inline-error-msg">{{ errorMessage }}</span>
        <button
          v-if="activeAction"
          class="ai-inline-retry"
          data-action="retry"
          @click="emit('run-action', activeAction)"
        >
          {{ t("ai.retry") }}
        </button>
      </div>

      <!-- 结果区 -->
      <div v-if="result" class="ai-inline-result" data-test="result">
        <div class="ai-inline-result-actions">
          <button class="ai-inline-copy" data-action="copy" @click="onCopyResult">
            {{ copied ? t("ai.copied") : t("ai.copy") }}
          </button>
          <button
            v-if="canApply"
            class="ai-inline-apply"
            data-action="apply"
            @click="emit('apply-result')"
          >
            {{ t("ai.apply") }}
          </button>
        </div>
        <div
          v-if="renderedHtml"
          class="ai-inline-result-html markdown-body"
          v-html="renderedHtml"
        ></div>
        <pre v-else class="ai-inline-result-plain">{{ result }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-inline {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-size: 13px;
}

.ai-inline-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--float-panel-header-border);
}

.ai-inline-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--float-panel-header-fg);
}

.ai-inline-loading {
  font-size: 11px;
  color: var(--link);
  animation: ai-pulse 1.2s ease-in-out infinite;
}

@keyframes ai-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.ai-inline-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-inline-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-inline-selection {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-btn);
  font-size: 12px;
  max-height: 60px;
  overflow: auto;
}

.ai-inline-sel-label {
  flex: 0 0 auto;
  color: var(--fg-muted);
  font-size: 11px;
}

.ai-inline-sel-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

.ai-inline-sel-empty {
  color: var(--fg-muted);
  font-size: 12px;
}

.ai-inline-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ai-inline-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
  transition: background-color 0.12s;
}

.ai-inline-btn:hover:not(:disabled) {
  background: var(--bg-btn-hover);
}

.ai-inline-btn:disabled,
.ai-inline-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-inline-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--mdr-danger) 35%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--mdr-danger) 8%, transparent);
  font-size: 12px;
}

.ai-inline-error-msg {
  flex: 1 1 auto;
  color: var(--critic-del-color, #dc2626);
  word-break: break-word;
}

.ai-inline-retry {
  flex: 0 0 auto;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.ai-inline-result {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-inline-result-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.ai-inline-result-actions button {
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.ai-inline-result-actions .ai-inline-apply {
  border-color: var(--critic-ins-color, #16a34a);
  color: var(--critic-ins-color, #16a34a);
}

.ai-inline-result-html {
  font-size: 13px;
  line-height: 1.5;
}

.ai-inline-result-plain {
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-btn);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--editor-font-family, monospace);
  font-size: 12px;
}
</style>