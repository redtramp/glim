/**
 * useReadingSettings — 向后兼容薄包装层，核心状态已迁移到 useReadingSettingsStore
 *
 * 新代码应直接使用 useReadingSettingsStore。
 */
import { useReadingSettingsStore } from "../stores/readingSettings.svelte.ts";
import type { ReadingSettings } from "../stores/readingSettings.svelte.ts";

export function useReadingSettings() {
  const store = useReadingSettingsStore();

  function apply() {
    store.apply();
  }

  function setFontSize(v: number) {
    store.setFontSize(v);
  }

  function setLineHeight(v: number) {
    store.setLineHeight(v);
  }

  function setMaxWidth(v: number) {
    store.setMaxWidth(v);
  }

  function setFontFamily(v: string) {
    store.setFontFamily(v);
  }

  function setFontCustom(v: string) {
    store.setFontCustom(v);
  }

  function setEditorFontSize(v: number) {
    store.setEditorFontSize(v);
  }

  function setEditorFontFamily(v: string) {
    store.setEditorFontFamily(v);
  }

  function setEditorFontCustom(v: string) {
    store.setEditorFontCustom(v);
  }

  function reset() {
    store.reset();
  }

  async function loadSystemFonts() {
    return await store.loadSystemFonts();
  }

  return {
    get settings() {
      return store.settings;
    },
    set settings(v: ReadingSettings) {
      store.settings = v;
    },
    get fontOptions() {
      return store.fontOptions;
    },
    get editorFontOptions() {
      return store.editorFontOptions;
    },
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
}
