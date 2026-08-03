import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** list_dir 返回的单层条目（目录或文件） */
export interface DirEntry {
  path: string;
  name: string;
  is_dir: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  /** 目录：子级是否已加载（懒加载；未加载时 children 为 undefined） */
  loaded?: boolean;
  children?: TreeNode[];
}

const rootDir = ref<string>("");
const tree = ref<TreeNode[]>([]);
const loading = ref<boolean>(false);
const error = ref<string>("");

/** 把 list_dir 的条目转成树节点（目录子级未加载，点击展开时才加载） */
function toNodes(entries: DirEntry[]): TreeNode[] {
  return entries.map((e) => ({
    name: e.name,
    path: e.path,
    isDir: e.is_dir,
  }));
}

/** 加载根目录的直接子级（仅一层，不递归） */
async function refresh(): Promise<void> {
  if (!rootDir.value) {
    tree.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    // 收集旧树中已展开的目录，刷新后保留其展开状态与子级内容
    const loaded = new Map<string, TreeNode>();
    collectLoadedDirs(tree.value, loaded);
    const list = await invoke<DirEntry[]>("list_dir", { root: rootDir.value });
    const fresh = toNodes(list);
    await refreshLoadedDirs(fresh, loaded);
    tree.value = fresh;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    tree.value = [];
  } finally {
    loading.value = false;
  }
}

/** 收集树中已加载（展开过）的目录节点，按 path 索引 */
function collectLoadedDirs(nodes: TreeNode[], acc: Map<string, TreeNode>): void {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.loaded && n.children) acc.set(n.path, n);
      if (n.children) collectLoadedDirs(n.children, acc);
    }
  }
}

/**
 * 递归刷新新树中已展开目录的直接子级（仅沿用户已展开的层级，不递归全树）。
 * 子级若仍属于已加载目录，继续刷新更深层，保证 refresh 后展开状态不丢失。
 */
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

/** 懒加载：加载某个目录节点的直接子级（仅下一级，不递归） */
async function loadChildren(dir: TreeNode): Promise<void> {
  if (dir.loaded) return;
  try {
    const list = await invoke<DirEntry[]>("list_dir", { root: dir.path });
    dir.children = toNodes(list);
    dir.loaded = true;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
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

/** 根目录设为某个文档所在的目录（该文档平级的内容显示在树中） */
async function setRootFromFile(filePath: string) {
  const dir = parentDirOf(filePath);
  if (dir) await changeRootDir(dir);
}

/** 无历史文档时：根目录设为用户主目录（如 /home/user） */
async function setHomeRoot() {
  try {
    const home = await invoke<string>("get_home_dir");
    if (home) await changeRootDir(home);
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  }
}

function clearRoot(): void {
  rootDir.value = "";
  tree.value = [];
}

/**
 * 计算路径的父目录；无上级（Unix 根 `/`、Windows 盘符根 `C:` 等）返回 null。
 * 分隔符统一为 `/`（跨平台），Windows 下 Rust/前端均能解析。
 */
export function parentDirOf(p: string): string | null {
  let norm = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm || /^[a-zA-Z]:$/.test(norm)) return null;
  const idx = norm.lastIndexOf("/");
  if (idx < 0) return null;
  const parent = idx === 0 ? "/" : norm.slice(0, idx);
  if (/^[a-zA-Z]:$/.test(parent)) return null;
  return parent;
}

/** 当前根目录是否还能切换到上一级（用于文件树 `..` 入口的显隐） */
const canGoUp = computed<boolean>(
  () => rootDir.value !== "" && parentDirOf(rootDir.value) !== null
);

/** 切换到上一级目录；成功返回新根目录，无上级时返回 null */
async function goUp(): Promise<string | null> {
  if (!canGoUp.value) return null;
  const parent = parentDirOf(rootDir.value)!;
  await changeRootDir(parent);
  return parent;
}

export function useFileTree() {
  return {
    rootDir,
    tree,
    loading,
    error,
    refresh,
    loadChildren,
    openFolder,
    setRootFromFile,
    setHomeRoot,
    clearRoot,
    canGoUp,
    goUp,
  };
}
