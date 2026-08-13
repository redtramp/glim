import { defineStore } from "pinia";
import { ref, computed } from "vue";
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

export const useReadingSettingsStore = defineStore("readingSettings", () => {
  const settings = ref<ReadingSettings>(
    loadJson<ReadingSettings>(STORAGE, defaults())
  );

  function save() {
    saveJson(STORAGE, settings.value);
    apply();
  }

  function apply() {
    const r = document.documentElement;
    const readerFont = getReaderFontFamily();
    const editorFont = getEditorFontFamily();
    r.style.setProperty("--reader-font-size", settings.value.fontSize + "px");
    r.style.setProperty("--reader-line-height", String(settings.value.lineHeight));
    r.style.setProperty("--reader-max-width", settings.value.maxWidth + "px");
    r.style.setProperty("--reader-font-family", readerFont);
    r.style.setProperty("--editor-font-size", settings.value.editorFontSize + "px");
    r.style.setProperty("--editor-font-family", editorFont);
  }

  function getReaderFontFamily(): string {
    if (settings.value.fontFamily === "custom" && settings.value.fontCustom) {
      return settings.value.fontCustom;
    }
    if (FONT_STACKS[settings.value.fontFamily]) {
      return FONT_STACKS[settings.value.fontFamily];
    }
    return settings.value.fontFamily;
  }

  function getEditorFontFamily(): string {
    if (settings.value.editorFontFamily === "custom" && settings.value.editorFontCustom) {
      return settings.value.editorFontCustom;
    }
    if (FONT_STACKS[settings.value.editorFontFamily]) {
      return FONT_STACKS[settings.value.editorFontFamily];
    }
    return settings.value.editorFontFamily;
  }

  function setFontSize(v: number) {
    settings.value.fontSize = Math.max(10, Math.min(28, v));
    save();
  }

  function setLineHeight(v: number) {
    settings.value.lineHeight = Math.max(1.2, Math.min(2.4, v));
    save();
  }

  function setMaxWidth(v: number) {
    settings.value.maxWidth = Math.max(600, Math.min(1400, v));
    save();
  }

  function setFontFamily(v: string) {
    settings.value.fontFamily = v;
    save();
  }

  function setEditorFontSize(v: number) {
    settings.value.editorFontSize = Math.max(12, Math.min(24, v));
    save();
  }

  function setFontCustom(v: string) {
    settings.value.fontCustom = v;
    if (settings.value.fontFamily === "custom") save();
  }

  function setEditorFontFamily(v: string) {
    settings.value.editorFontFamily = v;
    save();
  }

  function setEditorFontCustom(v: string) {
    settings.value.editorFontCustom = v;
    if (settings.value.editorFontFamily === "custom") save();
  }

  function reset() {
    settings.value = defaults();
    save();
  }

  const fontOptions = computed(() =>
    FONT_KEYS.map((key) => ({
      label: i18n.global.t(`settings.${key}`),
      value: key,
    }))
  );

  const editorFontOptions = computed(() =>
    FONT_KEYS.map((key) => ({
      label: i18n.global.t(`settings.${key}`),
      value: key,
    }))
  );

  async function loadSystemFonts(): Promise<{ name: string }[]> {
    try {
      const fonts = (await invoke("get_system_fonts")) as Array<{
        id: string;
        name: string;
        font_name: string;
      }>;
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
  }

  return {
    settings,
    fontOptions,
    editorFontOptions,
    apply,
    setFontSize,
    setLineHeight,
    setMaxWidth,
    setFontFamily,
    setFontCustom,
    setEditorFontSize,
    setEditorFontFamily,
    setEditorFontCustom,
    reset,
    loadSystemFonts,
  };
});
