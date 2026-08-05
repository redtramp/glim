<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Heading } from "../composables/useMarkdown";

const props = defineProps<{
  headings: Heading[];
  activeId: string;
  searchActive?: boolean;
}>();

const emit = defineEmits<{
  (e: "jump", id: string): void;
  (e: "close-search"): void;
}>();

const { t } = useI18n();

const searchQuery = ref("");
const searchInput = ref<HTMLInputElement | null>(null);
const collapsed = ref<Set<number>>(new Set());

watch(
  () => props.searchActive,
  (v) => {
    if (v) {
      searchQuery.value = "";
      setTimeout(() => searchInput.value?.focus(), 50);
    }
  }
);

watch(
  () => props.headings,
  () => { collapsed.value = new Set(); },
  { deep: true }
);

const minLevel = computed(() =>
  props.headings.length ? Math.min(...props.headings.map((h) => h.level)) : 1
);

const filteredHeadings = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.headings;
  return props.headings.filter((h) => h.text.toLowerCase().includes(q));
});

const visibleIndices = computed(() => {
  const source = filteredHeadings.value;
  const result: number[] = [];
  const stack: { index: number; level: number }[] = [];
  for (let i = 0; i < source.length; i++) {
    const h = source[i];
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (!stack.some((s) => collapsed.value.has(s.index))) {
      result.push(i);
    }
    stack.push({ index: i, level: h.level });
  }
  return result;
});

const activeHeading = computed(() =>
  props.headings.find((h) => h.id === props.activeId)
);

const activeParentId = computed(() => {
  if (!activeHeading.value) return "";
  const idx = props.headings.indexOf(activeHeading.value);
  for (let i = idx - 1; i >= 0; i--) {
    if (props.headings[i].level < activeHeading.value.level) {
      return props.headings[i].id;
    }
  }
  return "";
});

function hasChildren(idx: number): boolean {
  const source = filteredHeadings.value;
  return idx < source.length - 1 && source[idx + 1].level > source[idx].level;
}

function onItemClick(idx: number, e: MouseEvent): void {
  const source = filteredHeadings.value;
  if (e.ctrlKey || e.metaKey) {
    if (hasChildren(idx)) {
      e.preventDefault();
      toggleCollapse(idx);
    }
    return;
  }
  emit("jump", source[idx].id);
}

function toggleCollapse(index: number): void {
  const next = new Set(collapsed.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  collapsed.value = next;
}

function expandAll(): void {
  collapsed.value = new Set();
}

function collapseAll(): void {
  const top = new Set<number>();
  const source = filteredHeadings.value;
  for (let i = 0; i < source.length; i++) {
    if (source[i].level > minLevel.value && hasChildren(i)) {
      top.add(i);
    }
  }
  collapsed.value = top;
}

function onSearchInput(e: Event): void {
  searchQuery.value = (e.target as HTMLInputElement).value;
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    searchQuery.value = "";
    emit("close-search");
  }
}
</script>

<template>
  <div class="toc">
    <div class="toc-header">
      <div class="toc-title-row">
        <span class="toc-title">{{ t("toc.title") }}</span>
        <span v-if="headings.length" class="toc-actions">
          <button class="toc-action" :title="t('toc.expandAll')" @click="expandAll">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 10 12 7 9 10" />
            </svg>
          </button>
          <button class="toc-action" :title="t('toc.collapseAll')" @click="collapseAll">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 14 12 17 15 14" />
            </svg>
          </button>
        </span>
      </div>
      <div v-if="searchActive" class="toc-search">
        <input
          ref="searchInput"
          :value="searchQuery"
          class="toc-search-input"
          :placeholder="t('toc.searchPlaceholder')"
          @input="onSearchInput"
          @keydown="onSearchKeydown"
        />
      </div>
    </div>

    <div v-if="!headings.length" class="toc-empty">{{ t("toc.empty") }}</div>
    <ul v-else class="toc-list">
      <li
        v-for="idx in visibleIndices"
        :key="filteredHeadings[idx].id + filteredHeadings[idx].text"
        class="toc-item"
        :class="{
          active: activeId === filteredHeadings[idx].id,
          parent: activeParentId === filteredHeadings[idx].id,
          filtered: !!searchQuery.trim(),
        }"
        :style="{ paddingLeft: (filteredHeadings[idx].level - minLevel) * 12 + 4 + 'px' }"
        :title="filteredHeadings[idx].text"
        @click="(e) => onItemClick(idx, e)"
      >
        <span
          v-if="hasChildren(idx)"
          class="toc-toggle"
          @click.stop="toggleCollapse(idx)"
        >
          <svg v-if="collapsed.has(idx)" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <svg v-else width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <span v-else class="toc-toggle-spacer"></span>
        <span class="toc-text">{{ filteredHeadings[idx].text }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.toc {
  flex: 1; display: flex; flex-direction: column; min-height: 0; font-size: 13px;
}
.toc-header {
  flex: 0 0 auto; border-bottom: 1px solid var(--border);
}
.toc-title-row {
  display: flex; align-items: center; font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.6px; color: var(--fg-muted);
  padding: 4px 12px 6px;
}
.toc-actions { margin-left: auto; display: flex; gap: 2px; }
.toc-action {
  display: flex; align-items: center; padding: 2px 4px; color: var(--fg-muted);
  background: transparent; border: none; border-radius: 3px; cursor: pointer;
}
.toc-action:hover { color: var(--fg); background: var(--bg-btn-hover); }

.toc-search {
  padding: 0 8px 6px;
}
.toc-search-input {
  width: 100%; padding: 4px 8px; font-size: 12px; font-family: var(--ui-font);
  border: 1px solid var(--border); border-radius: 4px; background: var(--bg-btn);
  color: var(--fg); outline: none; box-sizing: border-box;
}
.toc-search-input:focus { border-color: var(--link); }

.toc-list {
  flex: 1; list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0;
}
.toc-item {
  display: flex; align-items: center; padding: 3px 8px 3px 4px; cursor: pointer;
  color: var(--toc-item-color); border-left: 2px solid transparent;
  transition: color 0.12s, background-color 0.12s, box-shadow 0.12s;
}
.toc-item:hover { color: var(--toc-hover-color); background: var(--toc-hover-bg); }
.toc-item.active {
  color: var(--toc-active-color); border-left-color: var(--toc-active-line);
  background: var(--toc-active-bg); font-weight: 600;
}
.toc-item.parent {
  border-left-color: color-mix(in srgb, var(--toc-active-line) 50%, transparent);
}
.toc-item.filtered { border-left-color: var(--link); }

.toc-toggle {
  flex: 0 0 16px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; user-select: none; color: var(--fg-muted);
}
.toc-toggle-spacer { flex: 0 0 16px; }
.toc-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc-empty { padding: 8px 12px; color: var(--fg-muted); font-size: 12px; }
</style>