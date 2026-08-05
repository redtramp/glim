<script setup lang="ts">
/**
 * TopTrigger.vue — 顶部 8px 触发区域。
 *
 * 固定在屏幕顶部，高度 8px，鼠标移入时触发顶部 Tab 条滑入。
 * 配合 TabBar 悬浮改造使用，由父组件控制显隐状态。
 */
import { ref, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    /** 是否启用（桌面端启用，移动端禁用） */
    enabled?: boolean;
    /** 触发延迟（ms），鼠标进入后等待多久触发滑入 */
    enterDelay?: number;
    /** 收回延迟（ms），鼠标离开后等待多久触发滑出 */
    leaveDelay?: number;
  }>(),
  {
    enabled: true,
    enterDelay: 0,
    leaveDelay: 2000,
  }
);

const emit = defineEmits<{
  (e: "show"): void;
  (e: "hide"): void;
}>();

const hovered = ref(false);
let enterTimer: ReturnType<typeof setTimeout> | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (enterTimer !== null) {
    clearTimeout(enterTimer);
    enterTimer = null;
  }
  if (leaveTimer !== null) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
}

function onMouseEnter(): void {
  if (!props.enabled) return;
  clearTimers();
  hovered.value = true;
  enterTimer = setTimeout(() => {
    emit("show");
  }, props.enterDelay);
}

function onMouseLeave(): void {
  if (!props.enabled) return;
  clearTimers();
  hovered.value = false;
  leaveTimer = setTimeout(() => {
    emit("hide");
  }, props.leaveDelay);
}

onUnmounted(() => {
  clearTimers();
});
</script>

<template>
  <div
    class="top-trigger"
    :class="{ active: hovered }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  ></div>
</template>

<style scoped>
.top-trigger {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 8px;
  z-index: 39;
  pointer-events: auto;
  cursor: default;
  transition: height 0.15s ease;
}

.top-trigger.active {
  height: 12px;
}
</style>