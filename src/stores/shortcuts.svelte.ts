import { i18n } from "../i18n";
import { loadJson, saveJson } from "../utils/storage";

export type ShortcutTarget = "app" | "editor" | "both" | "readonly";
export type ShortcutCategory = "global" | "editor" | "find";

export interface ShortcutDef {
  id: string;
  defaultBinding: string;
  target: ShortcutTarget;
  editOnly?: boolean;
  category: ShortcutCategory;
  descKey: string;
  readonly?: boolean;
}

const DEFS: ShortcutDef[] = [
  { id: "toggle-mode", defaultBinding: "Ctrl+E", target: "both", category: "global", descKey: "toggleMode" },
  { id: "new-file", defaultBinding: "Ctrl+N", target: "both", category: "global", descKey: "newFile" },
  { id: "open-file", defaultBinding: "Ctrl+O", target: "both", category: "global", descKey: "openFile" },
  { id: "search-panel", defaultBinding: "Ctrl+Shift+F", target: "app", category: "global", descKey: "searchPanel" },
  { id: "save", defaultBinding: "Ctrl+S", target: "both", category: "global", descKey: "save" },
  { id: "save-as", defaultBinding: "Ctrl+Shift+S", target: "app", category: "global", descKey: "saveAs" },
  { id: "settings", defaultBinding: "Ctrl+,", target: "app", category: "global", descKey: "settings" },
  { id: "print", defaultBinding: "Ctrl+P", target: "app", category: "global", descKey: "print" },
  { id: "copy-ai", defaultBinding: "Ctrl+Shift+C", target: "app", category: "global", descKey: "copyAI" },
  { id: "review-annotations", defaultBinding: "Ctrl+Shift+R", target: "app", category: "global", descKey: "reviewAnnotations" },
  { id: "zoom-in", defaultBinding: "Ctrl+=", target: "app", category: "global", descKey: "zoomIn" },
  { id: "zoom-out", defaultBinding: "Ctrl+-", target: "app", category: "global", descKey: "zoomOut" },
  { id: "zoom-reset", defaultBinding: "Ctrl+0", target: "app", category: "global", descKey: "zoomReset" },
  { id: "find", defaultBinding: "Ctrl+F", target: "both", category: "find", descKey: "find" },
  { id: "replace", defaultBinding: "Ctrl+H", target: "both", editOnly: true, category: "find", descKey: "replace" },
  { id: "go-to-line", defaultBinding: "Ctrl+G", target: "app", editOnly: true, category: "find", descKey: "goToLine" },
  { id: "bold", defaultBinding: "Ctrl+B", target: "editor", category: "editor", descKey: "bold" },
  { id: "italic", defaultBinding: "Ctrl+I", target: "editor", category: "editor", descKey: "italic" },
  { id: "underline", defaultBinding: "Ctrl+U", target: "editor", category: "editor", descKey: "underline" },
  { id: "highlight", defaultBinding: "Ctrl+L", target: "editor", category: "editor", descKey: "highlight" },
  { id: "inline-code", defaultBinding: "Ctrl+Shift+`", target: "editor", category: "editor", descKey: "inlineCode" },
  { id: "close", defaultBinding: "Esc", target: "readonly", category: "global", descKey: "close", readonly: true },
  { id: "zoom-wheel", defaultBinding: "Ctrl+Wheel", target: "readonly", category: "global", descKey: "zoomWheel", readonly: true },
  { id: "toggle-bookmark", defaultBinding: "Ctrl+D", target: "app", category: "global", descKey: "toggleBookmark" },
  { id: "open-filetree", defaultBinding: "Ctrl+E", target: "app", category: "global", descKey: "openFiletree" },
  { id: "open-annotations", defaultBinding: "Ctrl+Shift+A", target: "app", category: "global", descKey: "openAnnotations" },
];

function normalizeComboKey(combo: string): string {
  const parts = combo.split("+");
  const last = parts[parts.length - 1];
  if (last.length === 1 && /[a-zA-Z]/.test(last)) {
    parts[parts.length - 1] = last.toLowerCase();
  }
  return parts.join("+");
}

const DEFAULTS: Record<string, string> = {};
for (const def of DEFS) {
  DEFAULTS[def.id] = normalizeComboKey(def.defaultBinding);
}

const STORAGE = "glim-reader-shortcuts";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/**
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 方法内联在 state 字面量上，保持旧实例全量 surface。
 */
export const shortcutsState = $state({
  defs: DEFS,
  overrides: loadJson<Record<string, string>>(STORAGE, {}),

  persist() {
    saveJson(STORAGE, shortcutsState.overrides);
  },

  getBinding(id: string): string {
    return shortcutsState.overrides[id] ?? DEFAULTS[id] ?? "";
  },

  getDef(id: string): ShortcutDef | undefined {
    return DEFS.find((d) => d.id === id);
  },

  setBinding(
    id: string,
    combo: string
  ): { ok: boolean; conflict?: string } {
    const normalized = normalizeComboKey(combo);
    for (const def of DEFS) {
      if (def.readonly || def.id === id) continue;
      if (shortcutsState.getBinding(def.id) === normalized) {
        return { ok: false, conflict: i18n.global.t(`shortcuts.${def.descKey}`) };
      }
    }
    const next = { ...shortcutsState.overrides };
    if (normalized === DEFAULTS[id]) {
      delete next[id];
    } else {
      next[id] = normalized;
    }
    shortcutsState.overrides = next;
    shortcutsState.persist();
    return { ok: true };
  },

  resetBinding(id: string) {
    if (!(id in shortcutsState.overrides)) return;
    const next = { ...shortcutsState.overrides };
    delete next[id];
    shortcutsState.overrides = next;
    shortcutsState.persist();
  },

  resetAll() {
    shortcutsState.overrides = {};
    shortcutsState.persist();
  },

  isCustom(id: string): boolean {
    return id in shortcutsState.overrides;
  },

  normalizeEvent(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    let key = e.key;
    if (key.length === 1) key = key.toLowerCase();
    parts.push(key);
    return parts.join("+");
  },

  toCodeMirror(combo: string): string {
    return combo
      .split("+")
      .map((p) => (p === "Ctrl" ? "Mod" : p))
      .join("-");
  },

  formatBinding(combo: string): string {
    const parts = combo.split("+");
    const last = parts[parts.length - 1];
    if (last.length === 1 && /[a-z]/.test(last)) {
      parts[parts.length - 1] = last.toUpperCase();
    }
    return parts.join("+");
  },

  isValidCombo(combo: string): boolean {
    if (!combo.includes("Ctrl")) return false;
    const parts = combo.split("+");
    const last = parts[parts.length - 1];
    if (MODIFIER_KEYS.has(last)) return false;
    return true;
  },

  isModifierKey(key: string): boolean {
    return MODIFIER_KEYS.has(key);
  },
});

/** 兼容旧调用形状: const store = useShortcutsStore(); store.overrides */
export function useShortcutsStore() {
  return shortcutsState;
}
