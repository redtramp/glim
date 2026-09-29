/**
 * useBookmarks.ts — 🔖 书签管理。
 *
 * 书签与文档标题关联，可标记任意滚动位置。数据持久化到 localStorage。
 *
 * 使用方式：
 *   const bookmarks = useBookmarks();
 *   bookmarks.add(currentPath, scrollTop, label);
 *   bookmarks.remove(id);
 *   const list = bookmarks.forFile(currentPath);
 */

export interface Bookmark {
  /** 唯一标识 */
  id: string;
  /** 文件路径 */
  filePath: string;
  /** 滚动位置（px） */
  scrollTop: number;
  /** 用户可读标签 */
  label: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 关联的标题文本（取最近的标题，可选） */
  headingText?: string;
}

const STORAGE_KEY = "glim-reader-bookmarks";

function loadAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

function saveAll(entries: Bookmark[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Ruling 6：模块级共享状态（不导出），保持 .value 访问形状
const bookmarks = $state<{ value: Bookmark[] }>({ value: loadAll() });

export function useBookmarks() {

  function persist(): void {
    saveAll(bookmarks.value);
  }

  /** 添加书签 */
  function add(
    filePath: string,
    scrollTop: number,
    label?: string,
    headingText?: string
  ): Bookmark {
    const bm: Bookmark = {
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filePath,
      scrollTop,
      label: label || headingText || `L${Math.round(scrollTop / 28) + 1}`,
      createdAt: Date.now(),
      headingText,
    };
    bookmarks.value = [...bookmarks.value, bm];
    persist();
    return bm;
  }

  /** 删除书签 */
  function remove(id: string): void {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== id);
    persist();
  }

  /** 获取指定文件的书签，按 scrollTop 排序 */
  function forFile(filePath: string): Bookmark[] {
    return bookmarks.value
      .filter((b) => b.filePath === filePath)
      .sort((a, b) => a.scrollTop - b.scrollTop);
  }

  /** 获取所有书签，按创建时间倒序 */
  function all(): Bookmark[] {
    return [...bookmarks.value].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 获取所有书签，按文件路径分组 */
  function groupedByFile(): Map<string, Bookmark[]> {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 局部过程集合，无响应式依赖（与原 vue 行为一致）
    const map = new Map<string, Bookmark[]>();
    for (const bm of bookmarks.value) {
      const list = map.get(bm.filePath);
      if (list) list.push(bm);
      else map.set(bm.filePath, [bm]);
    }
    // 每组内按 scrollTop 排序
    for (const [, list] of map) {
      list.sort((a, b) => a.scrollTop - b.scrollTop);
    }
    return map;
  }

  /** 切换书签：如果已存在相同位置则删除，否则添加 */
  function toggle(
    filePath: string,
    scrollTop: number,
    label?: string,
    headingText?: string
  ): Bookmark | null {
    const existing = bookmarks.value.find(
      (b) => b.filePath === filePath && Math.abs(b.scrollTop - scrollTop) < 50
    );
    if (existing) {
      remove(existing.id);
      return null;
    }
    return add(filePath, scrollTop, label, headingText);
  }

  /** 检查指定位置是否已有书签 */
  function hasAt(filePath: string, scrollTop: number): boolean {
    return bookmarks.value.some(
      (b) => b.filePath === filePath && Math.abs(b.scrollTop - scrollTop) < 50
    );
  }

  /** 清除所有书签 */
  function clearAll(): void {
    bookmarks.value = [];
    persist();
  }

  /** 重载（从 localStorage 刷新） */
  function reload(): void {
    bookmarks.value = loadAll();
  }

  return {
    bookmarks,
    add,
    remove,
    forFile,
    all,
    groupedByFile,
    toggle,
    hasAt,
    clearAll,
    reload,
  };
}