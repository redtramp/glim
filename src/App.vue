<script setup lang="ts">
// @ts-check
import Banner from "./components/Banner.vue";
import DiffView from "./components/DiffView.vue";
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "vue-i18n";
import { persistLocale, type AppLocale } from "./i18n";
import MarkdownView from "./components/MarkdownView.vue";
import FileTree from "./components/FileTree.vue";
import FindBar from "./components/FindBar.vue";
import SearchPanel from "./components/SearchPanel.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import AnnotationToolbar from "./components/AnnotationToolbar.vue";
import ReviewPanel from "./components/ReviewPanel.vue";
import AiPanel from "./components/AiPanel.vue";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog.vue";
import TabBar from "./components/TabBar.vue";
import { useFileTree } from "./composables/useFileTree";
import { useFileWatcher } from "./composables/useFileWatcher";
import { extractHeadings } from "./composables/useMarkdown";
import { useScrollSpy } from "./composables/useScrollSpy";
import { useFindInPage } from "./composables/useFindInPage";
import { useHistory, type RecentItem } from "./composables/useHistory";
import { useReadingSettings } from "./composables/useReadingSettings";
import { useShortcuts } from "./composables/useShortcuts";
import { useAnnotations } from "./composables/useAnnotations";
import {
  resolveSelectionRange,
} from "./composables/useAnnotations";
import { useAiPanel } from "./composables/useAiPanel";
import type { CriticType } from "./composables/criticMarkup";
import {
  parseCriticMarkup,
  applyDecision,
  acceptAllCriticMarkup,
  rejectAllCriticMarkup,
} from "./composables/criticMarkup";
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

// 悬浮布局（P0）
import LeftRail from "./components/LeftRail.vue";
import FloatingPanel from "./components/FloatingPanel.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
import QuickSettings from "./components/QuickSettings.vue";
import { useFloatLayout, ACTION_PANEL_IDS } from "./composables/useFloatLayout";
import { useSectionMarkers } from "./composables/useSectionMarkers";
import { useBookmarks } from "./composables/useBookmarks";
import { basename, dirOf } from "./utils/path";
import TocCapsule from "./components/TocCapsule.vue";
import AnnotationList from "./components/AnnotationList.vue";
import BookmarkPanel from "./components/BookmarkPanel.vue";
import AiPanelInline from "./components/AiPanelInline.vue";
import Toolbar from "./components/Toolbar.vue";
import ExportMenu from "./components/ExportMenu.vue";
import MobileBottomBar from "./components/MobileBottomBar.vue";
import TopTrigger from "./components/TopTrigger.vue";

const { t, locale } = useI18n();

/** 悬浮布局（P0）—— 浮层状态管理 */
const floatLayout = useFloatLayout();

/** 书签管理 */
const bookmarks = useBookmarks();

/** 当前滚动位置是否有书签（用于工具栏按钮高亮） */
const hasBookmarkAtCurrentPos = computed(() => {
  if (!currentFile.value || !viewerEl.value) return false;
  return bookmarks.hasAt(currentFile.value, viewerEl.value.scrollTop);
});

/** 悬浮 Tab 条显隐（由 TopTrigger 控制） */
const topTabBarVisible = ref(true);
let topTabBarHideTimer: ReturnType<typeof setTimeout> | null = null;

/** 是否为移动端视口（<768px） */
const isMobileViewport = ref(window.innerWidth < 768);
function onResize(): void {
  isMobileViewport.value = window.innerWidth < 768;
}
window.addEventListener("resize", onResize, { passive: true });

/** 切换当前滚动位置的书签 */
function toggleBookmark(): void {
  const tab = activeTab.value;
  if (!tab || !viewerEl.value || isEditing.value) return;
  const scrollTop = viewerEl.value.scrollTop;
  // 从最近标题获取标签
  const heading = headings.value
    .filter((h) => {
      const el = bodyRef.value?.querySelector(`#${CSS.escape(h.id)}`);
      if (!el) return false;
      const elTop = el.getBoundingClientRect().top + viewerEl.value!.scrollTop - viewerEl.value!.getBoundingClientRect().top;
      return elTop <= scrollTop + 16;
    })
    .pop();
  const label = heading?.text;
  const result = bookmarks.toggle(tab.path, scrollTop, label, label);
  showAnnotationToast(
    result ? t("float.bookmarkAdded") : t("float.bookmarkRemoved")
  );
}

/** 浮层布局开关（localStorage 持久化，默认关闭，与经典布局共存） */
const enableFloatLayout = ref(
  localStorage.getItem("glim-reader-float-layout") !== "0"
);

function toggleFloatLayout(): void {
  enableFloatLayout.value = !enableFloatLayout.value;
  localStorage.setItem(
    "glim-reader-float-layout",
    enableFloatLayout.value ? "1" : "0"
  );
}

function toggleLocale() {
  const next = locale.value === "zh-CN" ? "en-US" : "zh-CN";
  locale.value = next;
  persistLocale(next as AppLocale);
}

const {
  rootDir,
  tree,
  loading: treeLoading,
  refresh: refreshTree,
  loadChildren,
  openFolder,
  setRootFromFile,
  setHomeRoot,
  clearRoot,
  canGoUp,
  goUp,
} = useFileTree();

const watcher = useFileWatcher();
const { recent, pushRecent, clearRecent, saveScroll, getScroll } = useHistory();
const {
  apply: applyReadingSettings,
  settings: readingSettings,
  setFontSize,
  setEditorFontSize,
  setMaxWidth,
  setLineHeight,
} = useReadingSettings();
const { normalizeEvent } = useShortcuts();

/** 批注闭环(选区写回 / 复制给 AI / 清除全部) */
const annotations = useAnnotations();
const annotationToast = ref("");
let annotationToastTimer: number | null = null;
function showAnnotationToast(message: string) {
  annotationToast.value = message;
  if (annotationToastTimer) clearTimeout(annotationToastTimer);
  annotationToastTimer = window.setTimeout(() => {
    annotationToast.value = "";
  }, 2500);
}
/** 当前文件上下文;无文件(或编辑模式)时返回 null,工具栏不出现 */
function annotationContext() {
  const tab = activeTab.value;
  if (!tab || !tab.path) return null;
  return {
    getSource: () => tab.draftContent,
    getFileName: () => basename(tab.path),
    setSource: (next: string) => {
      tab.draftContent = next;
      tab.isDirty = true;
    },
    notify: (key: string) => showAnnotationToast(t(key)),
    confirmClear: () =>
      window.confirm(
        `${t("annotation.clearConfirmTitle")}\n\n${t("annotation.clearConfirmMessage")}`
      ),
  };
}
function onAnnotationApply(type: CriticType, payload?: string) {
  annotations.applyMarkup(type, payload);
}

/** 选区工具栏「复制」：复制选中文本到剪贴板 */
async function onAnnotationCopy(): Promise<void> {
  const container = bodyRef.value;
  const range =
    container && resolveSelectionRange(container, window.getSelection());
  const text = range?.toString().trim() ?? "";
  if (!text) return;
  try {
    await copyTextToClipboard(text);
    showAnnotationToast(t("annotation.copyDone"));
  } catch {
    showAnnotationToast(t("annotation.copyFailed"));
  }
}

/** 选区工具栏「粘贴」：读取剪贴板文本，以新增批注写入选区 */
async function onAnnotationPaste(): Promise<void> {
  // catch 分支必然 return，因此 try 成功后 text 必已赋值（TS 控制流分析可确认）
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    showAnnotationToast(t("annotation.pasteFailed"));
    return;
  }
  if (!text.trim()) return;
  onAnnotationApply("ins", text);
}

/** 内置 AI 面板(Phase 3):选区摘要/翻译/解释 + 按批注改写 */
const aiPanel = useAiPanel();

/** 打开 AI 面板:隐藏浮动工具栏,带入当前选区文本(无选区则为空) */
function openAiPanel() {
  annotations.hide();
  const container = bodyRef.value;
  const range =
    container && resolveSelectionRange(container, window.getSelection());
  aiPanel.openWithSelection(range ? range.toString().trim() : "");
}

/**
 * AI 改写结果应用到文档:确认后写回草稿。
 * AI 输出兜底 rejectAllCriticMarkup:模型偶发残留批注语法时源文件仍干净。
 */
function onAiApplyResult(text: string) {
  const tab = activeTab.value;
  if (!tab) return;
  if (!window.confirm(t("ai.applyConfirm"))) return;
  tab.draftContent = rejectAllCriticMarkup(text);
  tab.isDirty = true;
  aiPanel.close();
}

/** 打开审阅面板:隐藏浮动工具栏,避免残留遮挡 */
function openReviewPanel() {
  annotations.hide();
  showReviewPanel.value = true;
}

/**
 * 审阅面板逐条决策:重新解析当前草稿定位该 id 的批注后应用。
 * 面板的 source 与 draftContent 同源(prop 透传),id 一致;
 * 若外部变更已刷新 draftContent,此处基于最新文本定位,天然消除偏移。
 */
function onReviewApply(decision: "accept" | "reject", id: number) {
  const tab = activeTab.value;
  if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find((a) => a.id === id);
  if (!ann) return;
  tab.draftContent = applyDecision(tab.draftContent, ann, decision);
  tab.isDirty = true;
}

/** 审阅面板全部接受/拒绝 */
function onReviewApplyAll(decision: "accept" | "reject") {
  const tab = activeTab.value;
  if (!tab) return;
  tab.draftContent =
    decision === "accept"
      ? acceptAllCriticMarkup(tab.draftContent)
      : rejectAllCriticMarkup(tab.draftContent);
  tab.isDirty = true;
}

/** 审阅面板条目点击 → 滚动预览到批注所在行 */
function onReviewFocus(id: number) {
  const tab = activeTab.value;
  if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find((a) => a.id === id);
  if (ann) scrollPreviewToSourceLine(ann.line);
}
const {
  tabs,
  activeTabId,
  activeTab,
  findTabByPath,
  createTab,
  activateTab,
  removeTab,
  closeTabsLeft,
  closeTabsRight,
  closeTabsOthers,
  closeAllTabs,
  persist,
  loadPersisted,
} = useTabs();

const errorMsg = ref<string>("");
const saving = ref(false);
const editorRef = ref<{
  focus: () => void;
  openSearch: () => void;
  openReplace: () => void;
  goToLine: () => void;
  getTopVisibleLine: () => number;
  scrollToLine: (line: number) => void;
} | null>(null);

type UnsavedChoice = "save" | "discard" | "cancel";
type UnsavedDialogMode = "unsaved" | "external";
const showUnsavedDialog = ref(false);
const unsavedDialogMode = ref<UnsavedDialogMode>("unsaved");
const dialogTab = ref<Tab | null>(null);
let unsavedResolve: ((choice: UnsavedChoice) => void) | null = null;

const suppressed = new Set<string>();
function addSuppress(p: string) {
  suppressed.add(p.replace(/\\/g, "/").toLowerCase());
}
function isSuppressed(p: string): boolean {
  return suppressed.has(p.replace(/\\/g, "/").toLowerCase());
}
function clearSuppress(p: string) {
  suppressed.delete(p.replace(/\\/g, "/").toLowerCase());
}
function scheduleSuppressClear(p: string) {
  window.setTimeout(() => clearSuppress(p), 1000);
}

const theme = ref<"light" | "dark">(
  (localStorage.getItem("glim-reader-theme") as "light" | "dark") || "light"
);
const showSettings = ref(false);
const showExportMenu = ref(false);
const exportBusy = ref(false);
const exportToast = ref("");
const pandocInfo = ref<PandocInfo | null>(null);
const pdfEnginePath = ref<string | null>(null);
const renderTick = ref(0);
/** 递增后通知文件树重新聚焦（点击 `..` 切换根目录后使用） */
const treeFocusKey = ref(0);

function toggleExportMenu() {
  showExportMenu.value = !showExportMenu.value;
}

function closeExportMenu() {
  showExportMenu.value = false;
}

const showBanner = ref(false);
const bannerTab = ref<Tab | null>(null);
const showDiffView = ref(false);
const diffOldContent = ref("");
const diffNewContent = ref("");
const diffFileName = ref("");
/** 审阅面板（Accept/Reject）:只在预览模式可用,面板打开时遮罩遮挡无法编辑 */
const showReviewPanel = ref(false);

const autoReloadWhitelist = ref<string[]>(
  JSON.parse(localStorage.getItem("glim-reader-auto-reload-whitelist") || "[]")
);

const viewerEl = ref<HTMLElement | null>(null);
const markdownRef = ref<{ root: HTMLElement | null } | null>(null);
const treeScrollEl = ref<HTMLElement | null>(null);
const bodyRef = computed(() => markdownRef.value?.root ?? null);

const { onScroll } = useScrollSpy(viewerEl, bodyRef);
const find = useFindInPage(bodyRef);

const currentFile = computed(() => activeTab.value?.path ?? "");
const draftContent = computed(() => activeTab.value?.draftContent ?? "");
const isDirty = computed(() => activeTab.value?.isDirty ?? false);
const isEditing = computed(() => activeTab.value?.isEditing ?? false);
const headings = computed(() => activeTab.value?.headings ?? []);

/** 悬浮布局：章节标记点 */
const sectionMarkers = useSectionMarkers(headings, viewerEl, bodyRef);


/** 将 rootDir 同步到当前文件所在目录（如果不同），然后刷新文件树 */
async function syncRootDir(path: string) {
  const targetDir = dirOf(path);
  if (!targetDir || samePath(rootDir.value, targetDir)) return;
  await setRootFromFile(path);
  // 重启文件监听器以监听新根目录；否则新目录下的文件发生外部变更时将无法被检测到
  // （useFileWatcher.start 内部会先 stop 旧的监听）
  await startWatching(targetDir);
}

const fileName = computed(() => {
  if (!currentFile.value) return t("app.noFile");
  return basename(currentFile.value);
});
const displayFileName = computed(() =>
  isDirty.value ? `${fileName.value} *` : fileName.value
);
const canExport = computed(() => Boolean(activeTab.value?.draftContent));
const hasActiveFile = computed(() => Boolean(activeTab.value?.path));
const dialogFileName = computed(() =>
  dialogTab.value ? basename(dialogTab.value.path) : ""
);
const unsavedDialogTitle = computed(() =>
  unsavedDialogMode.value === "external"
    ? t("editor.externalChangedTitle")
    : t("editor.unsavedTitle")
);
const unsavedDialogMessage = computed(() =>
  unsavedDialogMode.value === "external"
    ? t("editor.externalChangedMessage")
    : t("editor.unsavedMessage")
);

let headingTimer: number | null = null;
let appWindow: import("@tauri-apps/api/window").Window | null = null;

function askUnsaved(tab: Tab, mode: UnsavedDialogMode): Promise<UnsavedChoice> {
  if (unsavedResolve) {
    // A dialog is already in flight; don't clobber its resolver.
    return Promise.resolve("cancel");
  }

  return new Promise((resolve) => {
    dialogTab.value = tab;
    unsavedDialogMode.value = mode;
    unsavedResolve = resolve;
    showUnsavedDialog.value = true;
  });
}

function toggleAutoReload(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (autoReloadWhitelist.value.includes(normalized)) {
    autoReloadWhitelist.value = autoReloadWhitelist.value.filter((p) => p !== normalized);
  } else {
    autoReloadWhitelist.value.push(normalized);
  }
  localStorage.setItem("glim-reader-auto-reload-whitelist", JSON.stringify(autoReloadWhitelist.value));
}

async function onBannerReload() {
  const tab = bannerTab.value;
  if (tab) {
    await forceReloadTab(tab);
    tab.staleSince = null; // 已加载到最新，清除过期标记
  }
  closeBanner();
}

async function onBannerViewDiff() {
  const tab = bannerTab.value;
  if (!tab) return;
  try {
    const newText = await readTextFile(tab.path);
    diffOldContent.value = tab.draftContent;
    diffNewContent.value = newText;
    diffFileName.value = basename(tab.path);
    showDiffView.value = true;
  } catch {
    /* ignore */
  }
  // 不关闭 banner，也不清除 staleSince：用户查看完 diff 后 banner 仍然存在，等待后续操作
}

function onBannerIgnore() {
  const tab = bannerTab.value;
  if (tab) tab.staleSince = null; // 已忽略，清除过期标记
  closeBanner();
}

function onBannerAutoReload() {
  const tab = bannerTab.value;
  if (tab) toggleAutoReload(tab.path);
  closeBanner();
}

function closeBanner() {
  showBanner.value = false;
  bannerTab.value = null;
}

function closeDiffView() {
  showDiffView.value = false;
}

function showBannerForStaleTab(tab: Tab) {
  if (showBanner.value && bannerTab.value?.id === tab.id) return;
  bannerTab.value = tab;
  showBanner.value = true;
}

function resolveDialog(choice: UnsavedChoice) {
  showUnsavedDialog.value = false;
  const resolve = unsavedResolve;
  unsavedResolve = null;
  dialogTab.value = null;
  resolve?.(choice);
}

 async function readFileIntoTab(tab: Tab, path: string, hash = "") {
   addSuppress(path);
   try {
     const text = await readTextFile(path);
     tab.path = path;
     tab.content = text;
     tab.draftContent = text;
     tab.isDirty = false;
     tab.isEditing = false;
     tab.headings = extractHeadings(text);
     tab.pendingHash = hash;
     tab.pendingScrollTop = hash ? 0 : getScroll(path);
     tab.pendingSourceLine = 0;
     tab.scrollTop = tab.pendingScrollTop;
     pushRecent(path);
     // 追加监听该文件所在目录，以便外部修改时提示 stale（避免整树深度遍历）
     void watcher.watchFile(dirOf(path));
     errorMsg.value = "";
     scheduleSuppressClear(path);
   } catch (e: any) {
     clearSuppress(path);
     throw e;
   }
 }

async function loadFile(path: string, hash = "") {
  const existing = findTabByPath(path);
  if (existing) {
    saveCurrentScroll();
    if (hash) {
      existing.pendingHash = hash;
      existing.pendingScrollTop = 0;
      existing.pendingSourceLine = 0;
    } else {
      existing.pendingHash = "";
      existing.pendingScrollTop = existing.scrollTop;
      existing.pendingSourceLine = 0;
    }
    activateTab(existing.id);
    await syncRootDir(path);
    return;
  }
  saveCurrentScroll();
  const tab = createTab(path);
  try {
    await readFileIntoTab(tab, path, hash);
  } catch (e: any) {
    errorMsg.value = `${t("errors.readFailed")}: ${e?.message || e}`;
    return;
  }
  tabs.value.push(tab);
  activateTab(tab.id);
  await syncRootDir(path);
}

 async function forceReloadTab(tab: Tab) {
   addSuppress(tab.path);
   try {
     const text = await readTextFile(tab.path);
     tab.content = text;
     tab.draftContent = text;
     tab.isDirty = false;
     tab.headings = extractHeadings(text);
     if (tab.id === activeTabId.value) {
       tab.pendingHash = "";
       tab.pendingScrollTop = tab.scrollTop;
       tab.pendingSourceLine = 0;
       find.clearHighlights();
     }
     scheduleSuppressClear(tab.path);
   } catch (e: any) {
     clearSuppress(tab.path);
     errorMsg.value = `${t("errors.readFailed")}: ${e?.message || e}`;
   }
 }

async function switchToTab(id: string) {
  if (id === activeTabId.value) return;
  saveCurrentScroll();
  const tab = tabs.value.find((x) => x.id === id);
  if (!tab) return;
  tab.pendingHash = "";
  tab.pendingScrollTop = tab.scrollTop;
  tab.pendingSourceLine = 0;
  activateTab(id);
  await syncRootDir(tab.path);

  // Check for stale tab
  if (tab.staleSince) {
    showBannerForStaleTab(tab);
  }
}

async function handleRefresh() {
  saveCurrentScroll();
  if (isEditing.value && editorRef.value && activeTab.value) {
    activeTab.value.pendingSourceLine = editorRef.value.getTopVisibleLine();
  }
  if (activeTab.value?.path) {
    addSuppress(activeTab.value.path);
  }
  await refreshTree();
  if (activeTab.value?.path) {
    scheduleSuppressClear(activeTab.value.path);
  }
}

async function saveTab(tab: Tab): Promise<boolean> {
  if (!tab.path || saving.value) return false;
  saving.value = true;
  try {
    addSuppress(tab.path);
    await writeTextFile(tab.path, tab.draftContent);
    tab.content = tab.draftContent;
    tab.isDirty = false;
    tab.headings = extractHeadings(tab.draftContent);
    exportToast.value = t("editor.saved");
    await refreshTree();
    scheduleSuppressClear(tab.path);
    return true;
  } catch (e: any) {
    clearSuppress(tab.path);
    errorMsg.value = `${t("editor.saveFailed")}: ${e?.message ?? e}`;
    return false;
  } finally {
    saving.value = false;
  }
}

async function saveCurrentFile(): Promise<boolean> {
  const tab = activeTab.value;
  if (!tab) return false;
  return saveTab(tab);
}

async function saveAsCurrentFile(): Promise<boolean> {
  const tab = activeTab.value;
  if (!tab || saving.value) return false;
  const dest = await save({
    title: t("editor.saveAs"),
    defaultPath: fileName.value.replace(/\.[^.]+$/, "") + ".md",
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] },
    ],
  });
  if (!dest) return false;
  saving.value = true;
  try {
    addSuppress(dest);
    await writeTextFile(dest, tab.draftContent);
    tab.content = tab.draftContent;
    tab.path = dest;
    tab.isDirty = false;
    tab.headings = extractHeadings(tab.draftContent);
    pushRecent(dest);
    exportToast.value = `${t("editor.saved")}: ${dest}`;
    await refreshTree();
    scheduleSuppressClear(dest);
    persist();
    return true;
  } catch (e: any) {
    clearSuppress(dest);
    errorMsg.value = `${t("editor.saveFailed")}: ${e?.message ?? e}`;
    return false;
  } finally {
    saving.value = false;
  }
}

async function closeTab(id: string) {
  const tab = tabs.value.find((x) => x.id === id);
  if (!tab) return;
  if (tab.isDirty) {
    if (id !== activeTabId.value) await switchToTab(id);
    const choice = await askUnsaved(tab, "unsaved");
    if (choice === "cancel") return;
    if (choice === "save") {
      const ok = await saveTab(tab);
      if (!ok) return;
    }
  }
  removeTab(id);
}

async function confirmCloseAll(): Promise<boolean> {
  for (const tab of tabs.value.filter((x) => x.isDirty)) {
    activateTab(tab.id);
    const choice = await askUnsaved(tab, "unsaved");
    if (choice === "cancel") return false;
    if (choice === "save") {
      const ok = await saveTab(tab);
      if (!ok) return false;
    } else {
      tab.isDirty = false;
    }
  }
  return true;
}

/** 关闭 targetId 右侧的所有 tab（保留 target 自身及左侧 tab） */
async function closeTabRight(targetId: string): Promise<void> {
  const idx = tabs.value.findIndex((t) => t.id === targetId);
  if (idx < 0 || idx >= tabs.value.length - 1) return;
  const toClose = tabs.value.slice(idx + 1);
  for (const tab of toClose) {
    activateTab(tab.id);
    if (tab.isDirty) {
      const choice = await askUnsaved(tab, "unsaved");
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await saveTab(tab);
        if (!ok) return;
      } else {
        tab.isDirty = false;
      }
    }
  }
  closeTabsRight(targetId);
}

/** 关闭 targetId 左侧的所有 tab（保留 target 自身及右侧 tab） */
async function closeTabLeft(targetId: string): Promise<void> {
  const idx = tabs.value.findIndex((t) => t.id === targetId);
  if (idx <= 0) return;
  const toClose = tabs.value.slice(0, idx).reverse();
  for (const tab of toClose) {
    activateTab(tab.id);
    if (tab.isDirty) {
      const choice = await askUnsaved(tab, "unsaved");
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await saveTab(tab);
        if (!ok) return;
      } else {
        tab.isDirty = false;
      }
    }
  }
  closeTabsLeft(targetId);
}

/** 关闭所有 tab */
async function closeTabAll() {
  const result = await confirmCloseAll();
  if (result) closeAllTabs();
}

/** 关闭除 targetId 以外的所有 tab */
async function closeTabOthers(targetId: string) {
  const result = await confirmCloseAll();
  if (result) closeTabsOthers(targetId);
}

function onDialogSave() {
  resolveDialog("save");
}
function onDialogDiscard() {
  resolveDialog("discard");
}
function onDialogCancel() {
  resolveDialog("cancel");
}

function getPreviewTopSourceLine(): number {
  const container = viewerEl.value;
  const body = bodyRef.value;
  if (!container || !body) return 1;
  const containerTop = container.getBoundingClientRect().top;
  const items = Array.from(
    body.querySelectorAll<HTMLElement>("[data-source-line]")
  );
  let topLine = 1;
  for (const item of items) {
    const line = Number(item.dataset.sourceLine || "0");
    if (!line) continue;
    const top = item.getBoundingClientRect().top - containerTop;
    if (top <= 16) {
      topLine = line;
    } else {
      return topLine;
    }
  }
  return topLine;
}

function scrollPreviewToSourceLine(line: number) {
  const container = viewerEl.value;
  const body = bodyRef.value;
  if (!container || !body) return;
  const items = Array.from(
    body.querySelectorAll<HTMLElement>("[data-source-line]")
  );
  let target = items[0] ?? null;
  let targetLine = 0;
  for (const item of items) {
    const itemLine = Number(item.dataset.sourceLine || "0");
    if (!itemLine) continue;
    if (itemLine <= line && itemLine >= targetLine) {
      target = item;
      targetLine = itemLine;
    }
  }
  if (!target) return;
  container.scrollTop +=
    target.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    8;
}

function toggleEditorMode() {
  const tab = activeTab.value;
  if (!tab) return;
  if (tab.isEditing) {
    tab.pendingSourceLine = editorRef.value?.getTopVisibleLine() ?? 1;
    tab.pendingScrollTop = 0;
    tab.isEditing = false;
    find.reset();
    return;
  }
  const line = getPreviewTopSourceLine();
  tab.pendingSourceLine = 0;
  tab.isEditing = true;
  find.close();
  nextTick(() => editorRef.value?.scrollToLine(line));
}

function onRendered() {
  nextTick(() => {
    const tab = activeTab.value;
    if (!viewerEl.value || !tab) return;
    // 渲染完成后初始化批注选区监听(幂等:configure 每次刷新上下文,监听只注册一次)
    annotations.configure(annotationContext, () => bodyRef.value);
    annotations.initSelectionWatch();
    // AI 面板上下文:getSource 经闭包读取当前 tab,配置一次即可保持最新
    aiPanel.configure(() => ({
      getSource: () => activeTab.value?.draftContent ?? "",
      applyResult: onAiApplyResult,
    }));
    if (tab.pendingHash) {
      sectionMarkers.jumpTo(tab.pendingHash);
      tab.pendingHash = "";
    } else if (tab.pendingSourceLine > 0) {
      scrollPreviewToSourceLine(tab.pendingSourceLine);
      tab.pendingSourceLine = 0;
    } else if (tab.pendingScrollTop > 0) {
      viewerEl.value.scrollTop = tab.pendingScrollTop;
    } else {
      viewerEl.value.scrollTop = 0;
    }
  });
}

function saveCurrentScroll() {
  const tab = activeTab.value;
  if (tab && tab.path && viewerEl.value && !tab.isEditing) {
    tab.scrollTop = viewerEl.value.scrollTop;
    saveScroll(tab.path, viewerEl.value.scrollTop);
  }
}

function withMarkdownExtension(path: string): string {
  return /\.(md|markdown|mdx|txt)$/i.test(path) ? path : `${path}.md`;
}

async function createNewFile() {
  const dest = await save({
    title: t("editor.newFile"),
    defaultPath: "untitled.md",
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] },
    ],
  });
  if (!dest) return;
  const path = withMarkdownExtension(dest);
  saving.value = true;
  try {
    addSuppress(path);
    await writeTextFile(path, "");
    saveCurrentScroll();
    let tab = findTabByPath(path);
    if (!tab) {
      tab = createTab(path);
      tabs.value.push(tab);
    }
    tab.path = path;
    tab.content = "";
    tab.draftContent = "";
    tab.isDirty = false;
    tab.isEditing = true;
    tab.headings = [];
    tab.pendingHash = "";
    tab.pendingScrollTop = 0;
    tab.pendingSourceLine = 0;
    tab.scrollTop = 0;
    pushRecent(path);
    activateTab(tab.id);
    errorMsg.value = "";
    exportToast.value = `${t("editor.created")}: ${path}`;
    await refreshTree();
    scheduleSuppressClear(path);
    persist();
    await nextTick();
    editorRef.value?.focus();
  } catch (e: any) {
    clearSuppress(path);
    errorMsg.value = `${t("editor.createFailed")}: ${e?.message ?? e}`;
  } finally {
    saving.value = false;
  }
}

async function pickFile() {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] },
    ],
  });
  if (typeof selected === "string") await loadFile(selected);
}

async function pickFolder() {
  const dir = await openFolder();
  if (dir) await startWatching(dir);
}

/** 文件树 `..`：切换到上一级目录，并让文件树重新聚焦当前文件 */
async function onGoUp() {
  const parent = await goUp();
  if (parent) {
    treeFocusKey.value += 1;
    await startWatching(parent);
  }
}

async function startWatching(dir: string) {
  await watcher.start(dir, async (paths) => {
    // 自身写盘/读取触发的事件必须在回调到达时立即判定并忽略:
    // 若等 refreshTree + 150ms 延迟后再判,保存的 suppress 窗口(1000ms)
    // 可能已过期,导致保存后误报「外部修改」。
    const relevant = paths.filter((p) =>
      tabs.value.some((t) => samePath(p, t.path))
    );
    if (relevant.length > 0 && relevant.every((p) => isSuppressed(p))) {
      return;
    }
    await refreshTree();
    window.setTimeout(() => {
      void onFilesChanged(paths);
    }, 150);
  });
  // start_watch 会重建 debouncer，之前 watch_path 追加的目录监听全部丢失；
  // 重建后重新监听所有已打开文件的目录，保证外部修改 stale 提醒不失效。
  for (const tab of tabs.value) {
    void watcher.watchFile(dirOf(tab.path));
  }
}

async function onFilesChanged(paths: string[]) {
  for (const tab of [...tabs.value]) {
    if (!paths.some((p) => samePath(p, tab.path))) continue;
    if (isSuppressed(tab.path)) {
      // 仍在抑制窗口内:忽略保存/读取自身触发的变更事件。
      // 一次写盘可能产生多个事件批次(notify 多事件 + 多目录监听),
      // 不能在这里清除抑制标记,否则后续批次会误报「外部修改」;
      // 统一由 scheduleSuppressClear 定时清除。
      continue;
    }
    // 内容级校验:磁盘内容与当前文档草稿一致 → 事件源于自身写入(保存),忽略。
    // 比 suppress 窗口更可靠:不受事件到达时序/批次影响,即使写盘事件
    // (如原子写 tmp+rename 产生的目录级事件)延迟到窗口外也能被拦截。
    try {
      const diskText = await readTextFile(tab.path);
      if (diskText === tab.draftContent) continue;
    } catch {
      // 读取失败(文件被删除/移动):按外部修改处理
    }
    const normalized = tab.path.replace(/\\/g, "/").toLowerCase();
    if (autoReloadWhitelist.value.includes(normalized) && !tab.isDirty) {
      // 白名单且当前无未保存编辑：自动重载
      await forceReloadTab(tab);
      continue;
    }
    // 非白名单，或白名单但存在未保存编辑：提示用户，避免静默覆盖草稿（数据丢失）
    tab.staleSince = Date.now();
    if (tab.id === activeTabId.value) {
      showBannerForStaleTab(tab);
    }
  }
}
function closeFolder() {
  void watcher.stop();
  clearRoot();
}

async function getInitialOpenFile(): Promise<string> {
  try {
    const path = await invoke<string | null>("initial_open_file");
    return typeof path === "string" ? path : "";
  } catch {
    return "";
  }
}

async function restoreTabs(initialPath = "") {
  const persisted = loadPersisted();
  let paths: string[] = [];
  let activePath = "";
  if (persisted && persisted.paths.length) {
    paths = persisted.paths;
    activePath = persisted.activePath;
  } else {
    const last = localStorage.getItem("glim-reader-last-file");
    if (last) {
      paths = [last];
      activePath = last;
    }
  }
  let activeId = "";
  for (const path of paths) {
    if (findTabByPath(path)) continue;
    const tab = createTab(path);
    try {
      await readFileIntoTab(tab, path);
    } catch {
      continue;
    }
    tabs.value.push(tab);
    if (samePath(path, activePath)) activeId = tab.id;
  }
  if (!activeId && tabs.value.length) activeId = tabs.value[0].id;
  if (activeId) activateTab(activeId);
  if (initialPath) await loadFile(initialPath);
}

function toggleTheme() {
  theme.value = theme.value === "light" ? "dark" : "light";
  localStorage.setItem("glim-reader-theme", theme.value);
  applyTheme();
  // Force Mermaid/KaTeX re-render so charts follow the new theme.
  renderTick.value++;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  void invoke("set_app_theme", { theme: theme.value }).catch(() => {
    /* ignore in non-Tauri environments */
  });
}

async function exportHtml() {
  if (isEditing.value) {
    closeExportMenu();
    errorMsg.value = t("editor.previewBeforeExport");
    return;
  }
  if (!bodyRef.value || !draftContent.value) {
    closeExportMenu();
    return;
  }
  try {
    const dest = await exportToHtml(
      bodyRef.value,
      fileName.value || "document.html",
      currentFile.value || undefined
    );
    showExportMenu.value = false;
    if (!dest) return;
  } catch (e: any) {
    showExportMenu.value = false;
    errorMsg.value = `${t("export.exportFailed")}: ${e?.message ?? e}`;
  }
}

async function exportDocx() {
  if (isEditing.value) {
    showExportMenu.value = false;
    errorMsg.value = t("editor.previewBeforeExport");
    return;
  }
  if (!bodyRef.value || !draftContent.value) {
    showExportMenu.value = false;
    return;
  }
  exportBusy.value = true;
  exportToast.value = t("export.generatingDocx");
  try {
    const out = await exportToDocx(
      bodyRef.value,
      fileName.value || "document",
      displayFileName.value,
      currentFile.value || undefined
    );
    if (out) exportToast.value = `${t("export.exportedDocx")}: ${out}`;
    else exportToast.value = "";
  } catch (e: any) {
    errorMsg.value = `${t("export.docxFailed")}: ${e?.message ?? e}`;
    exportToast.value = "";
  } finally {
    exportBusy.value = false;
    showExportMenu.value = false;
  }
}

async function exportPdf() {
  if (isEditing.value) {
    showExportMenu.value = false;
    errorMsg.value = t("editor.previewBeforeExport");
    return;
  }
  if (!bodyRef.value || !draftContent.value) {
    showExportMenu.value = false;
    return;
  }
  exportBusy.value = true;
  exportToast.value = t("export.generatingPdf");
  try {
    const result = await exportToPdf(
      bodyRef.value,
      fileName.value || "document",
      displayFileName.value,
      currentFile.value || undefined,
      async () => {
        const picked = await open({
          title: t("export.chooseEdgePath"),
          multiple: false,
          filters: [
            { name: "Edge / Chrome", extensions: ["exe"] },
            { name: t("app.allFiles"), extensions: ["*"] },
          ],
        });
        return typeof picked === "string" ? picked : null;
      }
    );
    if (result) {
      pdfEnginePath.value = result.edge_path;
      const sec = (result.elapsed_ms / 1000).toFixed(1);
      exportToast.value = `${t("export.exportedPdf")} (${sec}s): ${result.out_path}`;
    } else {
      exportToast.value = "";
    }
  } catch (e: any) {
    const msg = e?.message || (typeof e === "string" ? e : JSON.stringify(e));
    errorMsg.value = `${t("export.pdfFailed")}: ${msg}`;
    exportToast.value = "";
  } finally {
    exportBusy.value = false;
    showExportMenu.value = false;
  }
}

function doPrint() {
  if (isEditing.value) {
    closeExportMenu();
    errorMsg.value = t("editor.previewBeforeExport");
    return;
  }
  if (bodyRef.value) printDocument(bodyRef.value, fileName.value);
}

/** 悬浮布局：浮层内打开文件（FileTree） */
function onFloatPanelOpenFile(path: string): void {
  floatLayout.closePanel();
  void loadFile(path);
}

/** 悬浮布局：处理左栏特殊动作（文件操作/编辑切换等） */
function onFloatPanelAction(id: string): void {
  floatLayout.closePanel();
  switch (id) {
    case "edit":
      toggleEditorMode();
      break;
    case "new-file":
      void createNewFile();
      break;
    case "open-file":
      void pickFile();
      break;
    case "open-folder":
      void pickFolder();
      break;
    case "export":
      toggleExportMenu();
      break;
  }
}

/** 悬浮布局：浮层内打开文件（HistoryPanel） */
function onFloatPanelOpen(path: string): void {
  floatLayout.closePanel();
  void loadFile(path);
}

/** 悬浮布局：浮层内打开搜索文件 */
function onFloatPanelOpenSearch(path: string, _line: number): void {
  floatLayout.closePanel();
  void loadFile(path);
}

/** 悬浮布局：胶囊迷你目录跳转 */
function onFloatPanelTocJump(id: string): void {
  sectionMarkers.jumpTo(id);
}

/** 悬浮布局：批注列表聚焦到指定批注行 */
function onFloatPanelAnnotationFocus(id: number): void {
  const tab = activeTab.value;
  if (!tab) return;
  const ann = parseCriticMarkup(tab.draftContent).find((a) => a.id === id);
  if (ann) scrollPreviewToSourceLine(ann.line);
}

/** 悬浮布局：书签跳转到指定位置 */
function onFloatPanelBookmarkJump(path: string, scrollTop: number): void {
  floatLayout.closePanel();
  void loadFile(path).then(() => {
    nextTick(() => {
      if (viewerEl.value) {
        viewerEl.value.scrollTop = scrollTop;
      }
    });
  });
}

/** 悬浮 Tab 条切换文档：切换后暂时保持显示，2s 后自动隐藏 */
function onFloatFloatingTabActivate(id: string): void {
  void switchToTab(id);
  // 切换后保持 2s 显示，方便用户继续操作
  topTabBarVisible.value = true;
  setTimeout(() => {
    topTabBarVisible.value = false;
  }, 2000);
}

/** 悬浮 Tab 条：鼠标进入 → 取消自动隐藏 */
function onFloatTabBarMouseEnter(): void {
  topTabBarVisible.value = true;
  if (topTabBarHideTimer !== null) {
    clearTimeout(topTabBarHideTimer);
    topTabBarHideTimer = null;
  }
}

/** 悬浮 Tab 条：鼠标离开 → 2s 后自动隐藏 */
function onFloatTabBarMouseLeave(): void {
  if (topTabBarHideTimer !== null) {
    clearTimeout(topTabBarHideTimer);
  }
  topTabBarHideTimer = setTimeout(() => {
    topTabBarVisible.value = false;
    topTabBarHideTimer = null;
  }, 2000);
}

function onInternalLink(path: string, hash: string) {
  void loadFile(path, hash);
}

function onDraftUpdate(value: string) {
  const tab = activeTab.value;
  if (!tab) return;
  tab.draftContent = value;
  tab.isDirty = value !== tab.content;
  if (headingTimer) clearTimeout(headingTimer);
  headingTimer = window.setTimeout(() => {
    tab.headings = extractHeadings(value);
  }, 200);
}


const recentFiltered = ref<RecentItem[]>([]);

async function refreshRecent() {
  const items = recent.value.slice(0, 10);
  const checks = await Promise.all(
    items.map(async (item) => ({
      item,
      ok: await exists(item.path).catch(() => false),
    }))
  );
  recentFiltered.value = checks.filter((c) => c.ok).map((c) => c.item);
}

function zoomFont(delta: number) {
  if (isEditing.value)
    setEditorFontSize(readingSettings.value.editorFontSize + delta);
  else setFontSize(readingSettings.value.fontSize + delta);
}

function resetFont() {
  if (isEditing.value) setEditorFontSize(14);
  else setFontSize(16);
}

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomFont(e.deltaY < 0 ? 1 : -1);
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (showUnsavedDialog.value) {
    if (e.key === "Escape") onDialogCancel();
    return;
  }
  if (e.defaultPrevented) return;

  if (e.key === "Escape") {
    if (find.visible.value) find.close();
    else if (showSettings.value) showSettings.value = false;
    return;
  }

  if (!mod) return;
  const combo = normalizeEvent(e);
  const isEdit = isEditing.value;

  const handlers: Record<string, () => void> = {
    "toggle-mode": () => { e.preventDefault(); toggleEditorMode(); },
    "new-file": () => { e.preventDefault(); void createNewFile(); },
    "open-file": () => { e.preventDefault(); void pickFile(); },
    "search-panel": () => {
      e.preventDefault();
      if (!isEditing.value) floatLayout.openPanel("search");
    },
    "save-as": () => { e.preventDefault(); void saveAsCurrentFile(); },
    settings: () => { e.preventDefault(); showSettings.value = true; },
    print: () => { e.preventDefault(); doPrint(); },
    save: () => { e.preventDefault(); void saveCurrentFile(); },
    "zoom-in": () => { e.preventDefault(); zoomFont(1); },
    "zoom-out": () => { e.preventDefault(); zoomFont(-1); },
    "zoom-reset": () => { e.preventDefault(); resetFont(); },
    "toggle-bookmark": () => { e.preventDefault(); toggleBookmark(); },
    "open-filetree": () => {
      e.preventDefault();
      if (!isEditing.value) floatLayout.openPanel("filetree");
    },
    "open-annotations": () => {
      e.preventDefault();
      if (!isEditing.value) floatLayout.openPanel("annotations");
    },
  };

  // Editor-only shortcuts
  if (isEdit) {
    handlers.find = () => { e.preventDefault(); editorRef.value?.openSearch(); };
    handlers.replace = () => { e.preventDefault(); editorRef.value?.openReplace(); };
    handlers["go-to-line"] = () => { e.preventDefault(); editorRef.value?.goToLine(); };
  } else {
    handlers.find = () => { e.preventDefault(); find.open(); };
    handlers["copy-ai"] = () => { e.preventDefault(); void annotations.copyForAI(); };
    handlers["review-annotations"] = () => { e.preventDefault(); openReviewPanel(); };
  }

  const handler = handlers[combo];
  if (handler) handler();
}

let scrollSaveTimer: number | null = null;
function onViewerScroll() {
  if (isEditing.value) return;
  onScroll();
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = window.setTimeout(saveCurrentScroll, 400);
}

watch(isEditing, (editing) => {
  if (editing) {
    markdownRef.value = null;
    // 编辑模式下无预览选区,清理批注监听与工具栏,避免残留
    annotations.dispose();
    return;
  }
  nextTick(onScroll);
});

watch(activeTabId, () => {
  errorMsg.value = "";
  find.close();
  find.clearHighlights();
  // 切换文档时清理批注状态,避免旧文档的工具栏残留
  annotations.dispose();
  if (!activeTab.value?.isEditing) nextTick(onScroll);
});


let unlistenDrop: (() => void) | null = null;
let unlistenOpen: (() => void) | null = null;
let unlistenClose: (() => void) | null = null;

onMounted(async () => {
  applyTheme();
  applyReadingSettings();
  void checkPandoc().then((info) => (pandocInfo.value = info));
  void checkPdfEngine().then((p) => (pdfEnginePath.value = p));

  // 先恢复历史 tab（文档路径为绝对路径）
  const initialPath = await getInitialOpenFile();
  await restoreTabs(initialPath);

  // 文件树根目录：有历史文档 → 激活文档所在目录（平级显示）；无 → 用户主目录
  if (currentFile.value) {
    await syncRootDir(currentFile.value);
  } else {
    await setHomeRoot();
  }
  if (rootDir.value) await startWatching(rootDir.value);

  // Listen for file-open events fired by Rust (file association / single-instance).
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlistenOpen = await listen<string>("glim-reader://open-file", async (e) => {
      const path = e.payload;
      if (typeof path === "string" && path) {
        await loadFile(path);
      }
    });
  } catch (e) {
    console.warn("listen open-file unavailable", e);
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    appWindow = getCurrentWindow();
    unlistenClose = await appWindow.onCloseRequested(async (event) => {
      if (!tabs.value.some((tb) => tb.isDirty)) {
        // No unsaved changes: let the default close proceed.
        return;
      }
      event.preventDefault();
      const ok = await confirmCloseAll();
      if (ok) await appWindow!.destroy();
    });
  } catch (e) {
    console.warn("close listener unavailable", e);
  }

  try {
    const webview = getCurrentWebview();
    unlistenDrop = await webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const target = paths.find((p) => /\.(md|markdown|mdx|txt)$/i.test(p));
          if (target) await loadFile(target);
        }
      }
    });
  } catch (e) {
    console.warn("drag-drop unavailable", e);
  }
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("wheel", onWheel, { passive: false });
  void refreshRecent();
  floatLayout.bindGlobalClick();
});

onUnmounted(() => {
  unlistenDrop?.();
  unlistenOpen?.();
  unlistenClose?.();
  if (headingTimer) clearTimeout(headingTimer);
  void watcher.stop();
  annotations.dispose();
  floatLayout.unbindGlobalClick();
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("wheel", onWheel);
});

watch(
  () => tabs.value.map((tb) => tb.path).join("\n"),
  () => persist()
);

watch(exportToast, (v) => {
  if (v) {
    window.setTimeout(() => {
      exportToast.value = "";
    }, 3500);
  }
});

watch(errorMsg, (v) => {
  if (v) {
    window.setTimeout(() => {
      errorMsg.value = "";
    }, 5000);
  }
});

watch(hasActiveFile, (v) => {
  if (!v) void refreshRecent();
});
</script>

<template>
  <div class="app">
    <Toolbar v-if="!enableFloatLayout"
             :is-editing="isEditing"
             :is-dirty="isDirty"
             :has-active-file="hasActiveFile"
             :saving="saving"
             :can-export="canExport"
             :export-busy="exportBusy"
             :show-export-menu="showExportMenu"
             :current-file="currentFile"
             :display-file-name="displayFileName"
             :root-dir="rootDir"
             :tree-loading="treeLoading"
             :show-settings="showSettings"
             :theme="theme"
             :locale="locale"
             :has-bookmark-at-current-pos="hasBookmarkAtCurrentPos"
             :float-layout-enabled="enableFloatLayout"
             :pandoc-info="pandocInfo"
             :pdf-engine-path="pdfEnginePath"
             @create-new-file="createNewFile"
             @pick-file="pickFile"
             @pick-folder="pickFolder"
             @refresh-tree="handleRefresh"
             @close-folder="closeFolder"
             @toggle-editor-mode="toggleEditorMode"
             @save="saveCurrentFile"
             @save-as="saveAsCurrentFile"
             @find="isEditing ? editorRef?.openSearch() : find.open()"
             @toggle-export-menu="toggleExportMenu"
             @close-export-menu="closeExportMenu"
             @export-html="exportHtml"
             @export-docx="exportDocx"
             @export-pdf="exportPdf"
             @print="doPrint"
             @open-settings="showSettings = true"
             @toggle-bookmark="toggleBookmark"
             @toggle-theme="toggleTheme"
             @toggle-locale="toggleLocale"
             @toggle-float-layout="toggleFloatLayout"
    />

    <TabBar
      v-if="tabs.length && !enableFloatLayout"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :auto-reload="autoReloadWhitelist"
      @activate="switchToTab"
      @close="closeTab"
      @close-left="closeTabLeft"
      @close-right="closeTabRight"
      @close-all="closeTabAll"
      @close-others="closeTabOthers"
    />

    <main class="layout">
      <section
        ref="viewerEl"
        class="viewer"
        data-scroll-root
        :class="{ editing: isEditing }"
        tabindex="0"
        @scroll.passive="onViewerScroll"
      >
        <div v-if="errorMsg" class="error" @click="errorMsg = ''">
          {{ errorMsg }}
        </div>
        <div v-if="!hasActiveFile" class="empty">
          <div class="empty-title">{{ t("app.emptyTitle") }}</div>
          <div class="empty-hint">{{ t("app.emptyHint") }}</div>
          <div class="shortcut-hint">
            {{ t("app.shortcutHint") }}
          </div>
          <div v-if="recentFiltered.length" class="recent-files">
            <div class="recent-title">{{ t("app.recentFiles") }}</div>
            <div
              v-for="item in recentFiltered"
              :key="item.path"
              class="recent-item"
              @click="loadFile(item.path)"
              :title="item.path"
            >
              <span class="recent-name">{{ item.name }}</span>
              <span class="recent-path">{{ dirOf(item.path) }}</span>
            </div>
            <button
              class="recent-clear"
              @click="
                clearRecent();
                recentFiltered = [];
              "
            >
              {{ t("app.clearRecent") }}
            </button>
          </div>
        </div>
        <MarkdownEditor
          v-else-if="isEditing"
          ref="editorRef"
          :model-value="draftContent"
          :theme="theme"
          :current-file="currentFile"
          @update:model-value="onDraftUpdate"
          @toggle-mode="toggleEditorMode"
        />
        <MarkdownView
          v-else
          ref="markdownRef"
          :source="draftContent"
          :current-file="currentFile"
          :root-dir="rootDir"
          :render-tick="renderTick"
          @rendered="onRendered"
          @internal-link="onInternalLink"
        />
        <AnnotationToolbar
          :visible="annotations.toolbar.visible"
          :x="annotations.toolbar.x"
          :y="annotations.toolbar.y"
          :mode="annotations.toolbar.mode"
          @apply="onAnnotationApply"
          @input-start="(m) => (annotations.toolbar.mode = m)"
          @cancel="annotations.toolbar.mode = ''"
          @copy-ai="() => void annotations.copyForAI()"
          @copy="onAnnotationCopy"
          @paste="onAnnotationPaste"
          @clear-all="() => void annotations.clearAll()"
          @review="openReviewPanel"
          @ai="openAiPanel"
        />
      </section>
    </main>

    <!-- 悬浮布局（P0），可由设置开关启用 -->
    <!-- 左栏工具栏与悬浮 Tab 条在编辑模式下也保持显示，确保可以退出编辑状态 -->
    <LeftRail
      v-if="enableFloatLayout"
      :active-panel="floatLayout.state.activeLeftPanel"
      @open-panel="(id) => ACTION_PANEL_IDS.has(id) ? onFloatPanelAction(id) : floatLayout.openPanel(id)"
    />

    <TopTrigger
      v-if="enableFloatLayout"
      enabled
      @show="topTabBarVisible = true"
    />
    <TabBar
      v-if="enableFloatLayout && tabs.length"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :auto-reload="autoReloadWhitelist"
      :floating="true"
      :visible="topTabBarVisible"
      @activate="onFloatFloatingTabActivate"
      @close="closeTab"
      @close-left="closeTabLeft"
      @close-right="closeTabRight"
      @close-all="closeTabAll"
      @close-others="closeTabOthers"
      @mouse-enter="onFloatTabBarMouseEnter"
      @mouse-leave="onFloatTabBarMouseLeave"
    />

    <template v-if="enableFloatLayout && !isEditing">
      <MobileBottomBar
        :active-panel="floatLayout.state.activeLeftPanel"
        @open-panel="(id) => ACTION_PANEL_IDS.has(id) ? onFloatPanelAction(id) : floatLayout.openPanel(id)"
      />

      <FloatingPanel
        :visible="!!floatLayout.state.activeLeftPanel"
        :side="isMobileViewport ? 'bottom' : 'left'"
        :width="320"
        @close="floatLayout.closePanel"
      >
        <template v-if="floatLayout.state.activeLeftPanel === 'filetree'">
          <div class="float-panel-header">{{ t("float.filetree") }}</div>
          <div class="float-panel-body tree-scroll" ref="treeScrollEl">
            <FileTree
              v-if="rootDir"
              :nodes="tree"
              :current-path="currentFile"
              :scroll-container="treeScrollEl"
              :can-go-up="canGoUp"
              :focus-key="treeFocusKey"
              :root-dir="rootDir"
              :load-children="loadChildren"
              @open="onFloatPanelOpenFile"
              @go-up="onGoUp"
            />
            <div v-else class="empty-tip">{{ t("app.openFolderHint") }}</div>
          </div>
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'history'">
          <HistoryPanel
            :items="recentFiltered"
            :current-path="currentFile"
            @open="onFloatPanelOpen"
            @clear="refreshRecent"
          />
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'search'">
          <div class="float-panel-header">{{ t("float.search") }}</div>
          <div class="float-panel-body">
            <SearchPanel
              :visible="true"
              :root-dir="rootDir"
              @close="floatLayout.closePanel"
              @open="onFloatPanelOpenSearch"
            />
          </div>
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'annotations'">
          <AnnotationList
            :source="draftContent"
            :file-name="currentFile"
            @focus="onFloatPanelAnnotationFocus"
            @open-review="openReviewPanel"
            @copy-ai="() => void annotations.copyForAI()"
          />
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'bookmark'">
          <BookmarkPanel
            :current-path="currentFile"
            :show-current-only="true"
            @jump="onFloatPanelBookmarkJump"
            @refresh="() => {}"
          />
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'ai'">
          <AiPanelInline
            :selection-text="aiPanel.state.selectionText"
            :result="aiPanel.state.result"
            :loading="aiPanel.state.loading"
            :error="aiPanel.state.error"
            :active-action="aiPanel.state.activeAction"
            @run-action="(a) => void aiPanel.runAction(a)"
            @apply-result="() => void aiPanel.applyResultToDoc()"
            @close="aiPanel.close"
          />
        </template>
        <template v-else-if="floatLayout.state.activeLeftPanel === 'settings'">
          <QuickSettings
            :theme="theme"
            :font-size="isEditing ? readingSettings.editorFontSize : readingSettings.fontSize"
            :float-layout-enabled="enableFloatLayout"
            @toggle-theme="toggleTheme"
            @open-settings="showSettings = true"
            @zoom-in="zoomFont(1)"
            @zoom-out="zoomFont(-1)"
            @set-max-width="(v) => setMaxWidth(v)"
            @set-line-height="(v) => setLineHeight(v)"
            @toggle-float-layout="toggleFloatLayout"
          />
        </template>
      </FloatingPanel>

      <TocCapsule
        :headings="headings"
        :active-id="sectionMarkers.activeId.value"
        @jump="onFloatPanelTocJump"
      />
    </template>

    <FindBar
      v-if="!isEditing"
      :visible="find.visible.value"
      :query="find.query.value"
      :case-sensitive="find.caseSensitive.value"
      :total="find.total.value"
      :active-index="find.activeIndex.value"
      @update:query="(v) => (find.query.value = v)"
      @update:case-sensitive="(v) => (find.caseSensitive.value = v)"
      @search="find.search"
      @next="find.next"
      @prev="find.prev"
      @close="find.close"
    />

    <SettingsDialog
      :visible="showSettings"
      :float-layout-enabled="enableFloatLayout"
      @close="showSettings = false"
      @toggle-float-layout="toggleFloatLayout"
    />

    <UnsavedChangesDialog
      :visible="showUnsavedDialog"
      :title="unsavedDialogTitle"
      :message="unsavedDialogMessage"
      :file-name="dialogFileName"
      :save-label="
        unsavedDialogMode === 'external'
          ? t('editor.reloadFromDisk')
          : t('editor.saveAndContinue')
      "
      :discard-label="
        unsavedDialogMode === 'external'
          ? t('editor.keepEditing')
          : t('editor.discardAndContinue')
      "
      @save="onDialogSave"
      @discard="
        unsavedDialogMode === 'external' ? onDialogCancel() : onDialogDiscard()
      "
      @cancel="onDialogCancel"
    />

    <Banner
      :tab="bannerTab"
      :visible="showBanner"
      :on-reload="onBannerReload"
      :on-view-diff="onBannerViewDiff"
      :on-ignore="onBannerIgnore"
      :on-auto-reload="onBannerAutoReload"
    />

    <div v-if="exportToast" class="toast" @click="exportToast = ''">
      ✓ {{ exportToast }}
    </div>
    <div
      v-if="annotationToast"
      class="toast"
      @click="annotationToast = ''"
    >
      ✓ {{ annotationToast }}
    </div>
    <DiffView
      :old-content="diffOldContent"
      :new-content="diffNewContent"
      :file-name="diffFileName"
      :visible="showDiffView"
      @close="closeDiffView"
    />
    <ReviewPanel
      :visible="showReviewPanel"
      :source="draftContent"
      :file-name="currentFile"
      @apply="onReviewApply"
      @apply-all="onReviewApplyAll"
      @focus="onReviewFocus"
      @close="showReviewPanel = false"
    />
    <AiPanel
      :visible="aiPanel.state.visible"
      :selection-text="aiPanel.state.selectionText"
      :result="aiPanel.state.result"
      :loading="aiPanel.state.loading"
      :error="aiPanel.state.error"
      :active-action="aiPanel.state.activeAction"
      @run-action="(a) => void aiPanel.runAction(a)"
      @apply-result="() => void aiPanel.applyResultToDoc()"
      @close="aiPanel.close"
    />
    <div
      v-if="showExportMenu"
      class="menu-overlay"
      @click="closeExportMenu"
    ></div>
    <ExportMenu
      :visible="showExportMenu"
      :pandoc-info="pandocInfo"
      :pdf-engine-path="pdfEnginePath"
      @export-html="exportHtml"
      @export-docx="exportDocx"
      @export-pdf="exportPdf"
      @print="doPrint"
      @close="closeExportMenu"
    />
  </div>
</template>
