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

/**
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 方法与 computed getter 内联在 state 字面量上，保持旧实例全量 surface。
 */
export const fileTreeState = $state({
  rootDir: "",
  tree: [] as TreeNode[],
  loading: false,
  error: "",

  get canGoUp(): boolean {
    return (
      fileTreeState.rootDir !== "" && parentDirOf(fileTreeState.rootDir) !== null
    );
  },

  async refresh(): Promise<void> {
    if (!fileTreeState.rootDir) {
      fileTreeState.tree = [];
      return;
    }
    fileTreeState.loading = true;
    fileTreeState.error = "";
    try {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 局部过程集合，无响应式依赖（与原 vue 行为一致）
      const loaded = new Map<string, TreeNode>();
      collectLoadedDirs(fileTreeState.tree, loaded);
      const list = await invoke<DirEntry[]>("list_dir", {
        root: fileTreeState.rootDir,
      });
      const fresh = toNodes(list);
      await refreshLoadedDirs(fresh, loaded);
      fileTreeState.tree = fresh;
    } catch (e: unknown) {
      fileTreeState.error = String((e as Error)?.message ?? e);
      fileTreeState.tree = [];
    } finally {
      fileTreeState.loading = false;
    }
  },

  async loadChildren(dir: TreeNode): Promise<void> {
    if (dir.loaded) return;
    try {
      const list = await invoke<DirEntry[]>("list_dir", { root: dir.path });
      dir.children = toNodes(list);
      dir.loaded = true;
    } catch (e: unknown) {
      fileTreeState.error = String((e as Error)?.message ?? e);
      dir.children = [];
      dir.loaded = true;
    }
  },

  async openFolder(): Promise<string | null> {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === "string") {
      await fileTreeState.changeRootDir(selected);
      return selected;
    }
    return null;
  },

  async changeRootDir(newDir: string) {
    if (!newDir || newDir === fileTreeState.rootDir) return;
    fileTreeState.rootDir = newDir;
    await fileTreeState.refresh();
  },

  async setRootFromFile(filePath: string) {
    const dir = parentDirOf(filePath);
    if (dir) await fileTreeState.changeRootDir(dir);
  },

  async setHomeRoot() {
    try {
      const home = await invoke<string>("get_home_dir");
      if (home) await fileTreeState.changeRootDir(home);
    } catch (e: unknown) {
      fileTreeState.error = String((e as Error)?.message ?? e);
    }
  },

  clearRoot(): void {
    fileTreeState.rootDir = "";
    fileTreeState.tree = [];
  },

  async goUp(): Promise<string | null> {
    if (!fileTreeState.canGoUp) return null;
    const parent = parentDirOf(fileTreeState.rootDir)!;
    await fileTreeState.changeRootDir(parent);
    return parent;
  },
});

/** 兼容旧调用形状: const store = useFileTreeStore(); store.canGoUp */
export function useFileTreeStore() {
  return fileTreeState;
}
