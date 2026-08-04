<script setup lang="ts">
/**
 * AnnotationToolbar.vue — CriticMarkup 批注浮动工具栏。
 *
 * 交互:
 * - 删除 / 高亮即时执行:点击直接 emit("apply", type)
 * - 新增 / 替换 / 评论需要输入:点击 emit("input-start", type),
 *   父组件把 mode 切到对应类型后,本组件展开输入弹层(输入框 + 确定/取消)
 * - 复制给 AI / 清除全部:分别 emit("copy-ai") / emit("clear-all")
 *
 * 定位:基于父组件传入的选区坐标 (x, y)(x=选区中心、y=选区底部),
 * 组件自测尺寸后做视口夹紧与下方放不下时翻转到上方。
 */
import { computed, ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import type { CriticType } from "../composables/criticMarkup";
import { computeToolbarPosition } from "../composables/toolbarPosition";

export type AnnotationToolbarMode = "" | CriticType;

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  mode: AnnotationToolbarMode;
}>();

const emit = defineEmits<{
  (e: "apply", type: CriticType, payload?: string): void;
  (e: "input-start", type: CriticType): void;
  (e: "cancel"): void;
  (e: "copy-ai"): void;
  (e: "clear-all"): void;
}>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const inputText = ref("");
const pos = ref({ left: 0, top: 0 });

/** 需要输入内容的批注类型 */
const INPUT_TYPES: ReadonlySet<CriticType> = new Set(["ins", "sub", "comment"]);

const isInputMode = computed(
  () => props.mode !== "" && INPUT_TYPES.has(props.mode)
);

function reposition(): void {
  if (!root.value) return;
  const rect = root.value.getBoundingClientRect();
  pos.value = computeToolbarPosition({
    x: props.x,
    y: props.y,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

watch(
  () => [props.visible, props.x, props.y, props.mode],
  async () => {
    if (!props.visible) return;
    await nextTick();
    reposition();
    if (isInputMode.value) {
      inputText.value = "";
      await nextTick();
      inputEl.value?.focus();
    }
  }
);

function onAction(type: CriticType): void {
  if (INPUT_TYPES.has(type)) {
    emit("input-start", type);
  } else {
    emit("apply", type);
  }
}

function confirmInput(): void {
  const payload = inputText.value.trim();
  if (!props.mode || !payload) return;
  emit("apply", props.mode, payload);
}

function cancelInput(): void {
  emit("cancel");
}
</script>

<template>
  <div
    v-if="visible"
    ref="root"
    class="annotation-toolbar"
    :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
    role="toolbar"
    aria-label="critic markup"
    @mousedown.prevent
  >
    <template v-if="!isInputMode">
      <button
        class="at-btn at-del"
        :title="t('annotation.del')"
        @click="onAction('del')"
      >
        {{ t("annotation.del") }}
      </button>
      <button
        class="at-btn at-ins"
        :title="t('annotation.ins')"
        @click="onAction('ins')"
      >
        {{ t("annotation.ins") }}
      </button>
      <button
        class="at-btn at-sub"
        :title="t('annotation.sub')"
        @click="onAction('sub')"
      >
        {{ t("annotation.sub") }}
      </button>
      <button
        class="at-btn at-hl"
        :title="t('annotation.hl')"
        @click="onAction('hl')"
      >
        {{ t("annotation.hl") }}
      </button>
      <button
        class="at-btn at-comment"
        :title="t('annotation.comment')"
        @click="onAction('comment')"
      >
        {{ t("annotation.comment") }}
      </button>
      <span class="at-sep" aria-hidden="true"></span>
      <button
        class="at-btn at-copy"
        :title="t('annotation.copyAI')"
        @click="emit('copy-ai')"
      >
        {{ t("annotation.copyAI") }}
      </button>
      <button
        class="at-btn at-clear"
        :title="t('annotation.clearAll')"
        @click="emit('clear-all')"
      >
        {{ t("annotation.clearAll") }}
      </button>
    </template>

    <template v-else>
      <input
        ref="inputEl"
        v-model="inputText"
        class="at-input"
        @mousedown.stop
        :placeholder="
          mode === 'sub'
            ? t('annotation.subPlaceholder')
            : mode === 'comment'
              ? t('annotation.commentPlaceholder')
              : t('annotation.inputPlaceholder')
        "
        @keydown.enter="confirmInput"
        @keydown.esc="cancelInput"
      />
      <button
        class="at-btn at-confirm"
        :disabled="!inputText.trim()"
        @click="confirmInput"
      >
        {{ t("annotation.confirm") }}
      </button>
      <button class="at-btn" @click="cancelInput">
        {{ t("annotation.cancel") }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.annotation-toolbar {
  position: fixed;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-panel, var(--bg-toolbar));
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  max-width: calc(100vw - 16px);
}
.at-btn {
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.at-btn:hover {
  background: var(--bg-btn-hover);
}
.at-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.at-del:hover {
  color: var(--critic-del-color);
  background: var(--critic-del-bg);
}
.at-ins:hover {
  color: var(--critic-ins-color);
  background: var(--critic-ins-bg);
}
.at-hl:hover {
  color: var(--critic-hl-fg);
  background: var(--critic-hl-bg);
}
.at-comment:hover {
  color: var(--critic-comment-color);
  background: var(--critic-comment-bg);
}
.at-copy:hover {
  color: var(--link);
  background: var(--bg-active);
}
.at-clear:hover {
  color: var(--critic-del-color);
  background: var(--critic-del-bg);
}
.at-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border);
}
.at-input {
  width: 220px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-btn);
  color: var(--fg);
  font-size: 12px;
  outline: none;
}
.at-input:focus {
  border-color: var(--link);
}
</style>
