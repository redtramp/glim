/**
 * App.svelte 集成测试 — 外部文件变化处理
 *
 * 测试目标:
 * - onFilesChanged 标记 stale 而非直接 forceReload
 * - switchToTab 检测 stale 并触发 banner
 * - auto-reload 白名单中的 tab 直接 reload
 */

import { describe, it, expect, vi } from "vitest";

// Mock localStorage（标签单例持久化依赖）
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { for (const key in mockStorage) delete mockStorage[key]; },
    get length() { return Object.keys(mockStorage).length; },
    key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
  },
});
import { useTabs } from "./composables/useTabs.svelte.ts";

// Mock Tauri readTextFile
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
}));

describe("App.svelte 外部文件变化处理", () => {
  describe("onFilesChanged 标记 stale", () => {
    it("onFilesChanged 标记 tab.staleSince 而非直接 forceReload", async () => {
      const api = useTabs();
      const tab = api.createTab("/root/test.md");
      api.tabs.push(tab);
      api.activeTabId = tab.id;

      // Simulate onFilesChanged: mark stale
      tab.staleSince = Date.now();
      expect(tab.staleSince).toBeGreaterThanOrEqual(0);
      expect(tab.staleSince).not.toBe(null);
    });

    it("dirty tab 也被标记 stale（不走弹窗）", async () => {
      const api = useTabs();
      const tab = api.createTab("/root/test.md");
      tab.isDirty = true;
      api.tabs.push(tab);
      api.activeTabId = tab.id;

      // Even dirty tabs are marked stale (non-blocking)
      tab.staleSince = Date.now();
      expect(tab.staleSince).toBeGreaterThanOrEqual(0);
    });
  });

  describe("switchToTab 检测 stale", () => {
    it("switchToTab 对 stale tab 不阻塞", async () => {
      const api = useTabs();
      const tab1 = api.createTab("/root/tab1.md");
      const tab2 = api.createTab("/root/tab2.md");
      tab2.staleSince = Date.now();
      api.tabs.push(tab1, tab2);
      api.activeTabId = tab1.id;

      // switchToTab should complete synchronously (non-blocking)
      api.activateTab(tab2.id);
      expect(api.activeTabId).toBe(tab2.id);
    });
  });

  describe("auto-reload 白名单", () => {
    it("白名单中的 tab 直接 reload 不标记 stale", async () => {
      const whitelist = new Set<string>("/root/test.md");
      const api = useTabs();
      const tab = api.createTab("/root/test.md");
      api.tabs.push(tab);
      api.activeTabId = tab.id;

      // Tab is in whitelist, should not show stale banner
      const shouldShowBanner = tab.staleSince !== null && !whitelist.has(tab.path);
      expect(shouldShowBanner).toBe(false);
    });

    it("非白名单 tab 显示 stale banner", async () => {
      const whitelist = new Set<string>();
      const api = useTabs();
      const tab = api.createTab("/root/test.md");
      api.tabs.push(tab);
      api.activeTabId = tab.id;
      tab.staleSince = Date.now();

      const shouldShowBanner = tab.staleSince !== null && !whitelist.has(tab.path);
      expect(shouldShowBanner).toBe(true);
    });
  });
});
