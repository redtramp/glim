<script setup lang="ts">
// @ts-check
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "vue-i18n";
import { persistLocale, type AppLocale } from "./i18n";
import { useFileTree } from "./composables/useFileTree";
import { useFileWatcher } from "./composables/useFileWatcher";
import { extractHeadings } from "./composables/useMarkdown";
import { useScrollSpy } from "./composables/useScrollSpy";
import { useFindInPage } from "./composables/useFindInPage";
import { useHistory, type RecentItem } from "./composables/useHistory";
import { useReadingSettings } from "./composables/useReadingSettings";
import { useAnnotations, resolveSelectionRange } from "./composables/useAnnotations";
import { useAiPanel } from "./composables/useAiPanel";
import type { CriticType } from "./composables/criticMarkup";
import { parseCriticMarkup, applyDecision, acceptAllCriticMarkup, rejectAllCriticMarkup } from "./composables/criticMarkup";
import { useTabs, samePath, type Tab } from "./composables/useTabs";
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
import { useFileManager } from "./composables/useFileManager";
import { useKeyboardHandlers } from "./composables/useKeyboardHandlers";
import { useUnsavedDialog } from "./composables/useUnsavedDialog";
import { useFsAuthorize } from "./composables/useFsAuthorize";
import { useFloatLayout, ACTION_PANEL_IDS } from "./composables/useFloatLayout";
import { useSectionMarkers } from "./composables/useSectionMarkers";
import { useBookmarks } from "./composables/useBookmarks";
import { basename, dirOf } from "./utils/path";
import { useAppStore } from "./stores/useAppStore";

// Components
import Toolbar from "./components/Toolbar.vue";
import TabBar from "./components/TabBar.vue";
import LeftRail from "./components/LeftRail.vue";
import TopTrigger from "./components/TopTrigger.vue";
import SearchPanel from "./components/SearchPanel.vue";
import TocCapsule from "./components/TocCapsule.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog.vue";
import GrantAccessDialog from "./components/GrantAccessDialog.vue";
import Banner from "./components/Banner.vue";
import DiffView from "./components/DiffView.vue";
import ReviewPanel from "./components/ReviewPanel.vue";
import AiPanel from "./components/AiPanel.vue";
import MarkdownView from "./components/MarkdownView.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import AnnotationToolbar from "./components/AnnotationToolbar.vue";
import ExportMenu from "./components/ExportMenu.vue";
import MobileBottomBar from "./components/MobileBottomBar.vue";
import FloatPanelContent from "./components/FloatPanelContent.vue";

const { t, locale } = useI18n();
const appStore = useAppStore();
const fileManager = useFileManager();
const unsavedDialog = useUnsavedDialog();
const fsAuthorize = useFsAuthorize();
const floatLayout = useFloatLayout();
const bookmarks = useBookmarks();

const viewerEl = ref<HTMLElement | null>(null);
const markdownRef = ref<{ root: HTMLElement | null } | null>(null);
const bodyRef = computed(() => markdownRef.value?.root ?? null);
const { onScroll } = useScrollSpy(viewerEl, bodyRef);
const find = useFindInPage(bodyRef);
const isMobileViewport = ref(window.innerWidth < 768);
function onResize() { isMobileViewport.value = window.innerWidth < 768; }
window.addEventListener("resize", onResize, { passive: true });
const enableFloatLayout = ref(localStorage.getItem("glim-reader-float-layout") !== "0");
function toggleFloatLayout() {
  enableFloatLayout.value = !enableFloatLayout.value;
  localStorage.setItem("glim-reader-float-layout", enableFloatLayout.value ? "1" : "0");
}
const { rootDir, tree, loading: treeLoading, refresh: refreshTree, openFolder, setRootFromFile, setHomeRoot, clearRoot, canGoUp, goUp, loadChildren } = useFileTree();
const watcher = useFileWatcher();
const { recent, pushRecent, pushRecentBatch, clearRecent, saveScroll, getScroll } = useHistory();
const { apply: applyReadingSettings, settings: readingSettings, setFontSize, setEditorFontSize, setMaxWidth, setLineHeight } = useReadingSettings();
const annotations = useAnnotations();
const aiPanel = useAiPanel();
// 注意：useTabs() 必须先于 useSectionMarkers() 执行 —— 后者的 immediate watch 会同步求值
// headings computed，若 activeTab 尚未初始化将触发 TDZ 崩溃（ReferenceError）
const { tabs, activeTabId, activeTab, findTabByPath, createTab, activateTab, persist, loadPersisted } = useTabs();

const searchVisible = ref(false);
const searchPanelRef = ref<InstanceType<typeof SearchPanel> | null>(null);
let searchFocusSeq = 0; const lastSearchQuery = ref(""); const prevTabPath = ref("");
/** 标记当前是否正在从搜索结果切换到新文件，用于保护 handleOnRendered 中的高亮恢复 */
const pendingRestoreQuery = ref(false);
/** 搜索浮层内联样式，由 recalcSearchPosition 动态更新 */
const searchOverlayStyle = ref<Record<string, string>>({});

/** 根据当前悬浮布局状态计算搜索面板位置，并更新内联样式 */
function recalcSearchPosition(): void {
  if (!enableFloatLayout.value || isEditing.value) {
    searchOverlayStyle.value = {};
    return;
  }
  const tabbarEl = document.querySelector<HTMLElement>(".tab-bar.floating");
  const topOffset = (tabbarEl?.offsetHeight ?? 0) + 20;
  const panelEl = document.querySelector<HTMLElement>(".floating-panel.left");
  const panelWidth = panelEl ? panelEl.offsetWidth : 0;
  const leftOffset = 40 + panelWidth + 20;
  searchOverlayStyle.value = {
    top: `${topOffset}px`,
    left: `${leftOffset}px`,
    height: `calc(100vh - ${topOffset * 2}px)`,
  };
}

const currentFile = computed(() => activeTab.value?.path ?? "");
const draftContent = computed(() => activeTab.value?.draftContent ?? "");
const isEditing = computed(() => activeTab.value?.isEditing ?? false);
const headings = computed(() => activeTab.value?.headings ?? []);
// useSectionMarkers 的 immediate watch 会同步读取 headings，必须在 activeTab 可用后创建
const sectionMarkers = useSectionMarkers(headings, viewerEl, bodyRef);
const isDirty = computed(() => activeTab.value?.isDirty ?? false);
const hasActiveFile = computed(() => Boolean(activeTab.value?.path));
const fileName = computed(() => currentFile.value ? basename(currentFile.value) : t("app.noFile"));
const displayFileName = computed(() => isDirty.value ? `${fileName.value} *` : fileName.value);
const hasBookmarkAtCurrentPos = computed(() => !currentFile.value || !viewerEl.value ? false : bookmarks.hasAt(currentFile.value, viewerEl.value.scrollTop));
const dynamicIcons = computed(() => ({ "locale-toggle": locale.value === "zh-CN" ? "中" : "En", "edit": isEditing.value ? "👁" : "✎" }));
const showUnsavedDialog = unsavedDialog.showUnsavedDialog;
const showGrantDialog = fsAuthorize.showGrantDialog;
const grantDir = fsAuthorize.grantDir;
const unsavedDialogMode = unsavedDialog.unsavedDialogMode;
const dialogTab = unsavedDialog.dialogTab;
const editorRef = fileManager.editorRef;

/** 悬浮面板关闭后仍驻留 DOM 的卸载窗口（FloatingPanel unmountTimer 250ms）+ 缓冲 */
const PANEL_UNMOUNT_SETTLE_MS = 300;
let searchPosSettleTimer: ReturnType<typeof setTimeout> | null = null;

function closeSearchPanel() { searchVisible.value = false; lastSearchQuery.value = ""; find.query.value = ""; find.clearHighlights(); }
function onSearchQueryChange(q: string) { const q2 = q.trim(); lastSearchQuery.value = q2; find.query.value = q2; }

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
    const t2 = activeTab.value;
    if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
    existing.pendingHash = hash; existing.pendingScrollTop = 0; existing.pendingSourceLine = sourceLine;
    activateTab(existing.id); await syncRootDir(path);
    if (lastSearchQuery.value) { find.highlightSearch(lastSearchQuery.value); lastSearchQuery.value = ""; }
    if (existing.pendingSourceLine > 0) { scrollPreviewToSourceLine(existing.pendingSourceLine); existing.pendingSourceLine = 0; }
    return;
  }
  const t2 = activeTab.value;
  if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
  const tab = createTab(path);
  try { await readFileIntoTab(tab, path, hash, sourceLine); } catch (e: any) { appStore.errorMsg = `${t("errors.readFailed")}: ${e?.message || e}`; return; }
  tabs.value.push(tab); activateTab(tab.id); await syncRootDir(path);
}

async function forceReloadTab(tab: Tab) {
  fileManager.addSuppress(tab.path);
  try {
    const text = await fsAuthorize.readTextFileAuthorized(tab.path);
    tab.content = text; tab.draftContent = text; tab.isDirty = false; tab.headings = extractHeadings(text);
    if (tab.id === activeTabId.value) { tab.pendingHash = ""; tab.pendingScrollTop = tab.scrollTop; tab.pendingSourceLine = 0; find.clearHighlights(); }
    fileManager.scheduleSuppressClear(tab.path);
  } catch (e: any) { fileManager.clearSuppress(tab.path); appStore.errorMsg = `${t("errors.readFailed")}: ${e?.message || e}`; }
}

async function switchToTab(id: string) {
  if (id === activeTabId.value) return;
  const t2 = activeTab.value;
  if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); }
  const tab = tabs.value.find(x => x.id === id); if (!tab) return;
  tab.pendingHash = ""; tab.pendingScrollTop = tab.scrollTop; tab.pendingSourceLine = 0;
  activateTab(id); await syncRootDir(tab.path);
  if (tab.staleSince) { bannerTab.value = tab; showBanner.value = true; }
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
  const tab = activeTab.value; if (!tab) return;
  tab.draftContent = value; tab.isDirty = value !== tab.content;
  if (headingTimer) clearTimeout(headingTimer);
  headingTimer = setTimeout(() => { tab.headings = extractHeadings(value); }, 200);
}

let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
function onViewerScroll() {
  if (isEditing.value) return; onScroll();
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => { const t2 = activeTab.value; if (t2 && t2.path && viewerEl.value && !t2.isEditing) { t2.scrollTop = viewerEl.value.scrollTop; saveScroll(t2.path, viewerEl.value.scrollTop); } }, 400);
}

async function startWatching(dir: string) {
  await watcher.start(dir, async (paths) => {
    const relevant = paths.filter(p => tabs.value.some(t => samePath(p, t.path)));
    if (relevant.length > 0 && relevant.every(p => fileManager.isSuppressed(p))) return;
    await refreshTree();
    setTimeout(async () => {
      for (const tab of [...tabs.value]) {
        if (!paths.some(p => samePath(p, tab.path))) continue;
        if (fileManager.isSuppressed(tab.path)) continue;
        try { const diskText = await readTextFile(tab.path); if (diskText === tab.draftContent) continue; } catch { /* ignore */ }
        const normalized = tab.path.replace(/\\/g, "/").toLowerCase();
        if (autoReloadWhitelist.value.includes(normalized) && !tab.isDirty) { await forceReloadTab(tab); continue; }
        if (tab.isEditing) continue; tab.staleSince = Date.now();
        if (tab.id === activeTabId.value) { bannerTab.value = tab; showBanner.value = true; }
      }
    }, 150);
  });
  const dirs = new Set<string>();
  for (const tab of tabs.value) { const d = dirOf(tab.path); if (d) dirs.add(d); }
  for (const d of dirs) void watcher.watchFile(d);
}

async function syncRootDir(path: string) {
  const targetDir = dirOf(path); if (!targetDir || samePath(rootDir.value, targetDir)) return;
  await setRootFromFile(path); await startWatching(targetDir);
}

function toggleEditorMode() {
  const tab = activeTab.value; if (!tab) return;
  if (tab.isEditing) { tab.pendingSourceLine = editorRef.value?.getTopVisibleLine() ?? 1; tab.pendingScrollTop = 0; tab.isEditing = false; find.reset(); return; }
  tab.pendingSourceLine = 0; tab.isEditing = true;
  nextTick(() => editorRef.value?.scrollToLine(getPreviewTopSourceLine()));
}

const autoReloadWhitelist = ref<string[]>(JSON.parse(localStorage.getItem("glim-reader-auto-reload-whitelist") || "[]"));
function toggleAutoReload(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (autoReloadWhitelist.value.includes(normalized)) autoReloadWhitelist.value = autoReloadWhitelist.value.filter(p => p !== normalized);
  else autoReloadWhitelist.value.push(normalized);
  localStorage.setItem("glim-reader-auto-reload-whitelist", JSON.stringify(autoReloadWhitelist.value));
}

const showBanner = ref(false); const bannerTab = ref<Tab | null>(null);
const showDiffView = ref(false); const diffOldContent = ref(""); const diffNewContent = ref(""); const diffFileName = ref("");
function closeDiffView() { showDiffView.value = false; }
async function onBannerViewDiff() {
  const tab = bannerTab.value; if (!tab) return;
  try { const newText = await readTextFile(tab.path); diffOldContent.value = tab.draftContent; diffNewContent.value = newText; diffFileName.value = basename(tab.path); showDiffView.value = true; } catch { /* ignore */ }
}
function onBannerIgnore() { const tab = bannerTab.value; if (tab) tab.staleSince = null; showBanner.value = false; bannerTab.value = null; }
async function onBannerReload() { const tab = bannerTab.value; if (tab) { await forceReloadTab(tab); tab.staleSince = null; } showBanner.value = false; bannerTab.value = null; }
function onBannerAutoReload() { const tab = bannerTab.value; if (tab) toggleAutoReload(tab.path); showBanner.value = false; bannerTab.value = null; }

const renderTick = ref(0); const treeFocusKey = ref(0);
const annotationToast = ref(""); let annotationToastTimer: ReturnType<typeof setTimeout> | null = null;
function showAnnotationToast(message: string) { annotationToast.value = message; if (annotationToastTimer) clearTimeout(annotationToastTimer); annotationToastTimer = setTimeout(() => { annotationToast.value = ""; }, 2500); }
const showExportMenu = ref(false);
const exportBusy = ref(false);
const pandocInfo = ref<PandocInfo | null>(null);
const pdfEnginePath = ref<string | null>(null);

function toggleExportMenu() { showExportMenu.value = !showExportMenu.value; }
function closeExportMenu() { showExportMenu.value = false; }

/** 导出/打印前必须处于预览模式且有内容 */
function ensurePreviewForExport(): boolean {
  if (isEditing.value) {
    closeExportMenu();
    appStore.errorMsg = t("editor.previewBeforeExport");
    return false;
  }
  if (!bodyRef.value || !draftContent.value) {
    closeExportMenu();
    return false;
  }
  return true;
}

async function exportHtml() {
  if (!ensurePreviewForExport()) return;
  try {
    const dest = await exportToHtml(
      bodyRef.value!, fileName.value || "document.html", currentFile.value || undefined
    );
    showExportMenu.value = false;
    if (dest) appStore.exportToast = dest;
  } catch (e: any) {
    showExportMenu.value = false;
    appStore.errorMsg = `${t("export.exportFailed")}: ${e?.message ?? e}`;
  }
}

async function exportDocx() {
  if (!ensurePreviewForExport()) return;
  exportBusy.value = true;
  appStore.exportToast = t("export.generatingDocx");
  try {
    const out = await exportToDocx(
      bodyRef.value!, fileName.value || "document",
      displayFileName.value, currentFile.value || undefined
    );
    appStore.exportToast = out ? `${t("export.exportedDocx")}: ${out}` : "";
  } catch (e: any) {
    appStore.errorMsg = `${t("export.docxFailed")}: ${e?.message ?? e}`;
    appStore.exportToast = "";
  } finally {
    exportBusy.value = false;
    showExportMenu.value = false;
  }
}

async function exportPdf() {
  if (!ensurePreviewForExport()) return;
  exportBusy.value = true;
  appStore.exportToast = t("export.generatingPdf");
  try {
    const result = await exportToPdf(
      bodyRef.value!, fileName.value || "document", displayFileName.value,
      currentFile.value || undefined,
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
      pdfEnginePath.value = result.edge_path;
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
    exportBusy.value = false;
    showExportMenu.value = false;
  }
}

function doPrint() {
  if (isEditing.value) {
    closeExportMenu();
    appStore.errorMsg = t("editor.previewBeforeExport");
    return;
  }
  if (bodyRef.value) printDocument(bodyRef.value, fileName.value);
}

function annotationContext() {
  const tab = activeTab.value; if (!tab || !tab.path) return null;
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
  const tab = activeTab.value; if (!tab) return;
  if (!window.confirm(t("ai.applyConfirm"))) return;
  tab.draftContent = rejectAllCriticMarkup(text); tab.isDirty = true; aiPanel.close();
}
function openReviewPanel() { annotations.hide(); showReviewPanel.value = true; }
function onReviewApply(decision: "accept" | "reject", id: number) {
  const tab = activeTab.value; if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find(a => a.id === id); if (!ann) return;
  tab.draftContent = applyDecision(tab.draftContent, ann, decision); tab.isDirty = true;
}
function onReviewApplyAll(decision: "accept" | "reject") {
  const tab = activeTab.value; if (!tab) return;
  tab.draftContent = decision === "accept" ? acceptAllCriticMarkup(tab.draftContent) : rejectAllCriticMarkup(tab.draftContent); tab.isDirty = true;
}
function onReviewFocus(id: number) {
  const tab = activeTab.value; if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find(a => a.id === id); if (ann) scrollPreviewToSourceLine(ann.line);
}

const recentFiltered = ref<RecentItem[]>([]);
async function refreshRecent() {
  const checks = await Promise.all(recent.value.slice(0, 10).map(async (item) => {
    try { return { item, ok: await exists(item.path) }; } catch { return { item, ok: false }; }
  }));
  recentFiltered.value = checks.filter(c => c.ok).map(c => c.item);
}

// Keyboard handlers — must be after all handler functions are defined
const keyboardHandlers = useKeyboardHandlers({
  fileManager: { openFile: fileManager.openFile, saveCurrentFile: fileManager.saveCurrentFile, saveAs: fileManager.saveAs, closeCurrentTab: fileManager.closeCurrentTab, closeAllTabs: fileManager.closeAllTabs, createNewFile: fileManager.createNewFile },
  floatLayout, unsavedDialog, onOpenSearch: () => { searchVisible.value = true; }, enableFloatLayout: () => enableFloatLayout.value,
});
const showSettings = keyboardHandlers.showSettings;
const showReviewPanel = ref(false);

function handleToggleBookmark() {
  const tab = activeTab.value; if (!tab || !viewerEl.value || isEditing.value) return;
  const scrollTop = viewerEl.value.scrollTop;
  const h = headings.value.filter(hh => {
    const el = bodyRef.value?.querySelector(`#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(hh.id) : hh.id}`);
    if (!el) return false;
    return el.getBoundingClientRect().top + scrollTop - viewerEl.value!.getBoundingClientRect().top <= scrollTop + 16;
  }).pop();
  const label = h?.text;
  const r = bookmarks.toggle(tab.path, scrollTop, label, label);
  showAnnotationToast(r ? t('float.bookmarkAdded') : t('float.bookmarkRemoved'));
}
function handleToggleTheme() { appStore.toggleTheme(); renderTick.value++; }
function handleToggleLocale() { const next = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'; locale.value = next; persistLocale(next as AppLocale); }
function handleOnRendered() {
  nextTick(() => {
    const tab = activeTab.value; if (!viewerEl.value || !tab) return;
    annotations.configure(annotationContext, () => bodyRef.value);
    annotations.initSelectionWatch();
    aiPanel.configure(() => ({ getSource: () => activeTab.value?.draftContent ?? '', applyResult: onAiApplyResult }));
    if (tab.pendingHash) { sectionMarkers.jumpTo(tab.pendingHash); tab.pendingHash = ''; }
    if (lastSearchQuery.value) { find.highlightSearch(lastSearchQuery.value); lastSearchQuery.value = ''; }
    pendingRestoreQuery.value = false;
    if (tab.pendingSourceLine > 0) { scrollPreviewToSourceLine(tab.pendingSourceLine); tab.pendingSourceLine = 0; }
    else if (tab.pendingScrollTop > 0) viewerEl.value.scrollTop = tab.pendingScrollTop;
    else viewerEl.value.scrollTop = 0;
  });
}
function handleBookmarkJump(path: string, scrollTop: number) {
  floatLayout.closePanel();
  void loadFile(path).then(() => { nextTick(() => { if (viewerEl.value) viewerEl.value.scrollTop = scrollTop; }); });
}
function handleZoomIn() { isEditing.value ? setEditorFontSize(readingSettings.value.editorFontSize + 1) : setFontSize(readingSettings.value.fontSize + 1); }
function handleZoomOut() { isEditing.value ? setEditorFontSize(readingSettings.value.editorFontSize - 1) : setFontSize(readingSettings.value.fontSize - 1); }

let topTabBarVisible = ref(true);
let topTabBarHideTimer: ReturnType<typeof setTimeout> | null = null;
function onFloatFloatingTabActivate(id: string) { void switchToTab(id); topTabBarVisible.value = true; setTimeout(() => { topTabBarVisible.value = false; }, 2000); }
function onFloatTabBarMouseEnter() { topTabBarVisible.value = true; if (topTabBarHideTimer !== null) { clearTimeout(topTabBarHideTimer); topTabBarHideTimer = null; } }
function onFloatTabBarMouseLeave() {
  if (topTabBarHideTimer !== null) clearTimeout(topTabBarHideTimer);
  topTabBarHideTimer = setTimeout(() => { topTabBarVisible.value = false; topTabBarHideTimer = null; }, 2000);
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
function toggleSearchPanel() { searchVisible.value = !searchVisible.value; }
function onFind() { if (isEditing.value) editorRef.value?.openSearch(); else searchVisible.value = true; }
async function onPickFolder() { const d = await openFolder(); if (d) await startWatching(d); }
function onFloatPanelOpenSearch(path: string, line: number) {
  const currentPath = activeTab.value?.path;
  if (currentPath && samePath(path, currentPath) && !activeTab.value?.isEditing) {
    const q = find.query.value || lastSearchQuery.value;
    if (q) { find.query.value = q; lastSearchQuery.value = q; }
    nextTick(() => { find.scrollToLine(line); });
    return;
  }
  const q = find.query.value || lastSearchQuery.value;
  if (q) lastSearchQuery.value = q;
  pendingRestoreQuery.value = true;
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
      // 窗口在恢复期间已关闭（onUnmounted）：不再装配标签/激活/写历史，避免状态写入已销毁实例
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
        tabs.value.push(tab);
        recentPaths.push(path);
        fileManager.scheduleSuppressClear(path);
        if (samePath(path, activePath)) activeId = tab.id;
      }
      if (!activeId && tabs.value.length) activeId = tabs.value[0].id;
      if (activeId) activateTab(activeId);
      // activePath 为空（默认取第一个标签）时补一次大纲提取
      const activated = tabs.value.find(tb => tb.id === activeId);
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

onMounted(async () => {
  appStore.applyTheme(); applyReadingSettings();
  const initialPath = await (async () => { try { return await invoke<string | null>("initial_open_file"); } catch { return ""; } })();
  await restoreTabs(typeof initialPath === "string" ? initialPath : "");
  if (currentFile.value) await syncRootDir(currentFile.value); else await setHomeRoot();
  // syncRootDir 已启动监听时跳过，避免重复 stop/start
  if (rootDir.value && watcher.watching.value !== rootDir.value) await startWatching(rootDir.value);
  // 探测导出能力：pandoc（DOCX）与 Edge（PDF）
  void checkPandoc().then(info => { pandocInfo.value = info; }).catch(() => {});
  void checkPdfEngine().then(p => { pdfEnginePath.value = p; }).catch(() => {});
  try { const { listen } = await import("@tauri-apps/api/event"); unlistenOpen = await listen<string>("glim-reader://open-file", async e => { const p = e.payload; if (typeof p === "string" && p) await loadFile(p); }); } catch { /* ignore */ }
  try { const { getCurrentWindow } = await import("@tauri-apps/api/window"); appWindow = getCurrentWindow(); unlistenClose = await appWindow.onCloseRequested(async event => { if (!tabs.value.some(tb => tb.isDirty)) return; event.preventDefault(); await fileManager.closeAllTabs(); if (appWindow) await appWindow.destroy(); }); } catch { /* ignore */ }
  try { const webview = getCurrentWebview(); unlistenDrop = await webview.onDragDropEvent(async event => { if (event.payload.type === "drop" && event.payload.paths) { const target = event.payload.paths.find(p => /\.(md|markdown|mdx|txt)$/i.test(p)); if (target) await loadFile(target); } }); } catch { /* ignore */ }
  void refreshRecent(); floatLayout.bindGlobalClick();
});

onUnmounted(() => {
  appDisposed = true; // 标记已卸载：restoreTabs 的异步续体据此中止状态写入
  unlistenDrop?.(); unlistenOpen?.(); unlistenClose?.();
  if (headingTimer) clearTimeout(headingTimer);
  if (searchPosSettleTimer !== null) clearTimeout(searchPosSettleTimer);
  void watcher.stop(); annotations.dispose(); floatLayout.unbindGlobalClick();
});

watch(() => tabs.value.map(tb => tb.path).join("\n"), () => persist());
watch(() => appStore.exportToast, (v) => { if (v) setTimeout(() => { appStore.exportToast = ""; }, 3500); });
watch(() => appStore.errorMsg, (v) => { if (v) setTimeout(() => { appStore.errorMsg = ""; }, 5000); });
watch(hasActiveFile, (v) => { if (!v) void refreshRecent(); });
watch(isEditing, (editing) => { if (editing) { markdownRef.value = null; annotations.dispose(); return; } nextTick(onScroll); });
watch(activeTabId, () => {
  appStore.errorMsg = ""; const newPath = activeTab.value?.path ?? "";
  // 后台标签在恢复时未提取大纲，激活时补一次（TOC / 章节标记依赖）。
  // 延迟到下一帧并校验仍为当前标签：快速连续切换标签时避免主线程同步 tokenize 卡顿
  const switchedTab = activeTab.value;
  if (switchedTab && switchedTab.draftContent && !switchedTab.headings.length) {
    const tabId = switchedTab.id;
    requestAnimationFrame(() => {
      const cur = activeTab.value;
      if (!cur || cur.id !== tabId || cur.headings.length) return;
      cur.headings = extractHeadings(cur.draftContent);
    });
  }
  if (!searchVisible.value || newPath !== prevTabPath.value) {
    if (lastSearchQuery.value && !pendingRestoreQuery.value) find.clearHighlights();
  }
  prevTabPath.value = newPath; annotations.dispose();
  if (!activeTab.value?.isEditing) nextTick(onScroll);
});
watch(() => searchVisible.value, (visible) => {
  if (visible) {
    const seq = ++searchFocusSeq;
    void nextTick(() => {
      if (seq === searchFocusSeq && searchPanelRef.value) {
        searchPanelRef.value.focusInput();
      }
      recalcSearchPosition();
    });
  } else {
    lastSearchQuery.value = "";
    find.query.value = "";
  }
});
watch(enableFloatLayout, () => { void requestAnimationFrame(recalcSearchPosition); });
watch(() => floatLayout.state.activeLeftPanel, () => {
  void requestAnimationFrame(recalcSearchPosition);
  // FloatingPanel 关闭后仍保留在 DOM 中 250ms（unmountTimer，供滑出动画），
  // 此刻立即重算仍会读到面板宽度，搜索框位置无法恢复。延迟到面板真正卸载后再重算一次。
  // 每次关闭都重置计时：快速连续关闭面板时，以最后一次关闭为起点（防抖式重挂），
  // 避免旧的待执行计时器在面板仍驻留时触发后无人再重算。
  if (!floatLayout.state.activeLeftPanel) {
    if (searchPosSettleTimer !== null) clearTimeout(searchPosSettleTimer);
    searchPosSettleTimer = setTimeout(() => {
      searchPosSettleTimer = null;
      recalcSearchPosition();
    }, PANEL_UNMOUNT_SETTLE_MS);
  }
});
watch(topTabBarVisible, () => { void requestAnimationFrame(recalcSearchPosition); });

window.addEventListener("resize", recalcSearchPosition, { passive: true });
onUnmounted(() => window.removeEventListener("resize", recalcSearchPosition));
</script>

<template>
  <div class="app">
    <Toolbar v-if="!enableFloatLayout"
             :is-editing="isEditing" :is-dirty="isDirty" :has-active-file="hasActiveFile" :saving="appStore.saving"
             :can-export="Boolean(activeTab?.draftContent)" :export-busy="exportBusy" :show-export-menu="showExportMenu"
             :current-file="currentFile" :display-file-name="displayFileName" :root-dir="rootDir"
             :tree-loading="treeLoading" :show-settings="showSettings" :theme="appStore.theme"
             :locale="locale" :has-bookmark-at-current-pos="hasBookmarkAtCurrentPos"
             :float-layout-enabled="enableFloatLayout" :pandoc-info="pandocInfo" :pdf-engine-path="pdfEnginePath"
             @create-new-file="fileManager.createNewFile" @pick-file="fileManager.openFile"
             @pick-folder="onPickFolder"
             @refresh-tree="void refreshTree()" @close-folder="() => { void watcher.stop(); clearRoot(); }"
             @toggle-editor-mode="toggleEditorMode" @save="fileManager.saveCurrentFile"
             @save-as="fileManager.saveAs" @find="onFind"
             @toggle-export-menu="toggleExportMenu" @close-export-menu="closeExportMenu"
             @export-html="exportHtml" @export-docx="exportDocx" @export-pdf="exportPdf"
             @print="doPrint"
             @open-settings="showSettings = true"
             @toggle-bookmark="handleToggleBookmark"
             @toggle-theme="handleToggleTheme"
             @toggle-locale="handleToggleLocale"
             @toggle-float-layout="toggleFloatLayout"
    />
    <TabBar v-if="tabs.length && !enableFloatLayout" :tabs="tabs" :active-tab-id="activeTabId" :auto-reload="autoReloadWhitelist"
            @activate="switchToTab" @close="(id) => void fileManager.requestCloseTab(id)"
            @close-left="(id) => void fileManager.closeTabLeft(id)" @close-right="(id) => void fileManager.closeTabRight(id)"
            @close-all="fileManager.closeAllTabs()" @close-others="(id) => void fileManager.closeTabOthers(id)" />
    <main class="layout">
      <section ref="viewerEl" class="viewer" data-scroll-root :class="{ editing: isEditing }" tabindex="0" @scroll.passive="onViewerScroll">
        <div v-if="appStore.errorMsg" class="error" @click="appStore.errorMsg = ''">{{ appStore.errorMsg }}</div>
        <div v-if="!hasActiveFile" class="empty">
          <div class="empty-title">{{ t('app.emptyTitle') }}</div>
          <div class="empty-hint">{{ t('app.emptyHint') }}</div>
          <div class="shortcut-hint">{{ t('app.shortcutHint') }}</div>
          <div v-if="recentFiltered.length" class="recent-files">
            <div class="recent-title">{{ t('app.recentFiles') }}</div>
            <div v-for="item in recentFiltered" :key="item.path" class="recent-item" @click="loadFile(item.path)" :title="item.path">
              <span class="recent-name">{{ item.name }}</span><span class="recent-path">{{ dirOf(item.path) }}</span>
            </div>
            <button class="recent-clear" @click="clearRecent(); recentFiltered = []">{{ t('app.clearRecent') }}</button>
          </div>
        </div>
        <MarkdownEditor v-else-if="isEditing" ref="editorRef" :model-value="draftContent" :theme="appStore.theme" :current-file="currentFile" @update:model-value="onDraftUpdate" @toggle-mode="toggleEditorMode" />
        <MarkdownView v-else ref="markdownRef" :source="draftContent" :current-file="currentFile" :root-dir="rootDir" :render-tick="renderTick" @rendered="handleOnRendered" @internal-link="p => void loadFile(p)" />
        <AnnotationToolbar :visible="annotations.toolbar.visible" :x="annotations.toolbar.x" :y="annotations.toolbar.y" :mode="annotations.toolbar.mode"
                           @apply="onAnnotationApply" @input-start="(m: any) => { annotations.toolbar.mode = m; }" @cancel="annotations.toolbar.mode = ''"
                           @copy-ai="() => void annotations.copyForAI()" @copy="onAnnotationCopy" @paste="onAnnotationPaste"
                           @clear-all="() => void annotations.clearAll()" @review="openReviewPanel" @ai="openAiPanel" />
      </section>
    </main>
    <LeftRail v-if="enableFloatLayout" :active-panel="floatLayout.state.activeLeftPanel" :dynamic-icons="dynamicIcons"
              @open-panel="(id: string) => (id === 'search' ? toggleSearchPanel() : ACTION_PANEL_IDS.has(id as any) ? onFloatPanelAction(id) : floatLayout.openPanel(id as any))" />
    <TopTrigger v-if="enableFloatLayout" enabled @show="topTabBarVisible = true" />
    <TabBar v-if="enableFloatLayout && tabs.length" :tabs="tabs" :active-tab-id="activeTabId" :auto-reload="autoReloadWhitelist"
            :floating="true" :visible="topTabBarVisible" @activate="onFloatFloatingTabActivate"
            @close="(id) => void fileManager.requestCloseTab(id)" @close-left="(id) => void fileManager.closeTabLeft(id)"
            @close-right="(id) => void fileManager.closeTabRight(id)" @close-all="fileManager.closeAllTabs()"
            @close-others="(id) => void fileManager.closeTabOthers(id)"
            @mouse-enter="onFloatTabBarMouseEnter" @mouse-leave="onFloatTabBarMouseLeave" />
    <template v-if="enableFloatLayout && !isEditing">
      <MobileBottomBar :active-panel="floatLayout.state.activeLeftPanel"
                       @open-panel="(id: string) => (id === 'search' ? toggleSearchPanel() : ACTION_PANEL_IDS.has(id as any) ? onFloatPanelAction(id) : floatLayout.openPanel(id as any))" />
      <FloatPanelContent
        :float-state="{ activeLeftPanel: floatLayout.state.activeLeftPanel, closePanel: () => floatLayout.closePanel() }"
        :is-mobile="isMobileViewport" :root-dir="rootDir" :tree="tree" :current-file="currentFile"
        :can-go-up="canGoUp" :tree-focus-key="treeFocusKey" :load-children="loadChildren"
        :recent-filtered="recentFiltered" :draft-content="draftContent" :theme="appStore.theme"
        :is-editing="isEditing" :reading-settings="readingSettings" :float-layout-enabled="enableFloatLayout"
        :show-settings="showSettings" :ai-panel="aiPanel"
        @open-file="onFloatPanelOpenFile" @go-up="() => void goUp()" @open="onFloatPanelOpenFile"
        @refresh-recent="refreshRecent" @annotation-focus="onReviewFocus"
        @open-review="openReviewPanel" @bookmark-jump="handleBookmarkJump"
        @refresh-bookmarks="() => bookmarks.reload()"
        @toggle-theme="handleToggleTheme"
        @zoom-in="handleZoomIn" @zoom-out="handleZoomOut"
        @set-max-width="setMaxWidth" @set-line-height="setLineHeight" @toggle-float-layout="toggleFloatLayout"
        @open-settings="showSettings = true"
      />
      <div class="search-overlay" :class="{ 'is-visible': searchVisible && enableFloatLayout && !isEditing }" :style="searchOverlayStyle">
        <SearchPanel ref="searchPanelRef" :visible="searchVisible" :root-dir="rootDir" @close="closeSearchPanel" @open="onFloatPanelOpenSearch" @query-change="onSearchQueryChange" />
      </div>
      <TocCapsule :headings="headings" :active-id="sectionMarkers.activeId.value" @jump="id => sectionMarkers.jumpTo(id)" />
    </template>
    <SettingsDialog :visible="showSettings" :float-layout-enabled="enableFloatLayout" @close="showSettings = false" @toggle-float-layout="toggleFloatLayout" />
    <UnsavedChangesDialog :visible="showUnsavedDialog" :title="unsavedDialogMode === 'external' ? t('editor.externalChangedTitle') : t('editor.unsavedTitle')"
                          :message="unsavedDialogMode === 'external' ? t('editor.externalChangedMessage') : t('editor.unsavedMessage')"
                          :file-name="dialogTab?.path ? basename(dialogTab.path) : ''"
                          :save-label="unsavedDialogMode === 'external' ? t('editor.reloadFromDisk') : t('editor.saveAndContinue')"
                          :discard-label="unsavedDialogMode === 'external' ? t('editor.keepEditing') : t('editor.discardAndContinue')"
                          @save="unsavedDialog.resolveDialog('save')"
                          @discard="unsavedDialog.resolveDialog(unsavedDialogMode === 'external' ? 'cancel' : 'discard')"
                          @cancel="unsavedDialog.resolveDialog('cancel')" />
    <GrantAccessDialog :visible="showGrantDialog" :dir="grantDir"
                       @allow="fsAuthorize.resolveDialog(true)" @deny="fsAuthorize.resolveDialog(false)" />
    <Banner :tab="bannerTab" :visible="showBanner" :on-reload="onBannerReload" :on-view-diff="onBannerViewDiff" :on-ignore="onBannerIgnore" :on-auto-reload="onBannerAutoReload" />
    <div v-if="appStore.exportToast" class="toast" @click="appStore.exportToast = ''">✓ {{ appStore.exportToast }}</div>
    <div v-if="annotationToast" class="toast" @click="annotationToast = ''">✓ {{ annotationToast }}</div>
    <DiffView :old-content="diffOldContent" :new-content="diffNewContent" :file-name="diffFileName" :visible="showDiffView" @close="closeDiffView" />
    <ReviewPanel :visible="showReviewPanel" :source="draftContent" :file-name="currentFile" @apply="onReviewApply" @apply-all="onReviewApplyAll" @focus="onReviewFocus" @close="showReviewPanel = false" />
    <AiPanel :visible="aiPanel.state.visible" :selection-text="aiPanel.state.selectionText" :result="aiPanel.state.result" :loading="aiPanel.state.loading" :error="aiPanel.state.error" :active-action="aiPanel.state.activeAction" @run-action="(a: any) => void aiPanel.runAction(a)" @apply-result="() => void aiPanel.applyResultToDoc()" @close="aiPanel.close" />
    <div v-if="showExportMenu" class="menu-overlay" @click="closeExportMenu"></div>
    <ExportMenu :visible="showExportMenu" :pandoc-info="pandocInfo" :pdf-engine-path="pdfEnginePath"
                @export-html="exportHtml" @export-docx="exportDocx" @export-pdf="exportPdf"
                @print="doPrint" @close="closeExportMenu" />
  </div>
</template>

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
