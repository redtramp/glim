<script setup lang="ts">
/**
 * AnnotationToolbar.vue — CriticMarkup 批注浮动工具栏。
 *
 * 交互:
 * - 删除 / 高亮即时执行:点击直接 emit("apply", type)
 * - 新增 / 替换 / 评论需要输入:点击 emit("input-start", type),
 *   父组件把 mode 切到对应类型后,本组件展开输入弹层(输入框 + 确定/取消)
 * - 复制给 AI / 清除全部 / 审阅 / AI 面板:分别 emit 对应事件
 *
 * 布局(方案 B):三带横排左标签 —— 剪贴板 / AI / 批注 三类分三行,
 * 左侧组名竖排小标签,右侧按钮横向排布自动换行;AI 组强调色突出。
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
  (e: "copy"): void;
  (e: "paste"): void;
  (e: "clear-all"): void;
  (e: "review"): void;
  (e: "ai"): void;
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
      <!-- 第一带：剪贴板 -->
      <div class="at-band">
        <span class="at-band-label">{{ t("annotation.groupClipboard") }}</span>
        <div class="at-band-items">
          <button
            class="at-btn at-copy-plain"
            :title="t('annotation.copyPlain')"
            @click="emit('copy')"
          >
            {{ t("annotation.copyPlain") }}
          </button>
          <button
            class="at-btn at-paste"
            :title="t('annotation.paste')"
            @click="emit('paste')"
          >
            {{ t("annotation.paste") }}
          </button>
        </div>
      </div>

      <!-- 第二带：AI（强调色） -->
      <div class="at-band at-band-ai">
        <span class="at-band-label">{{ t("annotation.groupAI") }}</span>
        <div class="at-band-items">
          <button
            class="at-btn at-ai"
            :title="t('ai.title')"
            @click="emit('ai')"
          >
            ✦ {{ t("ai.title") }}
          </button>
        </div>
      </div>

      <!-- 第三带：批注（其余） -->
      <div class="at-band">
        <span class="at-band-label">{{ t("annotation.groupAnnotations") }}</span>
        <div class="at-band-items">
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
          <button
            class="at-btn at-review"
            :title="t('annotation.review')"
            @click="emit('review')"
          >
            {{ t("annotation.review") }}
          </button>
        </div>
      </div>
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
      <div class="at-input-actions">
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
      </div>
    </template>
  </div>
</template>

<style scoped>
.annotation-toolbar {
  --at-ai-color: #6d28d9;
  position: fixed;
  /* 高于左栏/目录胶囊/底部栏(45),避免选中文字在屏幕边缘时被浮层盖住 */
  z-index: 46;
  /* 三带横排:横向排布,高度紧凑 */
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px;
  min-width: 272px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  /* 悬浮设计:毛玻璃浮层 */
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(30, 40, 30, 0.12),
    0 2px 8px rgba(30, 40, 30, 0.06);
  font-size: 13px;
  animation: at-pop 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes at-pop {
  from {
    opacity: 0;
    transform: translateY(5px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

:root[data-theme="dark"] .annotation-toolbar {
  --at-ai-color: #a78bfa;
  background: rgba(30, 34, 30, 0.78);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* ---- 三带结构 ---- */
.at-band {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 2px;
}
.at-band + .at-band {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
:root[data-theme="dark"] .at-band + .at-band {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.at-band-label {
  flex: 0 0 44px;
  padding-top: 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--fg-muted);
  text-transform: uppercase;
  opacity: 0.85;
  user-select: none;
}

.at-band-items {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  min-width: 0;
}

/* ---- 按钮 ---- */
.at-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease,
    border-color 0.12s ease, box-shadow 0.12s ease;
}
.at-btn:hover {
  background: var(--bg-btn-hover);
}
.at-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* AI 组:强调色突出 */
.at-band-ai .at-band-label {
  color: var(--at-ai-color);
  opacity: 1;
}
.at-band-ai .at-ai {
  color: var(--at-ai-color);
  background: color-mix(in srgb, var(--at-ai-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--at-ai-color) 35%, transparent);
}
.at-band-ai .at-ai:hover {
  background: color-mix(in srgb, var(--at-ai-color) 14%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--at-ai-color) 12%, transparent);
}

/* 批注项悬停配色(沿用既有语义色) */
.at-del:hover {
  color: var(--critic-del-color);
  background: var(--critic-del-bg);
}
.at-ins:hover {
  color: var(--critic-ins-color);
  background: var(--critic-ins-bg);
}
.at-sub:hover {
  color: var(--critic-comment-color);
  background: var(--critic-comment-bg);
}
.at-hl:hover {
  color: var(--critic-hl-fg);
  background: var(--critic-hl-bg);
}
.at-comment:hover {
  color: var(--critic-comment-color);
  background: var(--critic-comment-bg);
}
/* 复制给 AI:批注组内,悬停呈 AI 色 */
.at-copy {
  color: var(--fg-muted);
}
.at-copy:hover {
  color: var(--at-ai-color);
  background: color-mix(in srgb, var(--at-ai-color) 8%, transparent);
}
.at-clear:hover {
  color: var(--critic-del-color);
  background: var(--critic-del-bg);
}
.at-review:hover {
  color: var(--link);
  background: var(--bg-active);
}

/* 批注组内竖向分隔线 */
.at-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 18px;
  align-self: center;
  margin: 0 2px;
  background: var(--border);
  opacity: 0.6;
}

/* ---- 输入弹层 ---- */
.at-input-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.at-input-actions .at-btn {
  flex: 1 1 0;
}
.at-input {
  width: 220px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-btn);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.at-input:focus {
  border-color: var(--at-ai-color);
}
</style>
