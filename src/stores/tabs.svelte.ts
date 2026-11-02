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

/**
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 方法与 computed getter 内联在 state 字面量上，保持旧实例全量 surface。
 */
export const tabsState = $state({
  tabs: [] as Tab[],
  activeTabId: "",

  get activeTab(): Tab | null {
    return tabsState.tabs.find((t) => t.id === tabsState.activeTabId) ?? null;
  },

  findTabByPath(path: string): Tab | undefined {
    return tabsState.tabs.find((t) => samePath(t.path, path));
  },

  createTab(path: string): Tab {
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
  },

  activateTab(id: string) {
    if (tabsState.tabs.some((t) => t.id === id)) {
      tabsState.activeTabId = id;
      tabsState.persist();
    }
  },

  removeTab(id: string) {
    const idx = tabsState.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = tabsState.activeTabId === id;
    tabsState.tabs.splice(idx, 1);
    if (wasActive) {
      const next = tabsState.tabs[idx] ?? tabsState.tabs[idx - 1] ?? null;
      tabsState.activeTabId = next ? next.id : "";
    }
    tabsState.persist();
  },

  closeTabsLeft(targetId: string) {
    const targetIdx = tabsState.tabs.findIndex((t) => t.id === targetId);
    if (targetIdx <= 0) return;
    const targetTab = tabsState.tabs[targetIdx];
    for (let i = targetIdx - 1; i >= 0; i--) {
      tabsState.tabs.splice(i, 1);
    }
    if (!tabsState.tabs.find((t) => t.id === tabsState.activeTabId)) {
      tabsState.activeTabId = targetTab.id;
    }
    tabsState.persist();
  },

  closeTabsRight(targetId: string) {
    const targetIdx = tabsState.tabs.findIndex((t) => t.id === targetId);
    if (targetIdx === -1 || targetIdx >= tabsState.tabs.length - 1) return;
    const targetTab = tabsState.tabs[targetIdx];
    tabsState.tabs.splice(targetIdx + 1);
    if (!tabsState.tabs.find((t) => t.id === tabsState.activeTabId)) {
      tabsState.activeTabId = targetTab.id;
    }
    tabsState.persist();
  },

  closeTabsOthers(targetId: string) {
    const targetIdx = tabsState.tabs.findIndex((t) => t.id === targetId);
    if (targetIdx === -1 || tabsState.tabs.length <= 1) return;
    const targetTab = tabsState.tabs[targetIdx];
    tabsState.tabs.length = 0;
    tabsState.tabs.push(targetTab);
    tabsState.activeTabId = targetTab.id;
    tabsState.persist();
  },

  closeAllTabs() {
    tabsState.tabs.length = 0;
    tabsState.activeTabId = "";
    tabsState.persist();
  },

  persist() {
    const data: PersistedTabs = {
      paths: tabsState.tabs.map((t) => t.path),
      activePath: tabsState.activeTab?.path ?? "",
    };
    localStorage.setItem(STORAGE_TABS, JSON.stringify(data));
  },

  loadPersisted(): PersistedTabs | null {
    try {
      const raw = localStorage.getItem(STORAGE_TABS);
      if (raw) return JSON.parse(raw) as PersistedTabs;
    } catch {
      /* ignore */
    }
    return null;
  },
});

/** 兼容旧调用形状: const store = useTabsStore(); store.activeTab */
export function useTabsStore() {
  return tabsState;
}
