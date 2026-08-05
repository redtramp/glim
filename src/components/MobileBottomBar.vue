<script setup lang="ts">
/**
 * MobileBottomBar.vue — 移动端 48px 底部工具栏。
 *
 * 在 <768px 视口下替代左侧 40px 工具栏，图标横排 7 个，
 * 可左右滑动查看更多。点击图标展开对应浮层面板。
 *
 * 交互：
 * - 点击图标 → emit("open-panel", id) 由父组件切换浮层
 * - 当前展开的面板图标高亮
 * - 图标过多时支持水平滚动
 */
import { useI18n } from "vue-i18n";
import { LEFT_PANEL_META, type LeftPanelID } from "../composables/useFloatLayout";
import PanelIcon from "./PanelIcon.vue";

defineProps<{
  activePanel: LeftPanelID | null;
}>();

const emit = defineEmits<{
  (e: "open-panel", id: LeftPanelID): void;
}>();

const { t } = useI18n();

function onClick(id: LeftPanelID): void {
  emit("open-panel", id);
}
</script>

<template>
  <nav class="mobile-bottom-bar" aria-label="mobile toolbar">
    <div class="mbb-inner">
      <button
        v-for="item in LEFT_PANEL_META"
        :key="item.id"
        class="mbb-btn"
        :class="{ active: activePanel === item.id }"
        :title="t(item.labelKey)"
        :aria-label="t(item.labelKey)"
        :aria-pressed="activePanel === item.id"
        @click="onClick(item.id)"
      >
        <PanelIcon :name="item.id" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.mobile-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  z-index: 45;
  display: none; /* 默认隐藏，只在 <768px 显示 */
  align-items: center;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  pointer-events: auto;
  user-select: none;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 767px) {
  .mobile-bottom-bar {
    display: flex;
  }
}

.mbb-inner {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-around;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  gap: 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.mbb-inner::-webkit-scrollbar {
  display: none;
}

.mbb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--float-rail-icon-color);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
  position: relative;
  flex-shrink: 0;
}

.mbb-btn:hover {
  background: var(--float-rail-icon-hover-bg);
  color: var(--fg);
}

.mbb-btn.active {
  color: var(--float-rail-icon-active);
  background: var(--float-rail-icon-active-bg);
}

.mbb-icon {
  font-size: 20px;
  line-height: 1;
  pointer-events: none;
}

/* 暗色模式 */
:root[data-theme="dark"] .mobile-bottom-bar {
  background: rgba(15, 20, 16, 0.82);
  backdrop-filter: blur(12px) saturate(1.1);
  -webkit-backdrop-filter: blur(12px) saturate(1.1);
  border-top-color: rgba(255, 255, 255, 0.06);
}
</style>