<script setup lang="ts">
/**
 * ReviewPanel.vue — CriticMarkup 审阅面板（Accept/Reject）。
 *
 * 交互结构复用 DiffView（overlay 遮罩 + 居中卡片 + 头部关闭）：
 * - 面板持有 source（由 App 透传当前 draftContent），内部实时 parseCriticMarkup，
 *   source 变化自动重解析 → 逐条操作后的位置偏移天然消除；
 * - 每条批注:类型标签 + 行号 + 旧/新内容 + 接受/拒绝按钮；
 * - 顶部工具条:全部接受 / 全部拒绝 / 剩余条数；
 * - 点击条目 emit focus(id) 由 App 滚动到对应行；决策结果由 App 计算并 setSource。
 *
 * 组件本身是「展示 + 事件」纯组件：决策逻辑（applyDecision / acceptAll）在
 * App.vue 侧，便于单测（props/emits）与复用。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { parseCriticMarkup, type CriticType } from "../composables/criticMarkup";

const props = defineProps<{
  visible: boolean;
  source: string;
  fileName: string;
}>();

const emit = defineEmits<{
  (e: "apply", decision: "accept" | "reject", id: number): void;
  (e: "apply-all", decision: "accept" | "reject"): void;
  (e: "focus", id: number): void;
  (e: "close"): void;
}>();

const { t } = useI18n();

/** 仅在可见时解析,避免面板关闭时反复扫描大文档 */
const annotations = computed(() =>
  props.visible ? parseCriticMarkup(props.source) : []
);

const TYPE_LABELS: Record<CriticType, string> = {
  del: "review.typeDel",
  ins: "review.typeIns",
  sub: "review.typeSub",
  hl: "review.typeHl",
  comment: "review.typeComment",
};

const count = computed(() => annotations.value.length);

function onClose(): void {
  emit("close");
}

function onApply(decision: "accept" | "reject", id: number): void {
  emit("apply", decision, id);
}
</script>

<template>
  <div v-if="visible" class="rv-overlay" @click="onClose">
    <div class="rv-view" @click.stop>
      <div class="rv-header">
        <h3 class="rv-title">{{ t("review.title") }}</h3>
        <span class="rv-filename">{{ fileName }}</span>
        <span class="rv-count">{{ t("review.count", { n: count }) }}</span>
        <button class="rv-close" data-action="close" @click="onClose">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="rv-toolbar">
        <button class="btn" data-action="accept-all" @click="emit('apply-all', 'accept')">
          {{ t("review.acceptAll") }}
        </button>
        <button class="btn" data-action="reject-all" @click="emit('apply-all', 'reject')">
          {{ t("review.rejectAll") }}
        </button>
      </div>

      <div class="rv-content">
        <div v-if="count === 0" class="rv-empty">
          {{ t("review.empty") }}
        </div>
        <div v-else class="rv-list">
          <div
            v-for="ann in annotations"
            :key="ann.id"
            class="rv-item"
            :class="'rv-item-' + ann.type"
            :data-ann-id="ann.id"
            @click="emit('focus', ann.id)"
          >
            <span class="rv-type">{{ t(TYPE_LABELS[ann.type]) }}</span>
            <span class="rv-line">L{{ ann.line }}</span>
            <div class="rv-text">
              <template v-if="ann.type === 'comment'">
                <span class="rv-comment">💬 {{ ann.newText }}</span>
              </template>
              <template v-else-if="ann.type === 'sub'">
                <span class="rv-old">{{ ann.oldText }}</span>
                <span class="rv-arrow">→</span>
                <span class="rv-new">{{ ann.newText }}</span>
              </template>
              <template v-else-if="ann.type === 'ins'">
                <span class="rv-new">{{ ann.newText }}</span>
              </template>
              <template v-else-if="ann.type === 'hl'">
                <span class="rv-hl">{{ ann.oldText }}</span>
              </template>
              <template v-else>
                <span class="rv-old">{{ ann.oldText }}</span>
              </template>
            </div>
            <div class="rv-actions" @click.stop>
              <button
                class="rv-accept"
                :data-action="'accept-' + ann.id"
                @click="onApply('accept', ann.id)"
              >
                {{ t("review.accept") }}
              </button>
              <button
                class="rv-reject"
                :data-action="'reject-' + ann.id"
                @click="onApply('reject', ann.id)"
              >
                {{ t("review.reject") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rv-overlay {
  position: fixed;
  inset: 0;
  z-index: 102;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rv-view {
  width: min(760px, 92vw);
  max-height: 82vh;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rv-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.rv-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.rv-filename {
  flex: 1 1 auto;
  font-size: 13px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.rv-count {
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
}

.rv-close {
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

.rv-close:hover {
  background: var(--bg-btn-hover);
  color: var(--fg);
}

.rv-toolbar {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
}

.rv-toolbar .btn {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.rv-toolbar .btn:hover {
  background: var(--bg-btn-hover);
}

.rv-content {
  flex: 1 1 auto;
  overflow: auto;
  padding: 8px 0;
}

.rv-empty {
  padding: 24px;
  text-align: center;
  color: var(--fg-muted);
  font-size: 13px;
}

.rv-list {
  display: flex;
  flex-direction: column;
}

.rv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  transition: background-color 0.12s;
}

.rv-item:hover {
  background: var(--bg-btn-hover);
}

.rv-type {
  flex: 0 0 44px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
}

.rv-item-del .rv-type {
  color: var(--critic-del-color, #dc2626);
  background: var(--critic-del-bg, rgba(239, 68, 68, 0.12));
}
.rv-item-ins .rv-type {
  color: var(--critic-ins-color, #16a34a);
  background: var(--critic-ins-bg, rgba(34, 197, 94, 0.12));
}
.rv-item-sub .rv-type {
  color: var(--critic-ins-color, #16a34a);
  background: var(--critic-ins-bg, rgba(34, 197, 94, 0.12));
}
.rv-item-hl .rv-type {
  color: var(--critic-hl-fg, #a16207);
  background: var(--critic-hl-bg, rgba(234, 179, 8, 0.15));
}
.rv-item-comment .rv-type {
  color: var(--critic-comment-color, #64748b);
  background: var(--critic-comment-bg, rgba(100, 116, 139, 0.12));
}

.rv-line {
  flex: 0 0 48px;
  color: var(--fg-muted);
  font-family: var(--editor-font-family, monospace);
  font-size: 12px;
}

.rv-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

.rv-old {
  text-decoration: line-through;
  color: var(--critic-del-color, #dc2626);
}

.rv-new {
  color: var(--critic-ins-color, #16a34a);
}

.rv-hl {
  background: var(--critic-hl-bg, rgba(234, 179, 8, 0.25));
  color: var(--critic-hl-fg, #a16207);
  padding: 0 2px;
  border-radius: 2px;
}

.rv-comment {
  color: var(--critic-comment-color, #64748b);
  font-style: italic;
}

.rv-arrow {
  color: var(--fg-muted);
}

.rv-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
}

.rv-actions button {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
}

.rv-actions .rv-accept:hover {
  background: var(--critic-ins-bg, rgba(34, 197, 94, 0.15));
  color: var(--critic-ins-color, #16a34a);
}

.rv-actions .rv-reject:hover {
  background: var(--critic-del-bg, rgba(239, 68, 68, 0.15));
  color: var(--critic-del-color, #dc2626);
}
</style>
