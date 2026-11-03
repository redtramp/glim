/**
 * stores/readingSettings 测试
 *
 * 测试目标:
 * - 默认值 / 各 setter 的夹取边界 / save 触发
 * - setFontCustom / setEditorFontCustom 仅在 custom 字体下保存
 * - getReaderFontFamily / getEditorFontFamily: custom 值、已知字体栈、未知键回退
 * - apply 写入 documentElement CSS 变量
 * - reset 还原默认 / fontOptions / loadSystemFonts（去重+排序+异常回退）
 * - useReadingSettings 包装层委托
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { readingSettingsState, useReadingSettingsStore } from "./readingSettings.svelte.ts";
import { useReadingSettings } from "../composables/useReadingSettings.svelte.ts";

const mockedInvoke = vi.mocked(invoke);

const STORAGE = "glim-reader-reading";

function defaults() {
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

describe("stores/readingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    readingSettingsState.settings = defaults();
  });

  it("setFontSize 夹取 [10,28] 并保存", () => {
    readingSettingsState.setFontSize(28);
    expect(readingSettingsState.settings.fontSize).toBe(28);
    readingSettingsState.setFontSize(9);
    expect(readingSettingsState.settings.fontSize).toBe(10);
    readingSettingsState.setFontSize(100);
    expect(localStorage.getItem(STORAGE)).toBeTruthy();
  });

  it("setLineHeight 夹取 [1.2,2.4]", () => {
    readingSettingsState.setLineHeight(1.0);
    expect(readingSettingsState.settings.lineHeight).toBe(1.2);
    readingSettingsState.setLineHeight(9);
    expect(readingSettingsState.settings.lineHeight).toBe(2.4);
  });

  it("setMaxWidth 夹取 [600,1400]", () => {
    readingSettingsState.setMaxWidth(100);
    expect(readingSettingsState.settings.maxWidth).toBe(600);
    readingSettingsState.setMaxWidth(9999);
    expect(readingSettingsState.settings.maxWidth).toBe(1400);
  });

  it("setEditorFontSize 夹取 [12,24]", () => {
    readingSettingsState.setEditorFontSize(1);
    expect(readingSettingsState.settings.editorFontSize).toBe(12);
    readingSettingsState.setEditorFontSize(999);
    expect(readingSettingsState.settings.editorFontSize).toBe(24);
  });

  it("setFontFamily / setEditorFontFamily 直接赋值并保存", () => {
    readingSettingsState.setFontFamily("serif");
    readingSettingsState.setEditorFontFamily("terminal");
    expect(readingSettingsState.settings.fontFamily).toBe("serif");
    expect(readingSettingsState.settings.editorFontFamily).toBe("terminal");
  });

  it("setFontCustom 仅在 fontFamily=custom 时保存", () => {
    readingSettingsState.settings.fontFamily = "system";
    readingSettingsState.setFontCustom("My Font");
    expect(readingSettingsState.settings.fontCustom).toBe("My Font");
    expect(localStorage.getItem(STORAGE)).toBeNull();

    readingSettingsState.settings.fontFamily = "custom";
    readingSettingsState.setFontCustom("My Font 2");
    expect(localStorage.getItem(STORAGE)).toBeTruthy();
  });

  it("setEditorFontCustom 仅在 editorFontFamily=custom 时保存", () => {
    readingSettingsState.settings.editorFontFamily = "mono";
    readingSettingsState.setEditorFontCustom("Code Font");
    expect(localStorage.getItem(STORAGE)).toBeNull();

    readingSettingsState.settings.editorFontFamily = "custom";
    readingSettingsState.setEditorFontCustom("Code Font 2");
    expect(localStorage.getItem(STORAGE)).toBeTruthy();
  });

  it("getReaderFontFamily: custom 值优先、已知键返回字体栈、未知键原样", () => {
    readingSettingsState.settings.fontFamily = "custom";
    readingSettingsState.settings.fontCustom = "My Reader";
    expect(readingSettingsState.getReaderFontFamily()).toBe("My Reader");

    readingSettingsState.settings.fontFamily = "serif";
    expect(readingSettingsState.getReaderFontFamily()).toContain("serif");

    readingSettingsState.settings.fontFamily = "unknown-key";
    expect(readingSettingsState.getReaderFontFamily()).toBe("unknown-key");
  });

  it("getEditorFontFamily: custom 值优先、已知键返回字体栈、未知键原样", () => {
    readingSettingsState.settings.editorFontFamily = "custom";
    readingSettingsState.settings.editorFontCustom = "My Editor";
    expect(readingSettingsState.getEditorFontFamily()).toBe("My Editor");

    readingSettingsState.settings.editorFontFamily = "mono";
    expect(readingSettingsState.getEditorFontFamily()).toContain("monospace");

    readingSettingsState.settings.editorFontFamily = "unknown";
    expect(readingSettingsState.getEditorFontFamily()).toBe("unknown");
  });

  it("apply 写入 documentElement CSS 变量", () => {
    readingSettingsState.settings.fontSize = 18;
    readingSettingsState.settings.lineHeight = 2;
    readingSettingsState.settings.maxWidth = 800;
    readingSettingsState.setFontFamily("system");
    readingSettingsState.apply();
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--reader-font-size")).toBe("18px");
    expect(style.getPropertyValue("--reader-line-height")).toBe("2");
    expect(style.getPropertyValue("--reader-max-width")).toBe("800px");
    expect(style.getPropertyValue("--reader-font-family")).toBeTruthy();
    expect(style.getPropertyValue("--editor-font-size")).toBe("16px");
  });

  it("reset 还原默认", () => {
    readingSettingsState.setFontSize(28);
    readingSettingsState.reset();
    expect(readingSettingsState.settings).toEqual(defaults());
  });

  it("fontOptions/editorFontOptions 六项", () => {
    expect(readingSettingsState.fontOptions).toHaveLength(6);
    expect(readingSettingsState.editorFontOptions).toHaveLength(6);
    expect(readingSettingsState.fontOptions[0]).toHaveProperty("value");
    expect(readingSettingsState.fontOptions[0]).toHaveProperty("label");
  });

  it("loadSystemFonts 去重并按名称排序", async () => {
    mockedInvoke.mockResolvedValue([
      { id: "1", name: "Beta", font_name: "" },
      { id: "2", name: "alpha", font_name: "" },
      { id: "3", name: "Beta", font_name: "" },
    ]);
    const fonts = await readingSettingsState.loadSystemFonts();
    expect(fonts.map((f) => f.name)).toEqual(["alpha", "Beta"]);
  });

  it("loadSystemFonts 异常回退空数组", async () => {
    mockedInvoke.mockRejectedValue(new Error("boom"));
    expect(await readingSettingsState.loadSystemFonts()).toEqual([]);
  });

  it("useReadingSettingsStore 返回同一状态", () => {
    expect(useReadingSettingsStore()).toBe(readingSettingsState);
  });

  it("useReadingSettings 包装层委托 setters 与 getter", () => {
    const r = useReadingSettings();
    r.setFontSize(20);
    expect(r.settings.fontSize).toBe(20);
    r.setMaxWidth(700);
    expect(r.settings.maxWidth).toBe(700);
    expect(r.fontOptions).toHaveLength(6);
    expect(r.editorFontOptions).toHaveLength(6);
    r.reset();
    expect(r.settings).toEqual(defaults());
  });
});
