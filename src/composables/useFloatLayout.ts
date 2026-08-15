import { reactive } from "vue";

export type LeftPanelID =
  | "filetree"
  | "history"
  | "search"
  | "annotations"
  | "bookmark"
  | "edit"
  | "new-file"
  | "open-file"
  | "open-folder"
  | "export"
  | "ai"
  | "settings"
  | "help"
  | "locale-toggle"
  | "theme-toggle";

export interface LeftPanelMeta {
  id: LeftPanelID;
  icon: string;
  labelKey: string;
  group: "navigation" | "content" | "tools" | "actions";
}

export const LEFT_PANEL_META: LeftPanelMeta[] = [
  { id: "filetree", icon: "🗂", labelKey: "float.filetree", group: "navigation" },
  { id: "history", icon: "🕐", labelKey: "float.history", group: "navigation" },
  { id: "search", icon: "🔍", labelKey: "float.search", group: "content" },
  { id: "annotations", icon: "✏️", labelKey: "float.annotations", group: "content" },
  { id: "bookmark", icon: "🔖", labelKey: "float.bookmark", group: "content" },
  { id: "new-file", icon: "📄", labelKey: "float.newFile", group: "actions" },
  { id: "open-file", icon: "📂", labelKey: "float.openFile", group: "actions" },
  { id: "open-folder", icon: "🗀", labelKey: "float.openFolder", group: "actions" },
  { id: "export", icon: "⇩", labelKey: "float.export", group: "actions" },
  { id: "edit", icon: "✎", labelKey: "float.editToggle", group: "actions" },
  { id: "ai", icon: "🤖", labelKey: "float.ai", group: "tools" },
  { id: "settings", icon: "⚙️", labelKey: "float.settings", group: "tools" },
  { id: "help", icon: "❓", labelKey: "float.help", group: "tools" },
  { id: "locale-toggle", icon: "🌐", labelKey: "float.localeToggle", group: "tools" },
  { id: "theme-toggle", icon: "🌓", labelKey: "float.themeToggle", group: "tools" },
];

/** 动作类面板 ID（不展开浮层，直接执行动作） */
export const ACTION_PANEL_IDS: ReadonlySet<LeftPanelID> = new Set([
  "locale-toggle",
  "theme-toggle",
  "new-file",
  "open-file",
  "open-folder",
  "export",
  "edit",
]);

const CLOSE_EXEMPT_SELECTORS =
  ".floating-panel, .left-rail, .menu-overlay, .context-menu, .context-menu-overlay, .annotation-toolbar, .search-overlay";

export function useFloatLayout() {
  const state = reactive({
    activeLeftPanel: null as LeftPanelID | null,
    leftPanelLoaded: new Set<LeftPanelID>(),
  });

  let globalClickHandler: ((e: MouseEvent) => void) | null = null;

  function openPanel(id: LeftPanelID): void {
    state.leftPanelLoaded = new Set(state.leftPanelLoaded).add(id);
    state.activeLeftPanel = state.activeLeftPanel === id ? null : id;
  }

  function closePanel(): void {
    state.activeLeftPanel = null;
  }

  function onOutsideClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest(CLOSE_EXEMPT_SELECTORS)) return;
    closePanel();
  }

  function bindGlobalClick(): void {
    if (globalClickHandler) return;
    globalClickHandler = onOutsideClick;
    document.addEventListener("click", globalClickHandler, false);
  }

  function unbindGlobalClick(): void {
    if (!globalClickHandler) return;
    document.removeEventListener("click", globalClickHandler, false);
    globalClickHandler = null;
  }

  return {
    state,
    openPanel,
    closePanel,
    bindGlobalClick,
    unbindGlobalClick,
  };
}
