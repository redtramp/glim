/**
 * editorPreload 单测:编辑意图标记的读写与容错。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { markEditorUsed, hasEditorIntent } from "./editorPreload";

const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
    clear: () => {
      for (const k in mockStorage) delete mockStorage[k];
    },
  },
  configurable: true,
});

describe("editorPreload", () => {
  beforeEach(() => {
    for (const k in mockStorage) delete mockStorage[k];
  });

  it("初始无编辑意图", () => {
    expect(hasEditorIntent()).toBe(false);
  });

  it("markEditorUsed 后 hasEditorIntent 为 true", () => {
    markEditorUsed();
    expect(hasEditorIntent()).toBe(true);
    expect(mockStorage["glim-reader-editor-used"]).toBe("1");
  });

  it("localStorage 抛错时退化为 false 而不抛出", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
    expect(() => markEditorUsed()).not.toThrow();
    expect(hasEditorIntent()).toBe(false);
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
  });
});
