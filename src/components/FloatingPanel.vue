<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    side?: "left" | "right" | "bottom";
    width?: number;
    autoHideDelay?: number;
    zIndex?: number;
  }>(),
  { side: "left", width: 320, autoHideDelay: 1500, zIndex: 50 }
);

const emit = defineEmits<{ (e: "close"): void }>();

const showContent = ref(props.visible);

const sideClass = computed(() => props.side);
const panelStyle = computed(() =>
  props.side === "left" || props.side === "right"
    ? { width: `${props.width}px`, zIndex: props.zIndex }
    : { zIndex: props.zIndex }
);

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
let unmountTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoHide(): void {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function scheduleAutoHide(): void {
  clearAutoHide();
  if (props.autoHideDelay <= 0) return;
  autoHideTimer = setTimeout(() => emit("close"), props.autoHideDelay);
}

function stopPropagation(e: MouseEvent): void {
  e.stopPropagation();
}

watch(
  () => props.visible,
  (visible) => {
    clearAutoHide();
    if (unmountTimer !== null) {
      clearTimeout(unmountTimer);
      unmountTimer = null;
    }
    if (visible) {
      showContent.value = true;
    } else {
      unmountTimer = setTimeout(() => {
        showContent.value = false;
      }, 250);
    }
  }
);

onUnmounted(() => {
  clearAutoHide();
  if (unmountTimer !== null) clearTimeout(unmountTimer);
});
</script>

<template>
  <div
    v-if="showContent"
    class="floating-panel"
    :class="[sideClass, { entering: visible, leaving: !visible }]"
    :style="panelStyle"
    role="dialog"
    :aria-modal="visible"
    :aria-label="side === 'right' ? '大纲面板' : '功能面板'"
    @mouseenter="clearAutoHide"
    @mouseleave="scheduleAutoHide"
    @click="stopPropagation"
  >
    <div v-if="side === 'bottom'" class="fp-handle" aria-hidden="true">
      <span class="fp-handle-bar"></span>
    </div>
    <div class="fp-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.floating-panel {
  position: fixed;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  opacity: 0;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border-right: 0.5px solid rgba(0, 0, 0, 0.06);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
  will-change: transform, opacity;
}

.floating-panel.left {
  left: 0;
  transform: translateX(-100%);
}

.floating-panel.right {
  right: 0;
  transform: translateX(100%);
  border-right: none;
  border-left: 0.5px solid rgba(0, 0, 0, 0.06);
}

.floating-panel.entering {
  transform: translateX(0);
  opacity: 1;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms ease;
}

.floating-panel.leaving {
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 200ms ease-in, opacity 150ms ease;
}

.floating-panel.right.leaving {
  transform: translateX(100%);
}

.floating-panel.bottom {
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  height: 60vh;
  max-height: 80vh;
  transform: translateY(100%);
  border-right: none;
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.1);
}

.floating-panel.bottom.entering {
  transform: translateY(0);
  transition: transform 200ms ease-out;
}

.floating-panel.bottom.leaving {
  transform: translateY(100%);
  transition: transform 250ms ease-in;
}

.fp-handle {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 4px;
  cursor: grab;
}

.fp-handle-bar {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  opacity: 0.5;
}

.fp-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 767px) {
  .floating-panel.left,
  .floating-panel.right {
    width: 100vw !important;
    max-width: 100vw !important;
  }
}

:root[data-theme="dark"] .floating-panel {
  background: rgba(24, 24, 24, 0.78);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  border-right-color: rgba(255, 255, 255, 0.06);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .floating-panel.right {
  border-right: none;
  border-left: 0.5px solid rgba(255, 255, 255, 0.06);
}

:root[data-theme="dark"] .floating-panel.bottom {
  border-top-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
}
</style>