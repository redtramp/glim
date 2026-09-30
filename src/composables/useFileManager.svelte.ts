import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n/locale.svelte.ts";
import { useTabsStore, samePath } from "../stores/tabs.svelte.ts";
import { useAppStore } from "../stores/app.svelte.ts";
import { useHistoryStore } from "../stores/history.svelte.ts";
import { useFileTreeStore } from "../stores/fileTree.svelte.ts";
import { useUnsavedDialog } from "./useUnsavedDialog.svelte.ts";
import { extractHeadings } from "./useMarkdown";

export function useFileManager() {
  const tabs = useTabsStore();
  const app = useAppStore();
  const history = useHistoryStore();
  const fileTree = useFileTreeStore();
  const unsavedDialog = useUnsavedDialog();

  // 保留 .value 访问形状：$state box 替代 vue ref
  const editorRef = $state<{ value: any }>({ value: null });
  const isInitDone = $state<{ value: boolean }>({ value: false });

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 仅事件回调读取，无 effect 依赖（与原 vue ref(Set) 行为一致）
  const suppressed = $state<{ value: Set<string> }>({ value: new Set<string>() });
  function addSuppress(p: string) {
    suppressed.value.add(p.replace(/\\/g, "/").toLowerCase());
  }
  function isSuppressed(p: string): boolean {
    return suppressed.value.has(p.replace(/\\/g, "/").toLowerCase());
  }
  function clearSuppress(p: string) {
    suppressed.value.delete(p.replace(/\\/g, "/").toLowerCase());
  }
  function scheduleSuppressClear(p: string) {
    window.setTimeout(() => clearSuppress(p), 1000);
  }

  /** 读取文件内容填充到已有 tab（不创建新 tab） */
  async function loadFileContent(filePath: string): Promise<void> {
    const existing = tabs.findTabByPath(filePath);
    if (existing) {
      tabs.activateTab(existing.id);
      return;
    }
    const content = new TextDecoder().decode(await readFile(filePath));
    const tab = tabs.createTab(filePath);
    tab.content = content;
    tab.draftContent = content;
    tab.isDirty = false;
    tab.headings = extractHeadings(content);
    tabs.tabs.push(tab);
    tabs.activateTab(tab.id);
    history.pushRecent(filePath);
    void fileTree.setRootFromFile(filePath);
  }

  /** 打开文件（完整流程：读取→填 tab→激活）
   *  @param sourceLine 跳转至指定行号（来自全局搜索），设为 0 时不主动滚动 */
  async function loadFile(path: string, hash = "", sourceLine = 0): Promise<void> {
    const existing = tabs.findTabByPath(path);
    if (existing) {
      existing.pendingHash = hash;
      existing.pendingScrollTop = 0;
      existing.pendingSourceLine = sourceLine;
      tabs.activateTab(existing.id);
      return;
    }
    const tab = tabs.createTab(path);
    try {
      const text = new TextDecoder().decode(await readFile(path));
      tab.content = text;
      tab.draftContent = text;
      tab.isDirty = false;
      tab.isEditing = false;
      tab.headings = extractHeadings(text);
      tab.pendingHash = "";
      tab.pendingScrollTop = 0;
      tab.pendingSourceLine = sourceLine;
      tab.scrollTop = 0;
      history.pushRecent(path);
      app.errorMsg = "";
      tabs.tabs.push(tab);
      tabs.activateTab(tab.id);
    } catch (e: unknown) {
      app.errorMsg = `${t("errors.readFailed")}: ${(e as Error)?.message || e}`;
    }
  }

  async function openFile() {
    const path = await open({
      filters: [
        {
          name: t("fileTypes.markdown"),
          extensions: ["md", "markdown", "mdown", "mkd", "txt"],
        },
      ],
    });
    if (typeof path === "string") await loadFile(path);
  }

  async function saveCurrentFile(): Promise<boolean> {
    const tab = tabs.activeTab;
    if (!tab || !tab.path) {
      app.showError(t("error.selectFile"));
      return false;
    }
    return saveTab(tab);
  }

  async function saveTab(tab: { path: string; draftContent: string; isDirty: boolean; content: string; headings: any[]; id: string }): Promise<boolean> {
    if (!tab.path || app.saving) return false;
    app.saving = true;
    try {
      addSuppress(tab.path);
      await writeFile(tab.path, new TextEncoder().encode(tab.draftContent));
      tab.content = tab.draftContent;
      tab.isDirty = false;
      tab.headings = extractHeadings(tab.draftContent);
      app.exportToast = t("editor.saved");
      scheduleSuppressClear(tab.path);
      return true;
    } catch (e: unknown) {
      clearSuppress(tab.path);
      app.errorMsg = `${t("editor.saveFailed")}: ${(e as Error)?.message ?? e}`;
      return false;
    } finally {
      app.saving = false;
    }
  }

  async function saveAs(): Promise<boolean> {
    const tab = tabs.activeTab;
    if (!tab || app.saving) return false;
    const targetPath = await save({
      filters: [
        {
          name: t("fileTypes.markdown"),
          extensions: ["md", "markdown"],
        },
      ],
    });
    if (typeof targetPath !== "string") return false;
    app.saving = true;
    try {
      addSuppress(targetPath);
      await writeFile(targetPath, new TextEncoder().encode(tab.draftContent));
      tab.content = tab.draftContent;
      tab.path = targetPath;
      tab.isDirty = false;
      tab.headings = extractHeadings(tab.draftContent);
      history.pushRecent(targetPath);
      app.exportToast = `${t("editor.saved")}: ${targetPath}`;
      scheduleSuppressClear(targetPath);
      tabs.persist();
      return true;
    } catch (e: unknown) {
      clearSuppress(targetPath);
      app.errorMsg = `${t("editor.saveFailed")}: ${(e as Error)?.message ?? e}`;
      return false;
    } finally {
      app.saving = false;
    }
  }

  async function createNewFile(): Promise<boolean> {
    const dest = await save({
      defaultPath: "untitled.md",
      filters: [
        { name: t("fileTypes.markdown"), extensions: ["md", "markdown", "mdx", "txt"] },
      ],
    });
    if (!dest) return false;
    const path = /\.(md|markdown|mdx|txt)$/i.test(dest) ? dest : `${dest}.md`;
    app.saving = true;
    try {
      addSuppress(path);
      await writeFile(path, new TextEncoder().encode(""));
      const existing = tabs.findTabByPath(path);
      if (existing) {
        existing.content = "";
        existing.draftContent = "";
        existing.isDirty = false;
        existing.isEditing = true;
        existing.headings = [];
        tabs.activateTab(existing.id);
      } else {
        const tab = tabs.createTab(path);
        tab.content = "";
        tab.draftContent = "";
        tab.isDirty = false;
        tab.isEditing = true;
        tab.headings = [];
        tabs.tabs.push(tab);
        tabs.activateTab(tab.id);
      }
      history.pushRecent(path);
      app.errorMsg = "";
      app.exportToast = `${t("editor.created")}: ${path}`;
      scheduleSuppressClear(path);
      tabs.persist();
      return true;
    } catch (e: unknown) {
      clearSuppress(path);
      app.errorMsg = `${t("editor.createFailed")}: ${(e as Error)?.message ?? e}`;
      return false;
    } finally {
      app.saving = false;
    }
  }

  async function requestCloseTab(targetId: string): Promise<void> {
    const target = tabs.tabs.find((t) => t.id === targetId);
    if (!target) return;
    if (target.isDirty) {
      tabs.activateTab(targetId);
      const result = await unsavedDialog.askUnsaved(target, "unsaved");
      if (result === "cancel") return;
      if (result === "save") {
        const saved = await saveCurrentFile();
        if (!saved) return;
      }
    }
    tabs.removeTab(targetId);
  }

  async function closeCurrentTab() {
    const tab = tabs.activeTab;
    if (!tab) return;
    await requestCloseTab(tab.id);
  }

  async function closeAllTabs() {
    const unsaved = tabs.tabs.filter((t) => t.isDirty);
    if (unsaved.length === 0) {
      tabs.closeAllTabs();
      return;
    }
    for (const t of unsaved) {
      tabs.activateTab(t.id);
      const result = await unsavedDialog.askUnsaved(t, "unsaved");
      if (result === "cancel") return;
      if (result === "save") {
        const saved = await saveCurrentFile();
        if (!saved) return;
      }
    }
    tabs.closeAllTabs();
  }

  async function closeTabRight(targetId: string): Promise<void> {
    const idx = tabs.tabs.findIndex((t) => t.id === targetId);
    if (idx < 0 || idx >= tabs.tabs.length - 1) return;
    const toClose = tabs.tabs.slice(idx + 1);
    for (const tab of toClose) {
      tabs.activateTab(tab.id);
      if (tab.isDirty) {
        const result = await unsavedDialog.askUnsaved(tab, "unsaved");
        if (result === "cancel") return;
        if (result === "save") {
          const saved = await saveCurrentFile();
          if (!saved) return;
        } else {
          tab.isDirty = false;
        }
      }
    }
    tabs.closeTabsRight(targetId);
  }

  async function closeTabLeft(targetId: string): Promise<void> {
    const idx = tabs.tabs.findIndex((t) => t.id === targetId);
    if (idx <= 0) return;
    const toClose = tabs.tabs.slice(0, idx).reverse();
    for (const tab of toClose) {
      tabs.activateTab(tab.id);
      if (tab.isDirty) {
        const result = await unsavedDialog.askUnsaved(tab, "unsaved");
        if (result === "cancel") return;
        if (result === "save") {
          const saved = await saveCurrentFile();
          if (!saved) return;
        } else {
          tab.isDirty = false;
        }
      }
    }
    tabs.closeTabsLeft(targetId);
  }

  async function closeTabOthers(targetId: string): Promise<void> {
    const idx = tabs.tabs.findIndex((t) => t.id === targetId);
    if (idx < 0) return;
    const toClose = tabs.tabs.filter((t) => t.id !== targetId);
    const dirty = toClose.filter((t) => t.isDirty);
    if (dirty.length > 0) {
      for (const t of dirty) {
        tabs.activateTab(t.id);
        const result = await unsavedDialog.askUnsaved(t, "unsaved");
        if (result === "cancel") return;
        if (result === "save") {
          const saved = await saveCurrentFile();
          if (!saved) return;
        }
      }
    }
    tabs.closeTabsOthers(targetId);
  }

  let fileWatchStop: (() => void) | null = null;

  async function startWatching(dir: string) {
    if (fileWatchStop) {
      fileWatchStop();
      fileWatchStop = null;
    }
    if (!dir) return;
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ paths: string[]; kind: string }>(
        "glim-reader://file-changed",
        async (event) => {
          const paths = event.payload.paths;
          const relevant = paths.filter((p) =>
            tabs.tabs.some((t) => t.path && samePath(t.path, p))
          );
          if (relevant.length > 0 && relevant.every((p) => isSuppressed(p))) {
            return;
          }
          void onFilesChanged(relevant);
        }
      );
      fileWatchStop = unlisten;
    } catch {
      /* 非 Tauri 环境忽略 */
    }
  }

  async function onFilesChanged(paths: string[]) {
    for (const tab of [...tabs.tabs]) {
      if (!tab.path) continue;
      if (!paths.some((p) => samePath(p, tab.path))) continue;
      if (isSuppressed(tab.path)) continue;
      try {
        const diskText = new TextDecoder().decode(await readFile(tab.path));
        if (diskText === tab.draftContent) continue;
      } catch {
        /* 文件已删除/移动：按外部修改处理 */
      }
      tab.staleSince = Date.now();
      if (tab.id === tabs.activeTabId) {
        tab.pendingHash = "";
        tab.pendingScrollTop = tab.scrollTop;
        tab.pendingSourceLine = 0;
      }
    }
  }

  function stopWatching() {
    if (fileWatchStop) {
      fileWatchStop();
      fileWatchStop = null;
    }
  }

  // 旧 watch（非立即）→ $effect.root 包裹 + 首次运行跳过；dispose 随返回对象导出
  const disposeEffects = $effect.root(() => {
    let first = true;
    $effect(() => {
      void editorRef.value?.file;
      if (first) {
        first = false;
        return;
      }
      void startWatching("");
    });
  });

  async function init() {
    if (isInitDone.value) return;
    const persisted = tabs.loadPersisted();
    if (persisted && persisted.paths.length > 0) {
      const loaded: string[] = [];
      for (const p of persisted.paths) {
        try {
          await loadFile(p);
          loaded.push(p);
        } catch {
          /* 跳过不存在/读取失败的文件 */
        }
      }
      if (loaded.length > 0 && persisted.activePath) {
        const target = tabs.findTabByPath(persisted.activePath);
        if (target) tabs.activateTab(target.id);
      }
    }
    isInitDone.value = true;
  }

  return {
    editorRef,
    isInitDone,
    suppressed,
    addSuppress,
    isSuppressed,
    clearSuppress,
    scheduleSuppressClear,
    loadFile,
    loadFileContent,
    openFile,
    saveCurrentFile,
    saveTab,
    saveAs,
    createNewFile,
    requestCloseTab,
    closeCurrentTab,
    closeAllTabs,
    closeTabRight,
    closeTabLeft,
    closeTabOthers,
    startWatching,
    onFilesChanged,
    stopWatching,
    init,
    get canClose() {
      return tabs.tabs.length > 0;
    },
    dispose: disposeEffects,
  };
}
