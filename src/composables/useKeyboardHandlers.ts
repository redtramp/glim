import { ref, computed, onMounted, onUnmounted } from "vue";
import { useTabsStore } from "../stores/useTabsStore";
import { useShortcutsStore } from "../stores/useShortcutsStore";
import { useReadingSettingsStore } from "../stores/useReadingSettingsStore";

export function useKeyboardHandlers(opts: {
  fileManager: {
    openFile: () => Promise<void>;
    saveCurrentFile: () => Promise<boolean>;
    saveAs: () => Promise<boolean>;
    closeCurrentTab: () => Promise<void>;
    closeAllTabs: () => Promise<void>;
    createNewFile: () => Promise<boolean>;
  };
  floatLayout?: { openPanel: (id: any) => void };
  find?: { visible?: any; close?: () => void };
  unsavedDialog?: { showUnsavedDialog?: any; resolveDialog?: (choice: 'save' | 'discard' | 'cancel') => void };
}) {
  const tabs = useTabsStore();
  const shortcuts = useShortcutsStore();
  const reading = useReadingSettingsStore();

  const showSettings = ref(false);
  const showReviewPanel = ref(false);

  const isEditing = computed(() => tabs.activeTab?.isEditing ?? false);

  function toggleEditorMode() {
    const tab = tabs.activeTab;
    if (!tab) return;
    tab.isEditing = !tab.isEditing;
    if (tab.isEditing) {
      tab.draftContent = tab.content;
    } else {
      tab.content = tab.draftContent;
    }
    tab.isDirty = true;
  }

  function openSettings() {
    showSettings.value = true;
  }

  function openReviewPanel() {
    showReviewPanel.value = true;
  }

  function openFileTreePanel() {
    opts.floatLayout?.openPanel("filetree");
  }

  function openSearchPanel() {
    opts.floatLayout?.openPanel("search");
  }

  function openAnnotationsPanel() {
    opts.floatLayout?.openPanel("annotations");
  }

  function openAiCopy() {
    const el = document.querySelector("[data-role='copy-ai']") as HTMLElement | null;
    el?.click();
  }

  function zoomFont(delta: number) {
    if (isEditing.value) {
      reading.setEditorFontSize(reading.settings.editorFontSize + delta);
    } else {
      reading.setFontSize(reading.settings.fontSize + delta);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // 未保存对话框优先处理 Escape
    if (e.key === "Escape") {
      if (opts.unsavedDialog?.showUnsavedDialog?.value) {
        opts.unsavedDialog.resolveDialog?.("cancel");
        return;
      }
      showSettings.value = false;
      showReviewPanel.value = false;
      if (opts.find?.visible?.value && opts.find.close) {
        opts.find.close();
      }
      return;
    }
    if (e.target instanceof HTMLElement && e.target.closest(".modal-overlay")) return;

    const combo = shortcuts.normalizeEvent(e);
    const defs = shortcuts.defs;
    const matched = defs.find((d) => shortcuts.getBinding(d.id) === combo);

    if (!matched) return;

    if (matched.readonly) return;
    if (matched.editOnly && !isEditing.value) return;
    if (matched.target === "editor" && !isEditing.value) return;
    if (matched.target === "app" && isEditing.value) return;

    e.preventDefault();
    e.stopPropagation();

    switch (matched.id) {
      case "toggle-mode":
        toggleEditorMode();
        break;
      case "new-file":
        void opts.fileManager.createNewFile();
        break;
      case "open-file":
        void opts.fileManager.openFile();
        break;
      case "search-panel":
        if (!isEditing.value) openSearchPanel();
        break;
      case "save":
        void opts.fileManager.saveCurrentFile();
        break;
      case "save-as":
        void opts.fileManager.saveAs();
        break;
      case "settings":
        openSettings();
        break;
      case "print":
        void window.__TAURI__?.webview?.WebviewWindow.getByLabel("main")?.print();
        break;
      case "copy-ai":
        openAiCopy();
        break;
      case "review-annotations":
        openReviewPanel();
        break;
      case "zoom-in":
        zoomFont(1);
        break;
      case "zoom-out":
        zoomFont(-1);
        break;
      case "zoom-reset":
        reading.reset();
        break;
      case "find":
        if (!isEditing.value) openSearchPanel();
        break;
      case "toggle-bookmark":
        /* handled by App.vue toggleBookmark */
        break;
      case "open-filetree":
        if (!isEditing.value) openFileTreePanel();
        break;
      case "open-annotations":
        if (!isEditing.value) openAnnotationsPanel();
        break;
      default:
        break;
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    const binding = shortcuts.getBinding("zoom-wheel");
    if (binding !== "Ctrl+Wheel") return;
    e.preventDefault();
    zoomFont(e.deltaY < 0 ? 1 : -1);
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("wheel", handleWheel, { passive: false });
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("wheel", handleWheel);
  });

  return {
    showSettings,
    showReviewPanel,
    handleKeydown,
    handleWheel,
    openSettings,
    openReviewPanel,
  };
}
