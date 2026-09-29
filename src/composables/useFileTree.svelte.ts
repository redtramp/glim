/**
 * useFileTree — 向后兼容薄包装层，核心状态已迁移到 useFileTreeStore
 *
 * 新代码应直接使用 useFileTreeStore。
 */
import {
  useFileTreeStore,
  parentDirOf,
  type DirEntry,
  type TreeNode,
} from "../stores/fileTree.svelte.ts";

export type { DirEntry, TreeNode };
export { parentDirOf };

export function useFileTree() {
  const store = useFileTreeStore();

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
    get rootDir() {
      return store.rootDir;
    },
    set rootDir(v: string) {
      store.rootDir = v;
    },
    get tree() {
      return store.tree;
    },
    set tree(v: TreeNode[]) {
      store.tree = v;
    },
    get loading() {
      return store.loading;
    },
    set loading(v: boolean) {
      store.loading = v;
    },
    get error() {
      return store.error;
    },
    set error(v: string) {
      store.error = v;
    },
    get canGoUp() {
      return store.canGoUp;
    },
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
