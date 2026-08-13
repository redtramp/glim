/**
 * useFileTree — 向后兼容薄包装层，核心状态已迁移到 useFileTreeStore
 *
 * 新代码应直接使用 useFileTreeStore。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import {
  useFileTreeStore,
  parentDirOf,
  type DirEntry,
  type TreeNode,
} from "../stores/useFileTreeStore";

export type { DirEntry, TreeNode };
export { parentDirOf };

export function useFileTree() {
  const store = useFileTreeStore();
  const { rootDir, tree, loading, error } = storeToRefs(store);
  const canGoUp = computed(() => store.canGoUp);

  async function refresh() {
    await store.refresh();
  }

  async function loadChildren(dir: TreeNode) {
    await store.loadChildren(dir);
  }

  async function openFolder() {
    return await store.openFolder();
  }

  async function changeRootDir(newDir: string) {
    await store.changeRootDir(newDir);
  }

  async function setRootFromFile(filePath: string) {
    await store.setRootFromFile(filePath);
  }

  async function setHomeRoot() {
    await store.setHomeRoot();
  }

  function clearRoot() {
    store.clearRoot();
  }

  async function goUp() {
    return await store.goUp();
  }

  return {
    rootDir,
    tree,
    loading,
    error,
    canGoUp,
    refresh,
    loadChildren,
    openFolder,
    changeRootDir,
    setRootFromFile,
    setHomeRoot,
    clearRoot,
    goUp,
  };
}
