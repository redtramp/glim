/**
 * useTabs — 向后兼容薄包装层，核心状态已迁移到 useTabsStore
 *
 * 所有导入 useTabs 的组件无需修改即可继续工作。
 * 新代码应直接使用 useTabsStore。
 */
import {
  useTabsStore,
  normalizePath,
  samePath,
  type Tab,
} from "../stores/tabs.svelte.ts";

export type { Tab };
export { normalizePath, samePath };

export function useTabs() {
  const store = useTabsStore();

  function findTabByPath(path: string): Tab | undefined {
    return store.findTabByPath(path);
  }

  function activateTab(id: string) {
    store.activateTab(id);
  }

  function removeTab(id: string) {
    store.removeTab(id);
  }

  function closeTabsLeft(targetId: string) {
    store.closeTabsLeft(targetId);
  }

  function closeTabsRight(targetId: string) {
    store.closeTabsRight(targetId);
  }

  function closeTabsOthers(targetId: string) {
    store.closeTabsOthers(targetId);
  }

  function closeAllTabs() {
    store.closeAllTabs();
  }

  function createTab(path: string): Tab {
    return store.createTab(path);
  }

  function persist() {
    store.persist();
  }

  function loadPersisted() {
    return store.loadPersisted();
  }

  return {
    get tabs() {
      return store.tabs;
    },
    set tabs(v: Tab[]) {
      store.tabs = v;
    },
    get activeTabId() {
      return store.activeTabId;
    },
    set activeTabId(v: string) {
      store.activeTabId = v;
    },
    get activeTab() {
      return store.activeTab;
    },
    findTabByPath,
    activateTab,
    removeTab,
    closeTabsLeft,
    closeTabsRight,
    closeTabsOthers,
    closeAllTabs,
    createTab,
    persist,
    loadPersisted,
  };
}
