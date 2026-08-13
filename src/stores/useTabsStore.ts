import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Heading } from "../composables/useMarkdown";

export interface Tab {
  id: string;
  path: string;
  content: string;
  draftContent: string;
  isDirty: boolean;
  isEditing: boolean;
  headings: Heading[];
  scrollTop: number;
  pendingHash: string;
  pendingScrollTop: number;
  pendingSourceLine: number;
  staleSince: number | null;
}

interface PersistedTabs {
  paths: string[];
  activePath: string;
}

const STORAGE_TABS = "glim-reader-tabs";

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `tab-${Date.now()}-${idSeq}`;
}

export const useTabsStore = defineStore("tabs", () => {
  const tabs = ref<Tab[]>([]);
  const activeTabId = ref<string>("");

  const activeTab = computed<Tab | null>(
    () => tabs.value.find((t) => t.id === activeTabId.value) ?? null
  );

  function findTabByPath(path: string): Tab | undefined {
    return tabs.value.find((t) => samePath(t.path, path));
  }

  function createTab(path: string): Tab {
    return {
      id: nextId(),
      path,
      content: "",
      draftContent: "",
      isDirty: false,
      isEditing: false,
      headings: [],
      scrollTop: 0,
      pendingHash: "",
      pendingScrollTop: 0,
      pendingSourceLine: 0,
      staleSince: null,
    };
  }

  function activateTab(id: string) {
    if (tabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
      persist();
    }
  }

  function removeTab(id: string) {
    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = activeTabId.value === id;
    tabs.value.splice(idx, 1);
    if (wasActive) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1] ?? null;
      activeTabId.value = next ? next.id : "";
    }
    persist();
  }

  function closeTabsLeft(targetId: string) {
    const targetIdx = tabs.value.findIndex((t) => t.id === targetId);
    if (targetIdx <= 0) return;
    const targetTab = tabs.value[targetIdx];
    for (let i = targetIdx - 1; i >= 0; i--) {
      tabs.value.splice(i, 1);
    }
    if (!tabs.value.find((t) => t.id === activeTabId.value)) {
      activeTabId.value = targetTab.id;
    }
    persist();
  }

  function closeTabsRight(targetId: string) {
    const targetIdx = tabs.value.findIndex((t) => t.id === targetId);
    if (targetIdx === -1 || targetIdx >= tabs.value.length - 1) return;
    const targetTab = tabs.value[targetIdx];
    tabs.value.splice(targetIdx + 1);
    if (!tabs.value.find((t) => t.id === activeTabId.value)) {
      activeTabId.value = targetTab.id;
    }
    persist();
  }

  function closeTabsOthers(targetId: string) {
    const targetIdx = tabs.value.findIndex((t) => t.id === targetId);
    if (targetIdx === -1 || tabs.value.length <= 1) return;
    const targetTab = tabs.value[targetIdx];
    tabs.value.length = 0;
    tabs.value.push(targetTab);
    activeTabId.value = targetTab.id;
    persist();
  }

  function closeAllTabs() {
    tabs.value.length = 0;
    activeTabId.value = "";
    persist();
  }

  function persist() {
    const data: PersistedTabs = {
      paths: tabs.value.map((t) => t.path),
      activePath: activeTab.value?.path ?? "",
    };
    localStorage.setItem(STORAGE_TABS, JSON.stringify(data));
  }

  function loadPersisted(): PersistedTabs | null {
    try {
      const raw = localStorage.getItem(STORAGE_TABS);
      if (raw) return JSON.parse(raw) as PersistedTabs;
    } catch {
      /* ignore */
    }
    return null;
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    findTabByPath,
    createTab,
    activateTab,
    removeTab,
    closeTabsLeft,
    closeTabsRight,
    closeTabsOthers,
    closeAllTabs,
    persist,
    loadPersisted,
  };
});
