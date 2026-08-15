/**
 * useHistory — 向后兼容薄包装层，核心状态已迁移到 useHistoryStore
 *
 * 新代码应直接使用 useHistoryStore。
 */
import { storeToRefs } from "pinia";
import { useHistoryStore } from "../stores/useHistoryStore";
import type { RecentItem } from "../stores/useHistoryStore";

export type { RecentItem };

export function useHistory() {
  const store = useHistoryStore();
  const { recent } = storeToRefs(store);

  function pushRecent(path: string) {
    store.pushRecent(path);
  }

  function pushRecentBatch(paths: string[]) {
    store.pushRecentBatch(paths);
  }

  function clearRecent() {
    store.clearRecent();
  }

  function saveScroll(path: string, top: number) {
    store.saveScroll(path, top);
  }

  function getScroll(path: string): number {
    return store.getScroll(path);
  }

  return {
    recent,
    pushRecent,
    pushRecentBatch,
    clearRecent,
    saveScroll,
    getScroll,
  };
}
