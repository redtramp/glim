<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { basename, dirOf } from "../utils/path";
import type { RecentItem } from "../composables/useHistory";
import { useHistory } from "../composables/useHistory";

const props = defineProps<{
  items?: RecentItem[];
  currentPath?: string;
}>();

const emit = defineEmits<{
  (e: "open", path: string): void;
  (e: "clear"): void;
}>();

const { t } = useI18n();
const { recent, clearRecent } = useHistory();

const displayItems = computed(() => props.items ?? recent.value.slice(0, 20));

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("float.justNow");
  if (minutes < 60) return t("float.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("float.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("float.daysAgo", { n: days });
  return new Date(ts).toLocaleDateString();
}

</script>

<template>
  <div class="history-panel">
    <div class="hp-header">
      <span class="hp-title">{{ t("float.recentDocuments") }}</span>
      <button v-if="displayItems.length > 0" class="hp-clear" :title="t('float.clearHistory')" @click="clearRecent(); emit('clear')">
        {{ t("float.clear") }}
      </button>
    </div>

    <div class="hp-content">
      <div v-if="displayItems.length === 0" class="hp-empty">{{ t("float.noHistory") }}</div>
      <div v-else class="hp-list">
        <div
          v-for="item in displayItems"
          :key="item.path + item.ts"
          class="hp-item"
          :class="{ active: item.path === currentPath }"
          :title="item.path"
          @click="emit('open', item.path)"
        >
          <span class="hp-item-name">{{ item.name || basename(item.path) }}</span>
          <span class="hp-item-meta">
            <span class="hp-item-dir">{{ dirOf(item.path) }}</span>
            <span class="hp-item-ts">{{ formatTimestamp(item.ts) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; font-size: 13px; }
.hp-header {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
  padding: 12px 16px 8px; border-bottom: 1px solid var(--float-panel-header-border);
}
.hp-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--float-panel-header-fg); }
.hp-clear {
  margin-left: auto; padding: 2px 8px; font-size: 11px; border: 1px solid var(--border);
  border-radius: 4px; background: transparent; color: var(--fg-muted); cursor: pointer;
}
.hp-clear:hover { color: var(--critic-del-color); background: var(--critic-del-bg); }
.hp-content { flex: 1; overflow-y: auto; min-height: 0; }
.hp-empty { display: flex; align-items: center; justify-content: center; height: 100%; padding: 24px; color: var(--fg-muted); font-size: 12px; }
.hp-list { display: flex; flex-direction: column; padding: 4px 0; }
.hp-item {
  display: flex; flex-direction: column; gap: 2px; padding: 8px 16px; cursor: pointer;
  border-left: 2px solid transparent; transition: background-color 0.1s, border-color 0.1s;
}
.hp-item:hover { background: var(--bg-btn-hover); }
.hp-item.active { background: var(--bg-active); border-left-color: var(--link); }
.hp-item-name { font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-item-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--fg-muted); }
.hp-item-dir { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-item-ts { flex: 0 0 auto; white-space: nowrap; }
</style>