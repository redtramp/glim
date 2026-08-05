<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { LEFT_PANEL_META, type LeftPanelID } from "../composables/useFloatLayout";
import PanelIcon from "./PanelIcon.vue";

defineProps<{ activePanel: LeftPanelID | null }>();

const emit = defineEmits<{ (e: "open-panel", id: LeftPanelID): void }>();

const { t } = useI18n();

const dimmed = ref(false);
let dimTimer: ReturnType<typeof setTimeout> | null = null;

const SCROLL_DIM_DELAY = 1500;
const SCROLL_ROOT_SELECTOR = "[data-scroll-root]";

function onScroll(): void {
  dimmed.value = true;
  if (dimTimer !== null) clearTimeout(dimTimer);
  dimTimer = setTimeout(() => { dimmed.value = false; }, SCROLL_DIM_DELAY);
}

let scrollTarget: HTMLElement | null = null;

onMounted(() => {
  scrollTarget = document.querySelector(SCROLL_ROOT_SELECTOR);
  scrollTarget?.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
  scrollTarget?.removeEventListener("scroll", onScroll);
  if (dimTimer !== null) clearTimeout(dimTimer);
});

const groupBoundaries = new Set(
  LEFT_PANEL_META.reduce<number[]>((acc, meta, idx) => {
    if (idx < LEFT_PANEL_META.length - 1 && LEFT_PANEL_META[idx + 1].group !== meta.group) {
      acc.push(idx);
    }
    return acc;
  }, [])
);
</script>

<template>
  <nav class="left-rail" :class="{ dimmed }" aria-label="toolbar">
    <div class="left-rail-inner">
      <template v-for="(item, idx) in LEFT_PANEL_META" :key="item.id">
        <button
          class="left-rail-btn"
          :class="{ active: activePanel === item.id }"
          :title="t(item.labelKey)"
          :aria-label="t(item.labelKey)"
          :aria-pressed="activePanel === item.id"
          @click="emit('open-panel', item.id)"
        >
          <PanelIcon :name="item.id" />
        </button>
        <div v-if="groupBoundaries.has(idx)" class="left-rail-sep" aria-hidden="true"></div>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.left-rail {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  background: var(--float-left-rail-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-right: 0.5px solid rgba(0, 0, 0, 0.04);
  user-select: none;
  transition: opacity 200ms ease, background 0.2s ease;
}
.left-rail.dimmed { opacity: 0.25; }
.left-rail:hover { opacity: 1; }

.left-rail-inner {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0;
}

.left-rail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--float-rail-icon-color);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.left-rail-btn:hover {
  background: var(--float-rail-icon-hover-bg);
  color: var(--fg);
}
.left-rail-btn.active {
  color: var(--float-rail-icon-active);
  background: var(--float-rail-icon-active-bg);
}

.left-rail-icon {
  font-size: 18px;
  line-height: 1;
  pointer-events: none;
}

.left-rail-sep {
  width: 20px;
  height: 1px;
  margin: 4px 0;
  background: var(--float-rail-separator);
  opacity: 0.5;
  flex-shrink: 0;
}

:root[data-theme="dark"] .left-rail {
  border-right-color: rgba(255, 255, 255, 0.04);
}
</style>