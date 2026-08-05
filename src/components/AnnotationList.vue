<script setup lang="ts">
/**
 * AnnotationList.vue — ✏️ 批注列表浮层面板。
 *
 * 显示当前文档所有 CriticMarkup 批注，按类型分组，点击跳转到对应位置。
 * - 批注数据实时解析自当前文档源文本
 * - 带红色圆点 badge（有未读批注时显示）
 * - 点击条目跳转到批注所在行
 * - 底部固定操作按钮：审阅面板 / 复制给 AI
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { parseCriticMarkup, type CriticType } from "../composables/criticMarkup";

const props = defineProps<{
  /** 当前文档的源文本（含 CriticMarkup 语法） */
  source: string;
  /** 当前文件名（用于显示） */
  fileName?: string;
}>();

const emit = defineEmits<{
  (e: "focus", id: number): void;
  (e: "open-review"): void;
  (e: "copy-ai"): void;
}>();

const { t } = useI18n();

/** 解析所有批注 */
const annotations = computed(() => parseCriticMarkup(props.source));

const count = computed(() => annotations.value.length);

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

/** 按类型分组 */
const grouped = computed(() => {
  const map = new Map<CriticType, typeof annotations.value>();
  for (const ann of annotations.value) {
    const list = map.get(ann.type);
    if (list) list.push(ann);
    else map.set(ann.type, [ann]);
  }
  // 按固定顺序输出
  const order: CriticType[] = ["del", "ins", "sub", "hl", "comment"];
  return order
    .filter((type) => map.has(type))
    .map((type) => ({
      type,
      items: map.get(type)!,
      label: t(TYPE_LABELS[type]),
    }));
});

function snippet(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function onItemClick(id: number): void {
  emit("focus", id);
}
</script>

<template>
  <div class="annotation-list">
    <div class="al-header">
      <span class="al-title">{{ t("float.annotations") }}</span>
      <span v-if="count > 0" class="al-badge">{{ count }}</span>
    </div>

    <div class="al-content">
      <div v-if="count === 0" class="al-empty">
        {{ t("float.noAnnotations") }}
      </div>
      <div v-else class="al-groups">
        <div v-for="group in grouped" :key="group.type" class="al-group">
          <div class="al-group-header">
            <span class="al-group-icon" :class="'al-icon-' + group.type">
              {{ TYPE_ICONS[group.type] }}
            </span>
            <span class="al-group-label">{{ group.label }}</span>
            <span class="al-group-count">{{ group.items.length }}</span>
          </div>
          <div class="al-group-items">
            <div
              v-for="ann in group.items"
              :key="ann.id"
              class="al-item"
              :class="'al-item-' + ann.type"
              :data-ann-id="ann.id"
              @click="onItemClick(ann.id)"
            >
              <span class="al-item-line">L{{ ann.line }}</span>
              <span class="al-item-text">
                <template v-if="ann.type === 'comment'">
                  💬 {{ snippet(ann.newText) }}
                </template>
                <template v-else-if="ann.type === 'sub'">
                  <span class="al-old">{{ snippet(ann.oldText) }}</span>
                  <span class="al-arrow">→</span>
                  <span class="al-new">{{ snippet(ann.newText) }}</span>
                </template>
                <template v-else-if="ann.type === 'ins'">
                  <span class="al-new">{{ snippet(ann.newText) }}</span>
                </template>
                <template v-else-if="ann.type === 'hl'">
                  <span class="al-hl">{{ snippet(ann.oldText) }}</span>
                </template>
                <template v-else>
                  <span class="al-old">{{ snippet(ann.oldText) }}</span>
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="count > 0" class="al-footer">
      <button class="al-btn" @click="emit('open-review')">
        {{ t("annotation.review") }}
      </button>
      <button class="al-btn" @click="emit('copy-ai')">
        {{ t("annotation.copyAI") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.annotation-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-size: 13px;
}

.al-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--float-panel-header-border);
}

.al-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--float-panel-header-fg);
}

.al-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--critic-del-color, #dc2626);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.al-content {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.al-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  color: var(--fg-muted);
  font-size: 12px;
  text-align: center;
}

.al-groups {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.al-group {
  display: flex;
  flex-direction: column;
}

.al-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px 4px;
  font-size: 11px;
  color: var(--fg-muted);
  position: sticky;
  top: 0;
  background: var(--float-panel-bg, rgba(255, 255, 255, 0.72));
  z-index: 1;
}

:root[data-theme="dark"] .al-group-header {
  background: var(--float-panel-bg, rgba(24, 24, 24, 0.78));
}

.al-group-icon {
  font-size: 12px;
  width: 16px;
  text-align: center;
}

.al-icon-del { color: var(--critic-del-color, #dc2626); }
.al-icon-ins { color: var(--critic-ins-color, #16a34a); }
.al-icon-sub { color: var(--critic-ins-color, #16a34a); }
.al-icon-hl { color: var(--critic-hl-fg, #a16207); }
.al-icon-comment { color: var(--critic-comment-color, #64748b); }

.al-group-label {
  flex: 1 1 auto;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.al-group-count {
  font-size: 10px;
  opacity: 0.6;
}

.al-group-items {
  display: flex;
  flex-direction: column;
}

.al-item {
  display: flex;
  gap: 8px;
  padding: 6px 16px 6px 38px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background-color 0.1s, border-color 0.1s;
}

.al-item:hover {
  background: var(--bg-btn-hover);
}

.al-item-line {
  flex: 0 0 36px;
  color: var(--fg-muted);
  font-family: var(--editor-font-family, monospace);
  font-size: 11px;
  line-height: 1.5;
}

.al-item-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.5;
}

.al-old {
  text-decoration: line-through;
  color: var(--critic-del-color, #dc2626);
}

.al-new {
  color: var(--critic-ins-color, #16a34a);
}

.al-hl {
  background: var(--critic-hl-bg, rgba(234, 179, 8, 0.25));
  color: var(--critic-hl-fg, #a16207);
  padding: 0 2px;
  border-radius: 2px;
}

.al-arrow {
  color: var(--fg-muted);
  font-size: 11px;
}

.al-footer {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--float-panel-header-border);
}

.al-btn {
  flex: 1 1 auto;
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-btn);
  color: var(--fg);
  cursor: pointer;
  transition: background-color 0.12s;
  text-align: center;
}

.al-btn:hover {
  background: var(--bg-btn-hover);
}
</style>