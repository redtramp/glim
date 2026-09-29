import { i18n } from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import { loadJson, saveJson } from "../utils/storage";

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  fontFamily: string;
  fontCustom: string;
  editorFontSize: number;
  editorFontFamily: string;
  editorFontCustom: string;
}

const STORAGE = "glim-reader-reading";

const FONT_KEYS = ["system", "sans", "serif", "mono", "terminal", "custom"] as const;

const FONT_STACKS: Record<string, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  sans:
    '"Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  serif:
    '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", Georgia, serif',
  mono:
    'ui-monospace, SFMono-Regular, "JetBrains Mono", "Cascadia Code", "Source Code Pro", Consolas, monospace',
  terminal:
    'ui-monospace, SFMono-Regular, "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
  custom: "",
};

function defaults(): ReadingSettings {
  return {
    fontSize: 16,
    lineHeight: 1.75,
    maxWidth: 900,
    fontFamily: "system",
    fontCustom: "",
    editorFontSize: 16,
    editorFontFamily: "mono",
    editorFontCustom: "",
  };
}

/**
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 方法与 computed getter 内联在 state 字面量上，保持旧实例全量 surface。
 * 注: save/getReaderFontFamily/getEditorFontFamily 旧为闭包私有，现随字面量
 * 一并暴露（仅新增，不改变既有调用面）。
 */
export const readingSettingsState = $state({
  settings: loadJson<ReadingSettings>(STORAGE, defaults()),

  get fontOptions() {
    return FONT_KEYS.map((key) => ({
      label: i18n.global.t(`settings.${key}`),
      value: key,
    }));
  },

  get editorFontOptions() {
    return FONT_KEYS.map((key) => ({
      label: i18n.global.t(`settings.${key}`),
      value: key,
    }));
  },

  save() {
    saveJson(STORAGE, readingSettingsState.settings);
    readingSettingsState.apply();
  },

  apply() {
    const r = document.documentElement;
    const readerFont = readingSettingsState.getReaderFontFamily();
    const editorFont = readingSettingsState.getEditorFontFamily();
    r.style.setProperty(
      "--reader-font-size",
      readingSettingsState.settings.fontSize + "px"
    );
    r.style.setProperty(
      "--reader-line-height",
      String(readingSettingsState.settings.lineHeight)
    );
    r.style.setProperty(
      "--reader-max-width",
      readingSettingsState.settings.maxWidth + "px"
    );
    r.style.setProperty("--reader-font-family", readerFont);
    r.style.setProperty(
      "--editor-font-size",
      readingSettingsState.settings.editorFontSize + "px"
    );
    r.style.setProperty("--editor-font-family", editorFont);
  },

  getReaderFontFamily(): string {
    const s = readingSettingsState.settings;
    if (s.fontFamily === "custom" && s.fontCustom) {
      return s.fontCustom;
    }
    if (FONT_STACKS[s.fontFamily]) {
      return FONT_STACKS[s.fontFamily];
    }
    return s.fontFamily;
  },

  getEditorFontFamily(): string {
    const s = readingSettingsState.settings;
    if (s.editorFontFamily === "custom" && s.editorFontCustom) {
      return s.editorFontCustom;
    }
    if (FONT_STACKS[s.editorFontFamily]) {
      return FONT_STACKS[s.editorFontFamily];
    }
    return s.editorFontFamily;
  },

  setFontSize(v: number) {
    readingSettingsState.settings.fontSize = Math.max(10, Math.min(28, v));
    readingSettingsState.save();
  },

  setLineHeight(v: number) {
    readingSettingsState.settings.lineHeight = Math.max(1.2, Math.min(2.4, v));
    readingSettingsState.save();
  },

  setMaxWidth(v: number) {
    readingSettingsState.settings.maxWidth = Math.max(600, Math.min(1400, v));
    readingSettingsState.save();
  },

  setFontFamily(v: string) {
    readingSettingsState.settings.fontFamily = v;
    readingSettingsState.save();
  },

  setEditorFontSize(v: number) {
    readingSettingsState.settings.editorFontSize = Math.max(12, Math.min(24, v));
    readingSettingsState.save();
  },

  setFontCustom(v: string) {
    readingSettingsState.settings.fontCustom = v;
    if (readingSettingsState.settings.fontFamily === "custom") {
      readingSettingsState.save();
    }
  },

  setEditorFontFamily(v: string) {
    readingSettingsState.settings.editorFontFamily = v;
    readingSettingsState.save();
  },

  setEditorFontCustom(v: string) {
    readingSettingsState.settings.editorFontCustom = v;
    if (readingSettingsState.settings.editorFontFamily === "custom") {
      readingSettingsState.save();
    }
  },

  reset() {
    readingSettingsState.settings = defaults();
    readingSettingsState.save();
  },

  async loadSystemFonts(): Promise<{ name: string }[]> {
    try {
      const fonts = (await invoke("get_system_fonts")) as Array<{
        id: string;
        name: string;
        font_name: string;
      }>;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 局部过程集合，无响应式依赖（与原 vue 行为一致）
      const seen = new Set<string>();
      return fonts
        .map((f) => f.name)
        .filter((n) => {
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((n) => ({ name: n }));
    } catch {
      return [];
    }
  },
});

/** 兼容旧调用形状: const store = useReadingSettingsStore(); store.settings */
export function useReadingSettingsStore() {
  return readingSettingsState;
}
