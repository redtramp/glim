/**
 * useKeyboardHandlers 测试（阶段二 Task 5：单一视图快捷键收敛）
 *
 * 验证二态删除后：
 * - 编辑类与 app 类快捷键不再被 isEditing/target/editOnly 门控，均可用
 * - Ctrl+F 走 onFind（CM6 页内查找），Ctrl+Shift+F 走 onOpenSearch（全局搜索浮层）
 * - 字号缩放只有一套（setFontSize），不再有 setEditorFontSize 分叉
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const setFontSize = vi.fn();
const normalizeEvent = vi.fn();
const getBinding = vi.fn();

vi.mock("../stores/shortcuts.svelte.ts", () => ({
  useShortcutsStore: () => ({
    normalizeEvent: (e: KeyboardEvent) => normalizeEvent(e),
    getBinding: (id: string) => getBinding(id),
    defs: [
      { id: "find", readonly: false },
      { id: "search-panel", readonly: false },
      { id: "zoom-in", readonly: false },
      { id: "zoom-out", readonly: false },
      { id: "save", readonly: false },
    ],
  }),
}));
vi.mock("../stores/readingSettings.svelte.ts", () => ({
  useReadingSettingsStore: () => ({
    settings: { fontSize: 16 },
    setFontSize: (v: number) => setFontSize(v),
    reset: vi.fn(),
  }),
}));

import { useKeyboardHandlers } from "./useKeyboardHandlers.svelte.ts";

function makeOpts(overrides: Record<string, unknown> = {}) {
  return {
    fileManager: {
      openFile: vi.fn(async () => {}),
      saveCurrentFile: vi.fn(async () => true),
      saveAs: vi.fn(async () => true),
      closeCurrentTab: vi.fn(async () => {}),
      closeAllTabs: vi.fn(async () => {}),
      createNewFile: vi.fn(async () => true),
    },
    onOpenSearch: vi.fn(),
    onFind: vi.fn(),
    ...overrides,
  };
}

/** 让 getBinding 只把指定 id 映射到当前 combo，其余返回空串 */
function bindTo(id: string) {
  normalizeEvent.mockReturnValue("Ctrl+Test");
  getBinding.mockImplementation((key: string) => (key === id ? "Ctrl+Test" : ""));
}

function keydown(key = "x"): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardHandlers（单一视图）", () => {
  it("Ctrl+F 走 onFind（CM6 页内查找），不再按 isEditing 分流", () => {
    bindTo("find");
    const opts = makeOpts();
    const h = useKeyboardHandlers(opts as never);
    h.handleKeydown(keydown("f"));
    expect(opts.onFind).toHaveBeenCalledTimes(1);
    expect(opts.onOpenSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+F 走 onOpenSearch（全文搜索浮层）", () => {
    bindTo("search-panel");
    const opts = makeOpts();
    const h = useKeyboardHandlers(opts as never);
    h.handleKeydown(keydown("F"));
    expect(opts.onOpenSearch).toHaveBeenCalledTimes(1);
    expect(opts.onFind).not.toHaveBeenCalled();
  });

  it("zoom-in 只调 setFontSize（单套字号，无 setEditorFontSize 分叉）", () => {
    bindTo("zoom-in");
    const h = useKeyboardHandlers(makeOpts() as never);
    h.handleKeydown(keydown("+"));
    expect(setFontSize).toHaveBeenCalledWith(17);
  });

  it("zoom-out 调 setFontSize(15)", () => {
    bindTo("zoom-out");
    const h = useKeyboardHandlers(makeOpts() as never);
    h.handleKeydown(keydown("-"));
    expect(setFontSize).toHaveBeenCalledWith(15);
  });

  it("app 类快捷键不再被 isEditing 门控，始终可用", () => {
    bindTo("save");
    const opts = makeOpts();
    const h = useKeyboardHandlers(opts as never);
    h.handleKeydown(keydown("s"));
    expect(opts.fileManager.saveCurrentFile).toHaveBeenCalledTimes(1);
  });
});
