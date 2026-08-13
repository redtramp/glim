import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface DirEntry {
  path: string;
  name: string;
  is_dir: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  loaded?: boolean;
  children?: TreeNode[];
}

function toNodes(entries: DirEntry[]): TreeNode[] {
  return entries.map((e) => ({
    name: e.name,
    path: e.path,
    isDir: e.is_dir,
  }));
}

function collectLoadedDirs(nodes: TreeNode[], acc: Map<string, TreeNode>): void {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.loaded && n.children) acc.set(n.path, n);
      if (n.children) collectLoadedDirs(n.children, acc);
    }
  }
}

async function refreshLoadedDirs(
  nodes: TreeNode[],
  loaded: Map<string, TreeNode>
): Promise<void> {
  for (const n of nodes) {
    if (!n.isDir) continue;
    if (loaded.has(n.path)) {
      try {
        const list = await invoke<DirEntry[]>("list_dir", { root: n.path });
        const fresh = toNodes(list);
        await refreshLoadedDirs(fresh, loaded);
        n.children = fresh;
        n.loaded = true;
      } catch {
        /* 单目录刷新失败：保留旧子级，不阻断整树刷新 */
      }
    } else if (n.children) {
      await refreshLoadedDirs(n.children, loaded);
    }
  }
}

export function parentDirOf(p: string): string | null {
  let norm = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm || /^[a-zA-Z]:$/.test(norm)) return null;
  const idx = norm.lastIndexOf("/");
  if (idx < 0) return null;
  const parent = idx === 0 ? "/" : norm.slice(0, idx);
  if (/^[a-zA-Z]:$/.test(parent)) return null;
  return parent;
}

export const useFileTreeStore = defineStore("fileTree", () => {
  const rootDir = ref<string>("");
  const tree = ref<TreeNode[]>([]);
  const loading = ref<boolean>(false);
  const error = ref<string>("");

  const canGoUp = computed<boolean>(
    () => rootDir.value !== "" && parentDirOf(rootDir.value) !== null
  );

  async function refresh(): Promise<void> {
    if (!rootDir.value) {
      tree.value = [];
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const loaded = new Map<string, TreeNode>();
      collectLoadedDirs(tree.value, loaded);
      const list = await invoke<DirEntry[]>("list_dir", { root: rootDir.value });
      const fresh = toNodes(list);
      await refreshLoadedDirs(fresh, loaded);
      tree.value = fresh;
    } catch (e: unknown) {
      error.value = String((e as Error)?.message ?? e);
      tree.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadChildren(dir: TreeNode): Promise<void> {
    if (dir.loaded) return;
    try {
      const list = await invoke<DirEntry[]>("list_dir", { root: dir.path });
      dir.children = toNodes(list);
      dir.loaded = true;
    } catch (e: unknown) {
      error.value = String((e as Error)?.message ?? e);
      dir.children = [];
      dir.loaded = true;
    }
  }

  async function openFolder(): Promise<string | null> {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === "string") {
      await changeRootDir(selected);
      return selected;
    }
    return null;
  }

  async function changeRootDir(newDir: string) {
    if (!newDir || newDir === rootDir.value) return;
    rootDir.value = newDir;
    await refresh();
  }

  async function setRootFromFile(filePath: string) {
    const dir = parentDirOf(filePath);
    if (dir) await changeRootDir(dir);
  }

  async function setHomeRoot() {
    try {
      const home = await invoke<string>("get_home_dir");
      if (home) await changeRootDir(home);
    } catch (e: unknown) {
      error.value = String((e as Error)?.message ?? e);
    }
  }

  function clearRoot(): void {
    rootDir.value = "";
    tree.value = [];
  }

  async function goUp(): Promise<string | null> {
    if (!canGoUp.value) return null;
    const parent = parentDirOf(rootDir.value)!;
    await changeRootDir(parent);
    return parent;
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
});
