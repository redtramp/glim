import { describe, it, expect, vi } from "vitest";
import { app, useAppStore, showError, showExportToast } from "./app.svelte.ts";

describe("app store 冒烟（Svelte 5 runes）", () => {
  it("响应式写入不抛错", () => {
    expect(() => (app.errorMsg = "x")).not.toThrow();
    expect(app.errorMsg).toBe("x");
    app.errorMsg = "";
  });

  it("useAppStore() 返回含状态与函数的完整对象（Interfaces 形状不变）", () => {
    const store = useAppStore();
    expect(typeof store.toggleTheme).toBe("function");
    expect(typeof store.applyTheme).toBe("function");
    expect(typeof store.setTheme).toBe("function");
    expect(typeof store.showError).toBe("function");
    expect(typeof store.showExportToast).toBe("function");
    expect(store.theme === "light" || store.theme === "dark").toBe(true);
  });

  it("showError / showExportToast 写入状态且超时后清空", () => {
    vi.useFakeTimers();
    showError("boom", 100);
    expect(app.errorMsg).toBe("boom");
    vi.advanceTimersByTime(150);
    expect(app.errorMsg).toBe("");

    showExportToast("done", 100);
    expect(app.exportToast).toBe("done");
    vi.advanceTimersByTime(150);
    expect(app.exportToast).toBe("");
    vi.useRealTimers();
  });
});
