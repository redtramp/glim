<!--
  应用根组件（App.vue → App.svelte，Svelte 5）

  Vue → Svelte 迁移要点：
  - ref/computed → $state / $derived；组合式返回的 .value 盒保持原访问形状
  - watch（非 immediate）→ $effect + 前值比较（首跑跳过，时序稳健）
  - nextTick → await tick()；@scroll.passive → onscroll（Svelte 无 passive 修饰符）
  - onMounted/onUnmounted → onMount/onDestroy；useKeyboardHandlers 需手动 attach/detach
  - 模板 ref → bind:this；编辑器实例经 $effect 同步进 fileManager.editorRef 模块盒
-->
<script lang="ts">
// @ts-check
import { onMount, onDestroy, tick } from "svelte";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { t, locale, persistLocale, type AppLocale } from "./i18n/locale.svelte.ts";
import { useFileTree } from "./composables/useFileTree.svelte.ts";
import { useFileWatcher } from "./composables/useFileWatcher.svelte.ts";
import { extractHeadings } from "./composables/useMarkdown";
import { useScrollSpy } from "./composables/useScrollSpy.svelte.ts";
import { useFindInPage } from "./composables/useFindInPage.svelte.ts";
import { useHistory, type RecentItem } from "./composables/useHistory";
import { useReadingSettings } from "./composables/useReadingSettings.svelte.ts";
import { useAnnotations, resolveSelectionRange } from "./composables/useAnnotations.svelte.ts";
import { useAiPanel } from "./composables/useAiPanel.svelte.ts";
import type { CriticType } from "./composables/criticMarkup";
import { parseCriticMarkup, applyDecision, acceptAllCriticMarkup, rejectAllCriticMarkup } from "./composables/criticMarkup";
import { useTabs, samePath, type Tab } from "./composables/useTabs.svelte.ts";
import { copyTextToClipboard } from "./composables/clipboard";
import {
  exportToHtml,
  exportToDocx,
  exportToPdf,
  checkPandoc,
  checkPdfEngine,
  printDocument,
  type PandocInfo,
} from "./composables/useExport";
import { useFileManager } from "./composables/useFileManager.svelte.ts";
import { useKeyboardHandlers } from "./composables/useKeyboardHandlers.svelte.ts";
import { useUnsavedDialog } from "./composables/useUnsavedDialog.svelte.ts";
import { useFsAuthorize } from "./composables/useFsAuthorize.svelte.ts";
import { useFloatLayout, ACTION_PANEL_IDS } from "./composables/useFloatLayout.svelte.ts";
import { useSectionMarkers } from "./composables/useSectionMarkers.svelte.ts";
import { useBookmarks } from "./composables/useBookmarks.svelte.ts";
import { basename, dirOf } from "./utils/path";
import { useAppStore } from "./stores/app.svelte.ts";

// Components (.vue → .svelte)
import Toolbar from "./components/Toolbar.svelte";
import TabBar from "./components/TabBar.svelte";
import LeftRail from "./components/LeftRail.svelte";
import TopTrigger from "./components/TopTrigger.svelte";
import SearchPanel from "./components/SearchPanel.svelte";
import TocCapsule from "./components/TocCapsule.svelte";
import SettingsDialog from "./components/SettingsDialog.svelte";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog.svelte";
import GrantAccessDialog from "./components/GrantAccessDialog.svelte";
import Banner from "./components/Banner.svelte";
import DiffView from "./components/DiffView.svelte";
import ReviewPanel from "./components/ReviewPanel.svelte";
import AiPanel from "./components/AiPanel.svelte";
import MarkdownView from "./components/MarkdownView.svelte";
import MarkdownEditor from "./components/MarkdownEditor.svelte";
import AnnotationToolbar from "./components/AnnotationToolbar.svelte";
import ExportMenu from "./components/ExportMenu.svelte";
import MobileBottomBar from "./components/MobileBottomBar.svelte";
import FloatPanelContent from "./components/FloatPanelContent.svelte";

const appStore = useAppStore();
const fileManager = useFileManager();
const unsavedDialog = useUnsavedDialog();
const fsAuthorize = useFsAuthorize();
const floatLayout = useFloatLayout();
const bookmarks = useBookmarks();

// —— 模板引用：$state + bind:this；对内仍按 Vue 的 .value 盒形状访问 ——
// Svelte 5 的 Component 是带调用签名的接口而非构造器，不能用 InstanceType<typeof X>，
// 这里按子组件 `export function` 的导出手写实例形状
type MarkdownEditorHandle = {
  focus(): void;
  openSearch(): void;
  openReplace(): void;
  goToLine(): void;
  getTopVisibleLine(): number;
  scrollToLine(line: number): void;
};
type SearchPanelHandle = { focusInput(): void };
let viewerElState = $state<HTMLElement | null>(null);
let markdownState = $state<{ root: HTMLElement | null } | null>(null);
let editorState = $state<MarkdownEditorHandle | null>(null);
let searchPanelState = $state<SearchPanelHandle | null>(null);
const viewerEl = { get value() { return viewerElState; } };
const bodyRef = { get value() { return markdownState?.root ?? null; } };

const { onScroll } = useScrollSpy(viewerEl, bodyRef);
const find = useFindInPage(bodyRef);
let isMobileViewport = $state(window.innerWidth < 768);
function onResize() { isMobileViewport = window.innerWidth < 768; }
window.addEventListener("resize", onResize, { passive: true });
let enableFloatLayout = $state(localStorage.getItem("glim-reader-float-layout") !== "0");
function toggleFloatLayout() {
  enableFloatLayout = !enableFloatLayout;
  localStorage.setItem("glim-reader-float-layout", enableFloatLayout ? "1" : "0");
}
// 值走 $derived（新鲜读取），方法解构（引用稳定）
const fileTree = useFileTree();
const { refresh: refreshTree, openFolder, setRootFromFile, setHomeRoot, clearRoot, goUp, loadChildren } = fileTree;
const rootDir = $derived(fileTree.rootDir);
const tree = $derived(fileTree.tree);
const treeLoading = $derived(fileTree.loading);
const canGoUp = $derived(fileTree.canGoUp);
const watcher = useFileWatcher();
const history = useHistory();
const { pushRecent, pushRecentBatch, clearRecent, saveScroll, getScroll } = history;
const recent = $derived(history.recent);
const reading = useReadingSettings();
const { apply: applyReadingSettings, setFontSize, setEditorFontSize, setMaxWidth, setLineHeight } = reading;
const readingSettings = $derived(reading.settings);
const annotations = useAnnotations();
const aiPanel = useAiPanel();
// 注意：useTabs() 必须先于 useSectionMarkers() 执行 —— 后者的构造会同步读取
// headingsBox → 触发 activeTab derived 求值，若 useTabs 尚未执行将触发 TDZ 崩溃
const tabsApi = useTabs();
const { findTabByPath, createTab, activateTab, persist, loadPersisted } = tabsApi;
const tabs = tabsApi.tabs; // 稳定数组引用（只 splice/push，从不整体重赋值）
const activeTab = $derived(tabsApi.activeTab);
const activeTabId = $derived(tabsApi.activeTabId);

let searchVisible = $state(false);
let searchFocusSeq = 0;
let lastSearchQuery = "";
let prevTabPath = "";
/** 标记当前是否正在从搜索结果切换到新文件，用于保护 handleOnRendered 中的高亮恢复 */
let pendingRestoreQuery = false;
/** 搜索浮层内联样式，由 recalcSearchPosition 动态更新 */
let searchOverlayStyle = $state<Record<string, string>>({});

/** 根据当前悬浮布局状态计算搜索面板位置，并更新内联样式 */
function recalcSearchPosition(): void {
  if (!enableFloatLayout || isEditing) {
    searchOverlayStyle = {};
    return;
  }
  const tabbarEl = document.querySelector<HTMLElement>(".tab-bar.floating");
  const topOffset = (tabbarEl?.offsetHeight ?? 0) + 20;
  const panelEl = document.querySelector<HTMLElement>(".floating-panel.left");
  const panelWidth = panelEl ? panelEl.offsetWidth : 0;
  const leftOffset = 40 + panelWidth + 20;
  searchOverlayStyle = {
    top: `${topOffset}px`,
    left: `${leftOffset}px`,
    height: `calc(100vh - ${topOffset * 2}px)`,
  };
}
/** 模板 style 字符串（search-overlay 需要内联 left/top 断言） */
const searchOverlayStyleStr = $derived(
  Object.entries(searchOverlayStyle)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")
);

const currentFile = $derived(activeTab?.path ?? "");
const draftContent = $derived(activeTab?.draftContent ?? "");
const isEditing = $derived(activeTab?.isEditing ?? false);
const headings = $derived(activeTab?.headings ?? []);
const headingsBox = { get value() { return headings; } };
// useSectionMarkers 构造时同步读取 headingsBox，必须在 activeTab（useTabs）可用后创建
const sectionMarkers = useSectionMarkers(headingsBox, viewerEl, bodyRef);
const isDirty = $derived(activeTab?.isDirty ?? false);
const hasActiveFile = $derived(Boolean(activeTab?.path));
const fileName = $derived(currentFile ? basename(currentFile) : t("app.noFile"));
const displayFileName = $derived(isDirty ? `${fileName} *` : fileName);
const hasBookmarkAtCurrentPos = $derived(
  !currentFile || !viewerEl.value ? false : bookmarks.hasAt(currentFile, viewerEl.value.scrollTop)
);
const dynamicIcons = $derived({
  "locale-toggle": locale.value === "zh-CN" ? "中" : "En",
  edit: isEditing ? "👁" : "✎",
});
const showUnsavedDialog = unsavedDialog.showUnsavedDialog;
const showGrantDialog = fsAuthorize.showGrantDialog;
const grantDir = fsAuthorize.grantDir;
const unsavedDialogMode = unsavedDialog.unsavedDialogMode;
const dialogTab = unsavedDialog.dialogTab;
const editorRef = fileManager.editorRef;

/** 悬浮面板关闭后仍驻留 DOM 的卸载窗口（FloatingPanel unmountTimer 250ms）+ 缓冲 */
const PANEL_UNMOUNT_SETTLE_MS = 300;
let searchPosSettleTimer: ReturnType<typeof setTimeout> | null = null;

function closeSearchPanel() { searchVisible = false; lastSearchQuery = ""; find.query.value = ""; find.clearHighlights(); }
function onSearchQueryChange(q: string) { const q2 = q.trim(); lastSearchQuery = q2; find.query.value = q2; }

async function readFileIntoTab(tab: Tab, path: string, hash = "", sourceLine = 0) {
  fileManager.addSuppress(path);
  try {
    const text = await fsAuthorize.readTextFileAuthorized(path);
    tab.path = path; tab.content = text; tab.draftContent = text;
    tab.isDirty = false; tab.isEditing = false; tab.headings = extractHeadings(text);
    tab.pendingHash = hash; tab.pendingScrollTop = hash ? 0 : getScroll(path);
    tab.pendingSourceLine = sourceLine; tab.scrollTop = tab.pendingScrollTop;
    pushRecent(path); void watcher.watchFile(dirOf(path));
    appStore.errorMsg = ""; fileManager.scheduleSuppressClear(path);
  } catch (e: any) { fileManager.clearSuppress(path); throw e; }
}

async function loadFile(path: string, hash = "", sourceLine = 0) {
  const existing = findTabByPath(path);
  if (existing) {
    const t2 = activeTab;
    if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
    existing.pendingHash = hash; existing.pendingScrollTop = 0; existing.pendingSourceLine = sourceLine;
    activateTab(existing.id); await syncRootDir(path);
    if (lastSearchQuery) { find.highlightSearch(lastSearchQuery); lastSearchQuery = ""; }
    if (existing.pendingSourceLine > 0) { scrollPreviewToSourceLine(existing.pendingSourceLine); existing.pendingSourceLine = 0; }
    return;
  }
  const t2 = activeTab;
  if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
  const tab = createTab(path);
  try { await readFileIntoTab(tab, path, hash, sourceLine); } catch (e: any) { appStore.errorMsg = `${t("errors.readFailed")}: ${e?.message || e}`; return; }
  tabs.push(tab); activateTab(tab.id); await syncRootDir(path);
}

async function forceReloadTab(tab: Tab) {
  fileManager.addSuppress(tab.path);
  try {
    const text = await fsAuthorize.readTextFileAuthorized(tab.path);
    tab.content = text; tab.draftContent = text; tab.isDirty = false; tab.headings = extractHeadings(text);
    if (tab.id === activeTabId) { tab.pendingHash = ""; tab.pendingScrollTop = tab.scrollTop; tab.pendingSourceLine = 0; find.clearHighlights(); }
    fileManager.scheduleSuppressClear(tab.path);
  } catch (e: any) { fileManager.clearSuppress(tab.path); appStore.errorMsg = `${t("errors.readFailed")}: ${e?.message || e}`; }
}

async function switchToTab(id: string) {
  if (id === activeTabId) return;
  const t2 = activeTab;
  if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
  const tab = tabs.find(x => x.id === id); if (!tab) return;
  tab.pendingHash = ""; tab.pendingScrollTop = tab.scrollTop; tab.pendingSourceLine = 0;
  activateTab(id); await syncRootDir(tab.path);
  if (tab.staleSince) { bannerTab = tab; showBanner = true; }
}

function scrollPreviewToSourceLine(line: number) {
  const container = viewerEl.value, body = bodyRef.value;
  if (!container || !body) return;
  const items = Array.from(body.querySelectorAll<HTMLElement>("[data-source-line]"));
  let target: HTMLElement | null = items[0] ?? null, targetLine = 0;
  for (const item of items) { const l = Number(item.dataset.sourceLine || "0"); if (!l) continue; if (l <= line && l >= targetLine) { target = item; targetLine = l; } }
  if (!target) return;
  container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - 8;
}

function getPreviewTopSourceLine(): number {
  const container = viewerEl.value, body = bodyRef.value;
  if (!container || !body) return 1;
  const ct = container.getBoundingClientRect().top;
  let topLine = 1;
  for (const item of Array.from(body.querySelectorAll<HTMLElement>("[data-source-line]"))) {
    const line = Number(item.dataset.sourceLine || "0"); if (!line) continue;
    if (item.getBoundingClientRect().top - ct <= 16) topLine = line; else return topLine;
  }
  return topLine;
}

let headingTimer: ReturnType<typeof setTimeout> | null = null;
function onDraftUpdate(value: string) {
  const tab = activeTab; if (!tab) return;
  tab.draftContent = value; tab.isDirty = value !== tab.content;
  if (headingTimer) clearTimeout(headingTimer);
  headingTimer = setTimeout(() => { tab.headings = extractHeadings(value); }, 200);
}

let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
function onViewerScroll() {
  if (isEditing) return; onScroll();
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => { const t2 = activeTab; if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); } }, 400);
}

async function startWatching(dir: string) {
  await watcher.start(dir, async (paths) => {
    const relevant = paths.filter(p => tabs.some(tb => samePath(p, tb.path)));
    if (relevant.length > 0 && relevant.every(p => fileManager.isSuppressed(p))) return;
    await refreshTree();
    setTimeout(async () => {
      for (const tab of [...tabs]) {
        if (!paths.some(p => samePath(p, tab.path))) continue;
        if (fileManager.isSuppressed(tab.path)) continue;
        try { const diskText = await readTextFile(tab.path); if (diskText === tab.draftContent) continue; } catch { /* ignore */ }
        const normalized = tab.path.replace(/\\/g, "/").toLowerCase();
        if (autoReloadWhitelist.includes(normalized) && !tab.isDirty) { await forceReloadTab(tab); continue; }
        if (tab.isEditing) continue; tab.staleSince = Date.now();
        if (tab.id === activeTabId) { bannerTab = tab; showBanner = true; }
      }
    }, 150);
  });
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 局部过程集合，无响应式依赖（与原 vue 行为一致）
  const dirs = new Set<string>();
  for (const tab of tabs) { const d = dirOf(tab.path); if (d) dirs.add(d); }
  for (const d of dirs) void watcher.watchFile(d);
}

async function syncRootDir(path: string) {
  const targetDir = dirOf(path); if (!targetDir || samePath(rootDir, targetDir)) return;
  await setRootFromFile(path); await startWatching(targetDir);
}

function toggleEditorMode() {
  const tab = activeTab; if (!tab) return;
  if (tab.isEditing) { tab.pendingSourceLine = editorRef.value?.getTopVisibleLine() ?? 1; tab.pendingScrollTop = 0; tab.isEditing = false; find.reset(); return; }
  tab.pendingSourceLine = 0; tab.isEditing = true;
  void (async () => { await tick(); editorRef.value?.scrollToLine(getPreviewTopSourceLine()); })();
}

let autoReloadWhitelist = $state<string[]>(JSON.parse(localStorage.getItem("glim-reader-auto-reload-whitelist") || "[]"));
function toggleAutoReload(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (autoReloadWhitelist.includes(normalized)) autoReloadWhitelist = autoReloadWhitelist.filter(p => p !== normalized);
  else autoReloadWhitelist.push(normalized);
  localStorage.setItem("glim-reader-auto-reload-whitelist", JSON.stringify(autoReloadWhitelist));
}

let showBanner = $state(false); let bannerTab = $state<Tab | null>(null);
let showDiffView = $state(false); let diffOldContent = $state(""); let diffNewContent = $state(""); let diffFileName = $state("");
function closeDiffView() { showDiffView = false; }
async function onBannerViewDiff() {
  const tab = bannerTab; if (!tab) return;
  try { const newText = await readTextFile(tab.path); diffOldContent = tab.draftContent; diffNewContent = newText; diffFileName = basename(tab.path); showDiffView = true; } catch { /* ignore */ }
}
function onBannerIgnore() { const tab = bannerTab; if (tab) tab.staleSince = null; showBanner = false; bannerTab = null; }
async function onBannerReload() { const tab = bannerTab; if (tab) { await forceReloadTab(tab); tab.staleSince = null; } showBanner = false; bannerTab = null; }
function onBannerAutoReload() { const tab = bannerTab; if (tab) toggleAutoReload(tab.path); showBanner = false; bannerTab = null; }

let renderTick = $state(0); let treeFocusKey = $state(0);
let annotationToast = $state(""); let annotationToastTimer: ReturnType<typeof setTimeout> | null = null;
function showAnnotationToast(message: string) { annotationToast = message; if (annotationToastTimer) clearTimeout(annotationToastTimer); annotationToastTimer = setTimeout(() => { annotationToast = ""; }, 2500); }
let showExportMenu = $state(false);
let exportBusy = $state(false);
let pandocInfo = $state<PandocInfo | null>(null);
let pdfEnginePath = $state<string | null>(null);

function toggleExportMenu() { showExportMenu = !showExportMenu; }
function closeExportMenu() { showExportMenu = false; }

/** 导出/打印前必须处于预览模式且有内容 */
function ensurePreviewForExport(): boolean {
  if (isEditing) {
    closeExportMenu();
    appStore.errorMsg = t("editor.previewBeforeExport");
    return false;
  }
  if (!bodyRef.value || !draftContent) {
    closeExportMenu();
    return false;
  }
  return true;
}

async function exportHtml() {
  if (!ensurePreviewForExport()) return;
  try {
    const dest = await exportToHtml(
      bodyRef.value!, fileName || "document.html", currentFile || undefined
    );
    showExportMenu = false;
    if (dest) appStore.exportToast = dest;
  } catch (e: any) {
    showExportMenu = false;
    appStore.errorMsg = `${t("export.exportFailed")}: ${e?.message ?? e}`;
  }
}

async function exportDocx() {
  if (!ensurePreviewForExport()) return;
  exportBusy = true;
  appStore.exportToast = t("export.generatingDocx");
  try {
    const out = await exportToDocx(
      bodyRef.value!, fileName || "document",
      displayFileName, currentFile || undefined
    );
    appStore.exportToast = out ? `${t("export.exportedDocx")}: ${out}` : "";
  } catch (e: any) {
    appStore.errorMsg = `${t("export.docxFailed")}: ${e?.message ?? e}`;
    appStore.exportToast = "";
  } finally {
    exportBusy = false;
    showExportMenu = false;
  }
}

async function exportPdf() {
  if (!ensurePreviewForExport()) return;
  exportBusy = true;
  appStore.exportToast = t("export.generatingPdf");
  try {
    const result = await exportToPdf(
      bodyRef.value!, fileName || "document", displayFileName,
      currentFile || undefined,
      async () => {
        const picked = await open({
          title: t("export.chooseEdgePath"),
          multiple: false,
          filters: [
            { name: t("export.edgeChrome"), extensions: ["exe"] },
            { name: t("app.allFiles"), extensions: ["*"] },
          ],
        });
        return typeof picked === "string" ? picked : null;
      }
    );
    if (result) {
      pdfEnginePath = result.edge_path;
      const sec = (result.elapsed_ms / 1000).toFixed(1);
      appStore.exportToast = `${t("export.exportedPdf")} (${sec}s): ${result.out_path}`;
    } else {
      appStore.exportToast = "";
    }
  } catch (e: any) {
    const msg = e?.message || (typeof e === "string" ? e : JSON.stringify(e));
    appStore.errorMsg = `${t("export.pdfFailed")}: ${msg}`;
    appStore.exportToast = "";
  } finally {
    exportBusy = false;
    showExportMenu = false;
  }
}

function doPrint() {
  if (isEditing) {
    closeExportMenu();
    appStore.errorMsg = t("editor.previewBeforeExport");
    return;
  }
  if (bodyRef.value) printDocument(bodyRef.value, fileName);
}

function annotationContext() {
  const tab = activeTab; if (!tab || !tab.path) return null;
  return { getSource: () => tab.draftContent, getFileName: () => basename(tab.path),
    setSource: (next: string) => { tab.draftContent = next; tab.isDirty = true; },
    notify: (key: string) => showAnnotationToast(t(key)),
    confirmClear: () => window.confirm(`${t("annotation.clearConfirmTitle")}\n\n${t("annotation.clearConfirmMessage")}`),
  };
}
function onAnnotationApply(type: CriticType, payload?: string) { annotations.applyMarkup(type, payload); }
async function onAnnotationCopy() {
  const container = bodyRef.value, range = container && resolveSelectionRange(container, window.getSelection());
  const text = range?.toString().trim() ?? ""; if (!text) return;
  try { await copyTextToClipboard(text); showAnnotationToast(t("annotation.copyDone")); } catch { showAnnotationToast(t("annotation.copyFailed")); }
}
async function onAnnotationPaste() {
  let text: string; try { text = await navigator.clipboard.readText(); } catch { showAnnotationToast(t("annotation.pasteFailed")); return; }
  if (!text.trim()) return; onAnnotationApply("ins", text);
}
function openAiPanel() { annotations.hide(); const container = bodyRef.value, range = container && resolveSelectionRange(container, window.getSelection()); aiPanel.openWithSelection(range ? range.toString().trim() : ""); }
function onAiApplyResult(text: string) {
  const tab = activeTab; if (!tab) return;
  if (!window.confirm(t("ai.applyConfirm"))) return;
  tab.draftContent = rejectAllCriticMarkup(text); tab.isDirty = true; aiPanel.close();
}
function openReviewPanel() { annotations.hide(); showReviewPanel = true; }
function onReviewApply(decision: "accept" | "reject", id: number) {
  const tab = activeTab; if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find(a => a.id === id); if (!ann) return;
  tab.draftContent = applyDecision(tab.draftContent, ann, decision); tab.isDirty = true;
}
function onReviewApplyAll(decision: "accept" | "reject") {
  const tab = activeTab; if (!tab) return;
  tab.draftContent = decision === "accept" ? acceptAllCriticMarkup(tab.draftContent) : rejectAllCriticMarkup(tab.draftContent); tab.isDirty = true;
}
function onReviewFocus(id: number) {
  const tab = activeTab; if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find(a => a.id === id); if (ann) scrollPreviewToSourceLine(ann.line);
}

let recentFiltered = $state<RecentItem[]>([]);
async function refreshRecent() {
  const checks = await Promise.all(recent.slice(0, 10).map(async (item) => {
    try { return { item, ok: await exists(item.path) }; } catch { return { item, ok: false }; }
  }));
  recentFiltered = checks.filter(c => c.ok).map(c => c.item);
}

// Keyboard handlers — must be after all handler functions are defined
const keyboardHandlers = useKeyboardHandlers({
  fileManager: { openFile: fileManager.openFile, saveCurrentFile: fileManager.saveCurrentFile, saveAs: fileManager.saveAs, closeCurrentTab: fileManager.closeCurrentTab, closeAllTabs: fileManager.closeAllTabs, createNewFile: fileManager.createNewFile },
  floatLayout, unsavedDialog, onOpenSearch: () => { searchVisible = true; }, enableFloatLayout: () => enableFloatLayout,
});
const showSettings = keyboardHandlers.showSettings;
// App 自有审阅面板开关（键盘处理器内部的同名盒不接模板 —— 与 Vue 版一致的历史分叉）
let showReviewPanel = $state(false);

function handleToggleBookmark() {
  const tab = activeTab; if (!tab || !viewerEl.value || isEditing) return;
  const scrollTop = viewerEl.value.scrollTop;
  const h = headings.filter(hh => {
    // 同 useSectionMarkers：属性选择器匹配 %XX 形式的标题 id，不依赖 CSS.escape
    const el = bodyRef.value?.querySelector(`[id="${hh.id}"]`);
    if (!el) return false;
    return el.getBoundingClientRect().top + scrollTop - viewerEl.value!.getBoundingClientRect().top <= scrollTop + 16;
  }).pop();
  const label = h?.text;
  const r = bookmarks.toggle(tab.path, scrollTop, label, label);
  showAnnotationToast(r ? t('float.bookmarkAdded') : t('float.bookmarkRemoved'));
}
function handleToggleTheme() { appStore.toggleTheme(); renderTick++; }
function handleToggleLocale() { const next = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'; locale.value = next; persistLocale(next as AppLocale); }
function handleOnRendered() {
  void (async () => {
    await tick();
    const tab = activeTab; if (!viewerEl.value || !tab) return;
    annotations.configure(annotationContext, () => bodyRef.value);
    annotations.initSelectionWatch();
    aiPanel.configure(() => ({ getSource: () => activeTab?.draftContent ?? '', applyResult: onAiApplyResult }));
    if (tab.pendingHash) { sectionMarkers.jumpTo(tab.pendingHash); tab.pendingHash = ''; }
    if (lastSearchQuery) { find.highlightSearch(lastSearchQuery); lastSearchQuery = ''; }
    pendingRestoreQuery = false;
    if (tab.pendingSourceLine > 0) { scrollPreviewToSourceLine(tab.pendingSourceLine); tab.pendingSourceLine = 0; }
    else if (tab.pendingScrollTop > 0) viewerEl.value.scrollTop = tab.pendingScrollTop;
    else viewerEl.value.scrollTop = 0;
  })();
}
function handleBookmarkJump(path: string, scrollTop: number) {
  floatLayout.closePanel();
  void loadFile(path).then(() => { void (async () => { await tick(); if (viewerEl.value) viewerEl.value.scrollTop = scrollTop; })(); });
}
function handleZoomIn() { isEditing ? setEditorFontSize(readingSettings.editorFontSize + 1) : setFontSize(readingSettings.fontSize + 1); }
function handleZoomOut() { isEditing ? setEditorFontSize(readingSettings.editorFontSize - 1) : setFontSize(readingSettings.fontSize - 1); }

let topTabBarVisible = $state(true);
let topTabBarHideTimer: ReturnType<typeof setTimeout> | null = null;
function onFloatFloatingTabActivate(id: string) { void switchToTab(id); topTabBarVisible = true; setTimeout(() => { topTabBarVisible = false; }, 2000); }
function onFloatTabBarMouseEnter() { topTabBarVisible = true; if (topTabBarHideTimer !== null) { clearTimeout(topTabBarHideTimer); topTabBarHideTimer = null; } }
function onFloatTabBarMouseLeave() {
  if (topTabBarHideTimer !== null) clearTimeout(topTabBarHideTimer);
  topTabBarHideTimer = setTimeout(() => { topTabBarVisible = false; topTabBarHideTimer = null; }, 2000);
}
function onFloatPanelAction(id: string) {
  floatLayout.closePanel();
  if (id === "edit") toggleEditorMode();
  else if (id === "new-file") void fileManager.createNewFile();
  else if (id === "open-file") void fileManager.openFile();
  else if (id === "open-folder") void onPickFolder();
  else if (id === "export") toggleExportMenu();
  else if (id === "locale-toggle") handleToggleLocale();
  else if (id === "theme-toggle") handleToggleTheme();
}
function onFloatPanelOpenFile(path: string) { floatLayout.closePanel(); void loadFile(path); }
function toggleSearchPanel() { searchVisible = !searchVisible; }
function onFind() { if (isEditing) editorRef.value?.openSearch(); else searchVisible = true; }
async function onPickFolder() { const d = await openFolder(); if (d) await startWatching(d); }
function onFloatPanelOpenSearch(path: string, line: number) {
  const currentPath = activeTab?.path;
  if (currentPath && samePath(path, currentPath) && !activeTab?.isEditing) {
    const q = find.query.value || lastSearchQuery;
    if (q) { find.query.value = q; lastSearchQuery = q; }
    void (async () => { await tick(); find.scrollToLine(line); })();
    return;
  }
  const q = find.query.value || lastSearchQuery;
  if (q) lastSearchQuery = q;
  pendingRestoreQuery = true;
  void loadFile(path, "", line);
}

let restoreInFlight = false;
/** 组件已卸载：窗口关闭/重挂载时，restoreTabs 异步续体必须中止状态写入 */
let appDisposed = false;

async function restoreTabs(initialPath = "") {
  if (restoreInFlight) return; // 防重入：onMounted 只调用一次，但 HMR/测试重挂载时防止并发二次恢复
  restoreInFlight = true;
  try {
    const persisted = loadPersisted(); let paths: string[] = [], activePath = "";
    if (persisted?.paths.length) { paths = persisted.paths; activePath = persisted.activePath; }
    else { const last = localStorage.getItem("glim-reader-last-file"); if (last) { paths = [last]; activePath = last; } }
    const uniquePaths = [...new Set(paths.filter(p => p && !findTabByPath(p)))];
    if (uniquePaths.length > 0) {
      // 并行读取（有界并发 4）：串行 IPC 读取是「多文档启动变慢」的主因
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 并行读取的过程内映射，无响应式依赖（与原 vue 行为一致）
      const textByPath = new Map<string, string>();
      let cursor = 0;
      const readWorkers = Array.from({ length: Math.min(4, uniquePaths.length) }, async () => {
        while (cursor < uniquePaths.length) {
          const path = uniquePaths[cursor++];
          fileManager.addSuppress(path);
          try { textByPath.set(path, await readTextFile(path)); } catch { /* 单文件失败不影响整体恢复 */ }
        }
      });
      await Promise.all(readWorkers);
      // 窗口在恢复期间已关闭（onDestroy）：不再装配标签/激活/写历史，避免状态写入已销毁实例
      if (appDisposed) {
        // 平衡读取阶段加入的 suppress，避免残留；应用关闭场景下无害，但保持状态一致
        for (const path of uniquePaths) fileManager.clearSuppress(path);
        return;
      }
      // 按原顺序装配 tab，保证标签页顺序与上次会话一致
      const recentPaths: string[] = [];
      let activeId = "";
      for (const path of uniquePaths) {
        const text = textByPath.get(path);
        if (text === undefined) { fileManager.clearSuppress(path); continue; }
        const tab = createTab(path);
        tab.path = path; tab.content = text; tab.draftContent = text;
        tab.isDirty = false; tab.isEditing = false;
        // 仅对本次激活的标签同步提取大纲，其余延迟到激活时（显著加快多文档启动）
        tab.headings = samePath(path, activePath) ? extractHeadings(text) : [];
        tab.pendingHash = ""; tab.pendingScrollTop = getScroll(path);
        tab.pendingSourceLine = 0; tab.scrollTop = tab.pendingScrollTop;
        tabs.push(tab);
        recentPaths.push(path);
        fileManager.scheduleSuppressClear(path);
        if (samePath(path, activePath)) activeId = tab.id;
      }
      if (!activeId && tabs.length) activeId = tabs[0].id;
      if (activeId) activateTab(activeId);
      // activePath 为空（默认取第一个标签）时补一次大纲提取
      const activated = tabs.find(tb => tb.id === activeId);
      if (activated && !activated.headings.length && activated.draftContent) {
        activated.headings = extractHeadings(activated.draftContent);
      }
      // 最近打开列表批量写入一次，避免每文件一次 localStorage 序列化
      if (recentPaths.length) pushRecentBatch(recentPaths);
      // 注意：恢复期间 watcher 尚未启动，目录监听由 onMounted 中的 startWatching 统一注册
    }
    if (appDisposed) return;
    if (initialPath) await loadFile(initialPath);
  } finally {
    restoreInFlight = false;
  }
}

let unlistenDrop: (() => void) | null = null, unlistenOpen: (() => void) | null = null, unlistenClose: (() => void) | null = null;
let appWindow: import("@tauri-apps/api/window").Window | null = null;

onMount(() => {
  // Task 4 遗留缺口：Vue 版从未调用 attach()，Svelte 版接上键盘/滚轮监听（行为变更，见报告）
  keyboardHandlers.attach();
  void (async () => {
    appStore.applyTheme(); applyReadingSettings();
    const initialPath = await (async () => { try { return await invoke<string | null>("initial_open_file"); } catch { return ""; } })();
    await restoreTabs(typeof initialPath === "string" ? initialPath : "");
    if (currentFile) await syncRootDir(currentFile); else await setHomeRoot();
    // syncRootDir 已启动监听时跳过，避免重复 stop/start
    if (fileTree.rootDir && watcher.watching.value !== fileTree.rootDir) await startWatching(fileTree.rootDir);
    // 探测导出能力：pandoc（DOCX）与 Edge（PDF）
    void checkPandoc().then(info => { pandocInfo = info; }).catch(() => {});
    void checkPdfEngine().then(p => { pdfEnginePath = p; }).catch(() => {});
    try { const { listen } = await import("@tauri-apps/api/event"); unlistenOpen = await listen<string>("glim-reader://open-file", async e => { const p = e.payload; if (typeof p === "string" && p) await loadFile(p); }); } catch { /* ignore */ }
    try { const { getCurrentWindow } = await import("@tauri-apps/api/window"); appWindow = getCurrentWindow(); unlistenClose = await appWindow.onCloseRequested(async event => { if (!tabs.some(tb => tb.isDirty)) return; event.preventDefault(); await fileManager.closeAllTabs(); if (appWindow) await appWindow.destroy(); }); } catch { /* ignore */ }
    try { const webview = getCurrentWebview(); unlistenDrop = await webview.onDragDropEvent(async event => { if (event.payload.type === "drop" && event.payload.paths) { const target = event.payload.paths.find(p => /\.(md|markdown|mdx|txt)$/i.test(p)); if (target) await loadFile(target); } }); } catch { /* ignore */ }
    void refreshRecent(); floatLayout.bindGlobalClick();
  })();
});

onDestroy(() => {
  appDisposed = true; // 标记已卸载：restoreTabs 的异步续体据此中止状态写入
  // Task 4 清单：fileManager 的 effect.root 先停，再把模块级编辑器盒置空
  //（置空写入不得再触发 startWatching —— 顺序：dispose → 置空）
  fileManager.dispose();
  fileManager.editorRef.value = null;
  unlistenDrop?.(); unlistenOpen?.(); unlistenClose?.();
  if (headingTimer) clearTimeout(headingTimer);
  if (searchPosSettleTimer !== null) clearTimeout(searchPosSettleTimer);
  void watcher.stop(); annotations.dispose(); floatLayout.unbindGlobalClick();
  window.removeEventListener("resize", recalcSearchPosition);
  sectionMarkers.dispose();
  keyboardHandlers.detach();
});

// —— 编辑器实例同步进 fileManager 模块盒（其内部 effect 依此触发 startWatching） ——
$effect(() => {
  fileManager.editorRef.value = editorState;
});

// —— Vue watch → $effect，全部按前值比较还原「非 immediate」语义（首跑跳过、时序稳健） ——

// 1. 标签路径持久化
let prevTabsPaths = tabs.map((tb) => tb.path).join("\n");
$effect(() => {
  const paths = tabs.map((tb) => tb.path).join("\n");
  if (paths === prevTabsPaths) return;
  prevTabsPaths = paths;
  persist();
});

// 2. 导出提示 3500ms 自动清除（Vue 为 fire-and-forget，无清理器 —— 保持一致）
$effect(() => {
  if (appStore.exportToast) setTimeout(() => { appStore.exportToast = ""; }, 3500);
});

// 3. 错误提示 5000ms 自动清除
$effect(() => {
  if (appStore.errorMsg) setTimeout(() => { appStore.errorMsg = ""; }, 5000);
});

// 4. 失去活动文件时刷新最近打开
//（基线用 null 哨兵：顶层读 $derived 会触发 state_referenced_locally，首跑在 effect 内建立基线）
let prevHasActive: boolean | null = null;
$effect(() => {
  const v = hasActiveFile;
  if (prevHasActive === null) { prevHasActive = v; return; }
  if (v === prevHasActive) return;
  prevHasActive = v;
  if (!v) void refreshRecent();
});

// 5. 编辑模式切换：进入清选区/模板引用，退出刷新滚动位置
let prevIsEditing: boolean | null = null;
$effect(() => {
  const editing = isEditing;
  if (prevIsEditing === null) { prevIsEditing = editing; return; }
  if (editing === prevIsEditing) return;
  prevIsEditing = editing;
  if (editing) {
    markdownState = null;
    annotations.dispose();
    return;
  }
  void (async () => { await tick(); onScroll(); })();
});

// 6. 激活标签变化：清错误/补后台标签大纲/清高亮/复位章节标记
let prevActiveTabId: string | null = null;
$effect(() => {
  const id = activeTabId;
  if (prevActiveTabId === null) { prevActiveTabId = id; return; }
  if (id === prevActiveTabId) return;
  prevActiveTabId = id;
  appStore.errorMsg = "";
  const newPath = activeTab?.path ?? "";
  // 后台标签在恢复时未提取大纲，激活时补一次（TOC / 章节标记依赖）。
  // 延迟到下一帧并校验仍为当前标签：快速连续切换标签时避免主线程同步 tokenize 卡顿
  const switchedTab = activeTab;
  if (switchedTab && switchedTab.draftContent && !switchedTab.headings.length) {
    const tabId = switchedTab.id;
    requestAnimationFrame(() => {
      const cur = tabsApi.activeTab;
      if (!cur || cur.id !== tabId || cur.headings.length) return;
      cur.headings = extractHeadings(cur.draftContent);
    });
  }
  if (!searchVisible || newPath !== prevTabPath) {
    if (lastSearchQuery && !pendingRestoreQuery) find.clearHighlights();
  }
  prevTabPath = newPath; annotations.dispose();
  if (!activeTab?.isEditing) void (async () => { await tick(); onScroll(); })();
});

// 7. 搜索浮层显隐：显示聚焦输入框并重算位置，隐藏清空查询
let prevSearchVisible: boolean | null = null;
$effect(() => {
  const visible = searchVisible;
  if (prevSearchVisible === null) { prevSearchVisible = visible; return; }
  if (visible === prevSearchVisible) return;
  prevSearchVisible = visible;
  if (visible) {
    const seq = ++searchFocusSeq;
    void (async () => {
      await tick();
      if (seq === searchFocusSeq && searchPanelState) {
        searchPanelState.focusInput();
      }
      recalcSearchPosition();
    })();
  } else {
    lastSearchQuery = "";
    find.query.value = "";
  }
});

// 8. 悬浮布局开关 → 重算搜索位置
let prevFloatLayout: boolean | null = null;
$effect(() => {
  const v = enableFloatLayout;
  if (prevFloatLayout === null) { prevFloatLayout = v; return; }
  if (v === prevFloatLayout) return;
  prevFloatLayout = v;
  requestAnimationFrame(recalcSearchPosition);
});

// 9. 面板开合 → 重算；关闭后 300ms 结算重算（面板仍驻留 DOM 的卸载窗口）。
//    每次关闭都重置计时：快速连续关闭以最后一次为起点（防抖式重挂）。
let prevLeftPanel = floatLayout.state.activeLeftPanel;
$effect(() => {
  const p = floatLayout.state.activeLeftPanel;
  if (p === prevLeftPanel) return;
  prevLeftPanel = p;
  requestAnimationFrame(recalcSearchPosition);
  if (!p) {
    if (searchPosSettleTimer !== null) clearTimeout(searchPosSettleTimer);
    searchPosSettleTimer = setTimeout(() => {
      searchPosSettleTimer = null;
      recalcSearchPosition();
    }, PANEL_UNMOUNT_SETTLE_MS);
  }
});

// 10. 悬浮 Tab 条显隐 → 重算
let prevTopTabBarVisible: boolean | null = null;
$effect(() => {
  const v = topTabBarVisible;
  if (prevTopTabBarVisible === null) { prevTopTabBarVisible = v; return; }
  if (v === prevTopTabBarVisible) return;
  prevTopTabBarVisible = v;
  requestAnimationFrame(recalcSearchPosition);
});

window.addEventListener("resize", recalcSearchPosition, { passive: true });
</script>

  <div class="app flex h-full flex-col overflow-hidden">
    {#if !enableFloatLayout}
      <Toolbar
        {isEditing}
        {isDirty}
        {hasActiveFile}
        saving={appStore.saving}
        canExport={Boolean(activeTab?.draftContent)}
        {exportBusy}
        showExportMenu={showExportMenu}
        {currentFile}
        {displayFileName}
        {rootDir}
        treeLoading={treeLoading}
        showSettings={showSettings.value}
        theme={appStore.theme}
        locale={locale.value}
        hasBookmarkAtCurrentPos={hasBookmarkAtCurrentPos}
        floatLayoutEnabled={enableFloatLayout}
        {pandocInfo}
        {pdfEnginePath}
        onCreateNewFile={fileManager.createNewFile}
        onPickFile={fileManager.openFile}
        onPickFolder={onPickFolder}
        onRefreshTree={() => void refreshTree()}
        onCloseFolder={() => { void watcher.stop(); clearRoot(); }}
        onToggleEditorMode={toggleEditorMode}
        onSave={fileManager.saveCurrentFile}
        onSaveAs={fileManager.saveAs}
        onFind={onFind}
        onToggleExportMenu={toggleExportMenu}
        onCloseExportMenu={closeExportMenu}
        onExportHtml={exportHtml}
        onExportDocx={exportDocx}
        onExportPdf={exportPdf}
        onPrint={doPrint}
        onOpenSettings={() => (showSettings.value = true)}
        onToggleBookmark={handleToggleBookmark}
        onToggleTheme={handleToggleTheme}
        onToggleLocale={handleToggleLocale}
        onToggleFloatLayout={toggleFloatLayout}
      />
    {/if}
    {#if tabs.length && !enableFloatLayout}
      <TabBar {tabs} activeTabId={activeTabId} autoReload={autoReloadWhitelist}
              onActivate={switchToTab}
              onClose={(id) => void fileManager.requestCloseTab(id)}
              onCloseLeft={(id) => void fileManager.closeTabLeft(id)}
              onCloseRight={(id) => void fileManager.closeTabRight(id)}
              onCloseAll={() => fileManager.closeAllTabs()}
              onCloseOthers={(id) => void fileManager.closeTabOthers(id)} />
    {/if}
    <main class="layout flex min-h-0 flex-1 overflow-hidden">
      <!-- tabindex="-1"（原 Vue 为 "0"）：Svelte a11y 禁止非交互元素挂非负 tabindex，
           内容内链接/按钮仍可 Tab 到达，点击本区仍可聚焦滚动 -->
      <section bind:this={viewerElState} class="viewer relative flex-1 max-[1199px]:[--reader-max-width:100%] {isEditing ? 'overflow-hidden' : 'overflow-auto'}" data-scroll-root class:editing={isEditing} tabindex="-1" onscroll={onViewerScroll}>
        {#if appStore.errorMsg}
          <div class="error cursor-pointer px-4 py-2 text-xs text-danger bg-[rgba(207,34,46,0.08)]" role="presentation" onclick={() => (appStore.errorMsg = "")}>{appStore.errorMsg}</div>
        {/if}
        {#if !hasActiveFile}
          <div class="empty flex h-full flex-col items-center justify-center p-8 text-center">
            <div class="empty-title mb-2 text-xl font-semibold text-fg">{t('app.emptyTitle')}</div>
            <div class="empty-hint mb-4 text-sm text-fg-muted">{t('app.emptyHint')}</div>
            <div class="shortcut-hint mb-6 text-xs text-fg-muted">{t('app.shortcutHint')}</div>
            {#if recentFiltered.length}
              <div class="recent-files w-full max-w-[400px] text-left">
                <div class="recent-title mb-2 text-xs text-fg-muted">{t('app.recentFiles')}</div>
                {#each recentFiltered as item (item.path)}
                  <div class="recent-item flex justify-between px-3 py-1.5 rounded cursor-pointer hover:bg-bg-btn-hover" role="presentation" onclick={() => void loadFile(item.path)} title={item.path}>
                    <span class="recent-name text-[13px] text-fg truncate">{item.name}</span><span class="recent-path text-[11px] text-fg-muted truncate">{dirOf(item.path)}</span>
                  </div>
                {/each}
                <button class="recent-clear mt-3 px-2 py-1 text-[11px] text-fg-muted border-none bg-transparent rounded cursor-pointer hover:bg-bg-btn hover:text-fg" onclick={() => { clearRecent(); recentFiltered = []; }}>{t('app.clearRecent')}</button>
              </div>
            {/if}
          </div>
        {:else if isEditing}
          <MarkdownEditor bind:this={editorState} modelValue={draftContent} theme={appStore.theme} currentFile={currentFile} onUpdateModelValue={onDraftUpdate} onToggleMode={toggleEditorMode} />
        {:else}
          <MarkdownView bind:this={markdownState} source={draftContent} {currentFile} {rootDir} renderTick={renderTick} onRendered={handleOnRendered} onInternalLink={(p) => void loadFile(p)} />
        {/if}
        <AnnotationToolbar visible={annotations.toolbar.visible} x={annotations.toolbar.x} y={annotations.toolbar.y} mode={annotations.toolbar.mode}
                           onApply={onAnnotationApply} onInputStart={(m) => { annotations.toolbar.mode = m; }} onCancel={() => (annotations.toolbar.mode = "")}
                           onCopyAi={() => void annotations.copyForAI()} onCopy={onAnnotationCopy} onPaste={onAnnotationPaste}
                           onClearAll={() => void annotations.clearAll()} onReview={openReviewPanel} onAi={openAiPanel} />
      </section>
    </main>
    {#if enableFloatLayout}
      <LeftRail activePanel={floatLayout.state.activeLeftPanel} {dynamicIcons}
                onOpenPanel={(id) => (id === 'search' ? toggleSearchPanel() : ACTION_PANEL_IDS.has(id) ? onFloatPanelAction(id) : floatLayout.openPanel(id))} />
      <TopTrigger enabled onShow={() => (topTabBarVisible = true)} />
    {/if}
    {#if enableFloatLayout && tabs.length}
      <TabBar {tabs} activeTabId={activeTabId} autoReload={autoReloadWhitelist}
              floating={true} visible={topTabBarVisible} onActivate={onFloatFloatingTabActivate}
              onClose={(id) => void fileManager.requestCloseTab(id)} onCloseLeft={(id) => void fileManager.closeTabLeft(id)}
              onCloseRight={(id) => void fileManager.closeTabRight(id)} onCloseAll={() => fileManager.closeAllTabs()}
              onCloseOthers={(id) => void fileManager.closeTabOthers(id)}
              onMouseEnter={onFloatTabBarMouseEnter} onMouseLeave={onFloatTabBarMouseLeave} />
    {/if}
    {#if enableFloatLayout && !isEditing}
      <MobileBottomBar activePanel={floatLayout.state.activeLeftPanel}
                       onOpenPanel={(id) => (id === 'search' ? toggleSearchPanel() : ACTION_PANEL_IDS.has(id) ? onFloatPanelAction(id) : floatLayout.openPanel(id))} />
      <FloatPanelContent
        floatState={{ activeLeftPanel: floatLayout.state.activeLeftPanel, closePanel: () => floatLayout.closePanel() }}
        isMobile={isMobileViewport} {rootDir} {tree} {currentFile}
        {canGoUp} treeFocusKey={treeFocusKey} {loadChildren}
        {recentFiltered} {draftContent} theme={appStore.theme}
        {isEditing} {readingSettings} floatLayoutEnabled={enableFloatLayout}
        showSettings={showSettings.value} {aiPanel}
        onOpenFile={onFloatPanelOpenFile} onGoUp={() => void goUp()} onOpen={onFloatPanelOpenFile}
        onRefreshRecent={refreshRecent} onAnnotationFocus={onReviewFocus}
        onOpenReview={openReviewPanel} onBookmarkJump={handleBookmarkJump}
        onRefreshBookmarks={() => bookmarks.reload()}
        onToggleTheme={handleToggleTheme}
        onZoomIn={handleZoomIn} onZoomOut={handleZoomOut}
        onSetMaxWidth={setMaxWidth} onSetLineHeight={setLineHeight} onToggleFloatLayout={toggleFloatLayout}
        onOpenSettings={() => (showSettings.value = true)}
      />
      <div class="search-overlay" class:is-visible={searchVisible && enableFloatLayout && !isEditing} style={searchOverlayStyleStr}>
        <SearchPanel bind:this={searchPanelState} visible={searchVisible} {rootDir} onClose={closeSearchPanel} onOpen={onFloatPanelOpenSearch} onQueryChange={onSearchQueryChange} />
      </div>
      <TocCapsule {headings} activeId={sectionMarkers.activeId.value} onJump={(id) => sectionMarkers.jumpTo(id)} />
    {/if}
    <SettingsDialog visible={showSettings.value} floatLayoutEnabled={enableFloatLayout} onClose={() => (showSettings.value = false)} onToggleFloatLayout={toggleFloatLayout} />
    <UnsavedChangesDialog visible={showUnsavedDialog.value} title={unsavedDialogMode.value === 'external' ? t('editor.externalChangedTitle') : t('editor.unsavedTitle')}
                          message={unsavedDialogMode.value === 'external' ? t('editor.externalChangedMessage') : t('editor.unsavedMessage')}
                          fileName={dialogTab.value?.path ? basename(dialogTab.value.path) : ''}
                          saveLabel={unsavedDialogMode.value === 'external' ? t('editor.reloadFromDisk') : t('editor.saveAndContinue')}
                          discardLabel={unsavedDialogMode.value === 'external' ? t('editor.keepEditing') : t('editor.discardAndContinue')}
                          onSave={() => unsavedDialog.resolveDialog('save')}
                          onDiscard={() => unsavedDialog.resolveDialog(unsavedDialogMode.value === 'external' ? 'cancel' : 'discard')}
                          onCancel={() => unsavedDialog.resolveDialog('cancel')} />
    <GrantAccessDialog visible={showGrantDialog.value} dir={grantDir.value}
                       onAllow={() => fsAuthorize.resolveDialog(true)} onDeny={() => fsAuthorize.resolveDialog(false)} />
    <Banner tab={bannerTab} visible={showBanner} onReload={onBannerReload} onViewDiff={onBannerViewDiff} onIgnore={onBannerIgnore} onAutoReload={onBannerAutoReload} />
    {#if appStore.exportToast}
      <div class="toast fixed bottom-6 left-1/2 z-50 px-5 py-2.5 text-[13px] text-white bg-success rounded-md cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] [transform:translateX(-50%)] animate-[toastSlideUp_0.25s_ease-out]" role="presentation" onclick={() => (appStore.exportToast = '')}>✓ {appStore.exportToast}</div>
    {/if}
    {#if annotationToast}
      <div class="toast fixed bottom-6 left-1/2 z-50 px-5 py-2.5 text-[13px] text-white bg-success rounded-md cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] [transform:translateX(-50%)] animate-[toastSlideUp_0.25s_ease-out]" role="presentation" onclick={() => (annotationToast = '')}>✓ {annotationToast}</div>
    {/if}
    <DiffView oldContent={diffOldContent} newContent={diffNewContent} fileName={diffFileName} visible={showDiffView} onClose={closeDiffView} />
    <ReviewPanel visible={showReviewPanel} source={draftContent} fileName={currentFile} onApply={onReviewApply} onApplyAll={onReviewApplyAll} onFocus={onReviewFocus} onClose={() => (showReviewPanel = false)} />
    <AiPanel visible={aiPanel.state.visible} selectionText={aiPanel.state.selectionText} result={aiPanel.state.result} loading={aiPanel.state.loading} error={aiPanel.state.error} activeAction={aiPanel.state.activeAction} onRunAction={(a) => void aiPanel.runAction(a)} onApplyResult={() => void aiPanel.applyResultToDoc()} onClose={aiPanel.close} />
    {#if showExportMenu}
      <div class="menu-overlay fixed inset-0 z-[29]" role="presentation" onclick={closeExportMenu}></div>
    {/if}
    <ExportMenu visible={showExportMenu} {pandocInfo} {pdfEnginePath}
                onExportHtml={exportHtml} onExportDocx={exportDocx} onExportPdf={exportPdf}
                onPrint={doPrint} onClose={closeExportMenu} />
  </div>

<!-- 转换规则 8：search-overlay 由「.is-visible 状态类 + :root 暗色祖先变体 + 媒体查询 +
     left 过渡动画」复合驱动，拆成工具类无法保持同一元素上的状态切换与 left 动画语义，
     故保留组件内 <style> 块（Svelte 原生 scoped） -->
<style>
.search-overlay {
  position: fixed; width: 320px; z-index: 60;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(1.2); -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border-left: 0.5px solid rgba(0, 0, 0, 0.06);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
  display: flex; flex-direction: column; overflow: hidden;
  opacity: 0; transform: translateX(8px);
  transition: opacity 150ms ease, transform 150ms cubic-bezier(0.16, 1, 0.3, 1), left 200ms ease;
  pointer-events: none;
}
.search-overlay.is-visible { opacity: 1; transform: translateX(0); pointer-events: auto; }
:root[data-theme="dark"] .search-overlay { background: rgba(24, 24, 24, 0.78); border-left-color: rgba(255, 255, 255, 0.06); box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3); }
@media (max-width: 767px) { .search-overlay { left: 0; right: 0; width: 100vw; height: 100vh; } }
</style>
