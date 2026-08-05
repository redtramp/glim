<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SectionMarker } from "../composables/useSectionMarkers";

const props = defineProps<{
  markers: SectionMarker[];
  activeId: string;
  bookmarks?: { id: string; scrollTop: number; label?: string }[];
}>();

const emit = defineEmits<{
  (e: "jump", id: string): void;
  (e: "expand"): void;
}>();

const { t } = useI18n();

const dimmed = ref(false);
let dimTimer: ReturnType<typeof setTimeout> | null = null;

const SCROLL_DIM_DELAY = 1500;
const TOOLTIP_DELAY = 300;
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

const tooltipMarker = ref<SectionMarker | null>(null);
const tooltipY = ref(0);
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

const headingMarkers = computed(() => props.markers.filter((m) => !m.isBookmark));
const bookmarkMarkers = computed(() => props.markers.filter((m) => m.isBookmark));

const externalBookmarks = computed(() =>
  (props.bookmarks ?? []).map((bm) => ({
    id: `ext-bm-${bm.id}`, text: bm.label ?? "🔖", level: 0,
    state: "future" as const, scrollTop: bm.scrollTop, isBookmark: true,
  }))
);

const allBookmarkMarkers = computed(() => [...bookmarkMarkers.value, ...externalBookmarks.value]);

function markerWidth(m: SectionMarker): string {
  return m.isBookmark ? "6px" : m.state === "current" ? "8px" : "6px";
}
function markerOpacity(m: SectionMarker): number {
  return m.isBookmark ? 1 : m.state === "current" ? 0.8 : m.state === "past" ? 0.5 : 0.3;
}

function onMarkerClick(m: SectionMarker): void {
  hideTooltip();
  emit("jump", m.id);
}
function onMarkerEnter(m: SectionMarker, e: MouseEvent): void {
  if (tooltipTimer !== null) clearTimeout(tooltipTimer);
  tooltipY.value = e.clientY;
  tooltipTimer = setTimeout(() => { tooltipMarker.value = m; }, TOOLTIP_DELAY);
}
function hideTooltip(): void {
  if (tooltipTimer !== null) { clearTimeout(tooltipTimer); tooltipTimer = null; }
  tooltipMarker.value = null;
}
</script>

<template>
  <nav class="right-rail" :class="{ dimmed }" aria-label="section markers" @click="emit('expand')">
    <div class="right-rail-inner" @click.stop>
      <div
        v-for="marker in headingMarkers"
        :key="marker.id"
        class="rr-marker-wrap"
        @click.stop="onMarkerClick(marker)"
        @mouseenter="(e) => onMarkerEnter(marker, e)"
        @mouseleave="hideTooltip"
      >
        <span
          class="rr-marker"
          :class="[marker.state, { active: activeId === marker.id }]"
          :style="{
            width: markerWidth(marker), height: markerWidth(marker),
            opacity: markerOpacity(marker),
          }"
          :title="marker.text"
        ></span>
      </div>

      <div v-if="headingMarkers.length > 0 && allBookmarkMarkers.length > 0" class="rr-sep" aria-hidden="true"></div>

      <div
        v-for="marker in allBookmarkMarkers"
        :key="marker.id"
        class="rr-marker-wrap"
        @click.stop="onMarkerClick(marker)"
        @mouseenter="(e) => onMarkerEnter(marker, e)"
        @mouseleave="hideTooltip"
      >
        <span
          class="rr-marker bookmark"
          :class="{ active: activeId === marker.id }"
          :style="{ width: markerWidth(marker), height: markerWidth(marker) }"
          :title="marker.text"
        ></span>
      </div>

      <div v-if="!headingMarkers.length && !allBookmarkMarkers.length" class="rr-empty" :title="t('float.noHeadings')">
        <span class="rr-empty-dot"></span>
      </div>
    </div>

    <div v-if="tooltipMarker" class="rr-tooltip" :style="{ top: tooltipY + 'px' }">
      <span class="rr-tooltip-text">{{ tooltipMarker.text }}</span>
    </div>
  </nav>
</template>

<style scoped>
.right-rail {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  background: var(--float-right-rail-bg);
  backdrop-filter: blur(8px);
  border-left: 0.5px solid rgba(0, 0, 0, 0.04);
  user-select: none;
  cursor: pointer;
  transition: opacity 200ms ease, background 0.2s ease;
}
.right-rail.dimmed { opacity: 0.25; }
.right-rail:hover { opacity: 1; background: var(--float-rail-hover-bg); }

.right-rail-inner {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 0;
  cursor: default;
}

.rr-marker-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 12px;
  cursor: pointer;
}

.rr-marker {
  display: block;
  border-radius: 50%;
  background: var(--float-marker-current);
  transition: background-color 0.1s, opacity 0.1s, transform 0.1s;
  flex-shrink: 0;
}
.rr-marker.current { background: var(--float-marker-current); }
.rr-marker.past { background: var(--float-marker-past); }
.rr-marker.future { background: var(--float-marker-future); }
.rr-marker.bookmark { border-radius: 2px; background: var(--float-marker-bookmark); }
.rr-marker:hover { transform: scale(1.4); opacity: 1 !important; }
.rr-marker.active { box-shadow: 0 0 6px color-mix(in srgb, var(--float-marker-current) 50%, transparent); }

.rr-sep {
  width: 20px;
  height: 1px;
  background: var(--float-rail-separator);
  opacity: 0.4;
  margin: 2px 0;
  flex-shrink: 0;
}

.rr-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 100%;
}
.rr-empty-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--float-marker-future);
  opacity: 0.3;
}

.rr-tooltip {
  position: fixed;
  right: 44px;
  transform: translateY(-50%);
  z-index: 46;
  padding: 4px 10px;
  background: var(--float-marker-tooltip-bg);
  color: var(--float-marker-tooltip-fg);
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 12px;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  pointer-events: none;
}
.rr-tooltip-text { display: block; overflow: hidden; text-overflow: ellipsis; }

:root[data-theme="dark"] .right-rail { border-left-color: rgba(255, 255, 255, 0.04); }
</style>