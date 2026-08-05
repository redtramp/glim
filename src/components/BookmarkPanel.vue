<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { basename, dirOf } from "../utils/path";
import { useBookmarks, type Bookmark } from "../composables/useBookmarks";

const props = defineProps<{
  currentPath?: string;
  showCurrentOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: "jump", path: string, scrollTop: number): void;
  (e: "refresh"): void;
}>();

const { t } = useI18n();
const { bookmarks, remove, clearAll, forFile, groupedByFile } = useBookmarks();

const groups = computed(() => {
  if (props.showCurrentOnly && props.currentPath) {
    const items = forFile(props.currentPath);
    return items.length === 0 ? [] : [{ filePath: props.currentPath, items }];
  }
  return Array.from(groupedByFile().entries())
    .map(([filePath, items]) => ({ filePath, items }))
    .sort((a, b) => {
      if (a.filePath === props.currentPath) return -1;
      if (b.filePath === props.currentPath) return 1;
      return 0;
    });
});

const totalCount = computed(() => bookmarks.value.length);

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t("float.minutesAgo", { n: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("float.hoursAgo", { n: hours });
  return new Date(ts).toLocaleDateString();
}

function onJump(bm: Bookmark): void { emit("jump", bm.filePath, bm.scrollTop); }
function onRemove(id: string, e: MouseEvent): void {
  e.stopPropagation();
  remove(id);
}
function onClearAll(): void {
  if (totalCount.value === 0) return;
  if (window.confirm(t("float.clearBookmarksConfirm"))) {
    clearAll();
    emit("refresh");
  }
}
</script>

<template>
  <div class="bookmark-panel">
    <div class="bm-header">
      <span class="bm-title">{{ t("float.bookmark") }}</span>
      <span v-if="totalCount > 0" class="bm-count">{{ totalCount }}</span>
      <button v-if="totalCount > 0" class="bm-clear" :title="t('float.clearBookmarks')" @click="onClearAll">
        {{ t("float.clear") }}
      </button>
    </div>

    <div class="bm-content">
      <div v-if="totalCount === 0" class="bm-empty">{{ t("float.noBookmarks") }}</div>
      <div v-else class="bm-groups">
        <div v-for="group in groups" :key="group.filePath" class="bm-group">
          <div class="bm-group-header" :title="group.filePath">
            <span class="bm-group-file">{{ basename(group.filePath) }}</span>
            <span class="bm-group-dir">{{ dirOf(group.filePath) }}</span>
          </div>
          <div class="bm-group-items">
            <div
              v-for="bm in group.items"
              :key="bm.id"
              class="bm-item"
              :class="{ active: bm.filePath === currentPath }"
              @click="onJump(bm)"
            >
              <span class="bm-item-icon">📌</span>
              <span class="bm-item-label">{{ bm.label }}</span>
              <span class="bm-item-ts">{{ formatDate(bm.createdAt) }}</span>
              <button class="bm-item-remove" :title="t('float.removeBookmark')" @click="(e) => onRemove(bm.id, e)">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmark-panel {
  flex: 1; display: flex; flex-direction: column; min-height: 0; font-size: 13px;
}
.bm-header {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
  padding: 12px 16px 8px; border-bottom: 1px solid var(--float-panel-header-border);
}
.bm-title {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--float-panel-header-fg);
}
.bm-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--float-marker-bookmark); color: #fff; font-size: 10px; font-weight: 600;
}
.bm-clear {
  margin-left: auto; padding: 2px 8px; font-size: 11px; border: 1px solid var(--border);
  border-radius: 4px; background: transparent; color: var(--fg-muted); cursor: pointer;
}
.bm-clear:hover { color: var(--critic-del-color); background: var(--critic-del-bg); }

.bm-content { flex: 1; overflow-y: auto; min-height: 0; }
.bm-empty { display: flex; align-items: center; justify-content: center; height: 100%; padding: 24px; color: var(--fg-muted); font-size: 12px; text-align: center; }
.bm-groups { display: flex; flex-direction: column; padding: 4px 0; }
.bm-group { display: flex; flex-direction: column; }

.bm-group-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 16px 4px; font-size: 11px;
  color: var(--fg-muted); position: sticky; top: 0; z-index: 1;
  background: var(--float-panel-bg, rgba(255, 255, 255, 0.72));
}
:root[data-theme="dark"] .bm-group-header { background: var(--float-panel-bg, rgba(24, 24, 24, 0.78)); }
.bm-group-file { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-group-dir { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; opacity: 0.7; }
.bm-group-items { display: flex; flex-direction: column; }

.bm-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 16px; cursor: pointer;
  border-left: 2px solid transparent; transition: background-color 0.1s, border-color 0.1s;
}
.bm-item:hover { background: var(--bg-btn-hover); }
.bm-item.active { background: var(--bg-active); border-left-color: var(--float-marker-bookmark); }
.bm-item-icon { flex: 0 0 auto; font-size: 12px; }
.bm-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); }
.bm-item-ts { flex: 0 0 auto; font-size: 10px; color: var(--fg-muted); white-space: nowrap; }
.bm-item-remove {
  flex: 0 0 auto; width: 20px; height: 20px; padding: 0; border: none; border-radius: 4px;
  background: transparent; color: var(--fg-muted); cursor: pointer; opacity: 0;
}
.bm-item:hover .bm-item-remove { opacity: 0.6; }
.bm-item-remove:hover { opacity: 1 !important; color: var(--critic-del-color); background: var(--critic-del-bg); }
</style>