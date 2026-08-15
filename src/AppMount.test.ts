/**
 * App.vue 挂载回归测试
 *
 * 覆盖两类已修复的缺陷：
 * 1. TDZ 崩溃：useSectionMarkers 必须在使用 useTabs() 之后创建。
 *    其内部 immediate watch 会同步求值 headings computed，若 activeTab 尚未
 *    初始化将抛出 ReferenceError，导致整个应用启动即崩溃、大纲无法跳转。
 * 2. 多文档恢复：restoreTabs 并行读取、标签顺序稳定、后台标签延迟提取大纲、
 *    监听目录去重（启动变慢的根因）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";

// ---- localStorage mock（Pinia 持久化依赖） ----
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
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  },
});

// ---- Tauri API mocks ----
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({ onDragDropEvent: vi.fn(async () => () => {}) })),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ onCloseRequested: vi.fn(async () => () => {}) })),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(async () => false),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";

const invokeMock = vi.mocked(invoke);
const readTextFileMock = vi.mocked(readTextFile);

async function defaultInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "initial_open_file":
      return null;
    case "get_home_dir":
      return "/home/test";
    case "list_dir":
      return [];
    case "start_watch":
    case "stop_watch":
    case "watch_path":
      return null;
    case "check_pandoc":
      return { available: false, version: "", has_xelatex: false };
    case "check_pdf_engine":
      return null;
    default:
      return null;
  }
}

function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = shallowMount(App, { global: { plugins: [pinia, i18n] } });
  return wrapper;
}

// 顶层 beforeEach：对文件内所有 describe 生效（含下方基准测试），避免 mock 跨用例串扰
beforeEach(() => {
  for (const k in mockStorage) delete mockStorage[k];
  invokeMock.mockReset();
  invokeMock.mockImplementation(defaultInvoke);
  readTextFileMock.mockReset();
});

describe("App.vue 挂载", () => {
  it("应用可成功挂载（useSectionMarkers 不再触发 TDZ 崩溃）", async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.exists()).toBe(true);
    wrapper.unmount();
  });

  it("多文档恢复：并行读取、顺序稳定、仅激活标签提取大纲、目录监听去重", async () => {
    mockStorage["glim-reader-tabs"] = JSON.stringify({
      paths: ["/docs/a.md", "/docs/b.md", "/docs/c.md"],
      activePath: "/docs/b.md",
    });
    readTextFileMock.mockImplementation(async (p: string | URL) => `# 标题 ${String(p)}\n\n正文内容。`);

    const wrapper = mountApp();
    await flushPromises();

    // 所有持久化文件均被读取（并行）
    expect(readTextFileMock).toHaveBeenCalledTimes(3);

    const tabs = (wrapper.vm as unknown as { tabs: Array<{ path: string; headings: unknown[] }> }).tabs;
    expect(tabs.length).toBe(3);
    // 标签按上次会话顺序恢复
    expect(tabs.map((t) => t.path)).toEqual(["/docs/a.md", "/docs/b.md", "/docs/c.md"]);
    // 激活标签提取了大纲
    expect(tabs[1].headings.length).toBeGreaterThan(0);
    // 后台标签延迟提取（激活时才补，显著加快多文档启动）
    expect(tabs[0].headings.length).toBe(0);
    expect(tabs[2].headings.length).toBe(0);

    // 同一目录 /docs 只注册一次 watch_path（去重）。
    // 恢复期间 watcher 尚未启动（watchFile 直接跳过），启动后 startWatching 统一注册一次；
    // 若无去重，恢复阶段会按文件数发出 N 次 IPC。
    const watchPathCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "watch_path");
    expect(watchPathCalls).toHaveLength(1);

    wrapper.unmount();
  });

  it("恢复期间窗口关闭（onUnmounted）：异步续体中止，不再装配标签", async () => {
    mockStorage["glim-reader-tabs"] = JSON.stringify({
      paths: ["/docs/a.md", "/docs/b.md"],
      activePath: "/docs/a.md",
    });
    // 让读取挂起，模拟恢复进行中用户关闭窗口
    const resolvers: Array<(v: string) => void> = [];
    readTextFileMock.mockImplementation(
      () => new Promise<string>((resolve) => { resolvers.push(resolve); })
    );

    const wrapper = mountApp();
    // 读取已发起但未完成，此时卸载组件（等价于窗口关闭触发 onUnmounted）
    await flushPromises();
    expect(resolvers).toHaveLength(2);
    wrapper.unmount();
    // 全部读取完成后异步续体应检测 appDisposed 并中止装配
    resolvers.forEach((resolve) => resolve("# 迟到内容"));
    await flushPromises();

    // 标签未被装配：恢复中止而非继续写入已销毁实例
    expect(readTextFileMock).toHaveBeenCalledTimes(2);
    const tabs = (wrapper.vm as unknown as { tabs: Array<{ path: string }> }).tabs;
    expect(tabs.length).toBe(0);
  });

  it("关闭帮助/AI 面板后搜索框位置恢复（面板卸载延迟导致的残留偏移修复）", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    let panelEl: HTMLElement | null = null;
    let wrapper: ReturnType<typeof mountApp> | null = null;
    try {
      // 构造一个带宽度的浮动面板元素，模拟面板驻留 DOM（FloatingPanel 关闭后 250ms 才真正卸载）
      panelEl = document.createElement("div");
      panelEl.className = "floating-panel left";
      Object.defineProperty(panelEl, "offsetWidth", { value: 320, configurable: true });
      document.body.appendChild(panelEl);

      wrapper = mountApp();
      await flushPromises();
      const vm = wrapper.vm as unknown as {
        searchOverlayStyle: Record<string, string>;
        floatLayout: { state: { activeLeftPanel: string | null } };
      };

      // 打开帮助面板：搜索框让出面板宽度 40 + 320 + 20 = 380（recalcSearchPosition 由
      // activeLeftPanel 变化触发，与 searchVisible 无关，故此处不必打开搜索框）
      vm.floatLayout.state.activeLeftPanel = "help";
      await vi.advanceTimersByTimeAsync(20); // rAF 重算
      expect(vm.searchOverlayStyle.left).toBe("380px");

      // 关闭面板：此刻面板仍驻留 DOM（250ms 卸载延迟未到），立即重算结果不变——
      // 这正是原缺陷的成因；若无延迟重算，偏移将永久残留
      vm.floatLayout.state.activeLeftPanel = null;
      await vi.advanceTimersByTimeAsync(20);
      expect(vm.searchOverlayStyle.left).toBe("380px");

      // 面板完成卸载（250ms 后），300ms 结算重算应恢复原位 40 + 0 + 20 = 60
      document.body.removeChild(panelEl);
      panelEl = null;
      await vi.advanceTimersByTimeAsync(300);
      expect(vm.searchOverlayStyle.left).toBe("60px");

      wrapper.unmount();
      wrapper = null;
    } finally {
      panelEl?.remove();
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it("快速关闭→再开→再关面板：结算计时以最后一次关闭为起点，偏移仍能恢复", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    let panelEl: HTMLElement | null = null;
    let wrapper: ReturnType<typeof mountApp> | null = null;
    try {
      // 面板驻留 DOM 期间宽度保持 320（真实 FloatingPanel 由 unmountTimer 延迟 250ms 卸载）
      panelEl = document.createElement("div");
      panelEl.className = "floating-panel left";
      Object.defineProperty(panelEl, "offsetWidth", { value: 320, configurable: true });
      document.body.appendChild(panelEl);

      wrapper = mountApp();
      await flushPromises();
      const vm = wrapper.vm as unknown as {
        searchOverlayStyle: Record<string, string>;
        floatLayout: { state: { activeLeftPanel: string | null } };
      };

      // 关 A（t=0，结算计时 300ms）→ 开 B（t=100）→ 关 B（t=200）
      vm.floatLayout.state.activeLeftPanel = "help";
      await vi.advanceTimersByTimeAsync(20);
      expect(vm.searchOverlayStyle.left).toBe("380px");
      vm.floatLayout.state.activeLeftPanel = null; // 关 A
      await vi.advanceTimersByTimeAsync(100);
      vm.floatLayout.state.activeLeftPanel = "ai"; // 开 B
      await vi.advanceTimersByTimeAsync(100);
      vm.floatLayout.state.activeLeftPanel = null; // 关 B：应重置结算计时
      await vi.advanceTimersByTimeAsync(20);
      expect(vm.searchOverlayStyle.left).toBe("380px");

      // 面板真正卸载后，最后一次关闭的 300ms 结算重算恢复原位
      document.body.removeChild(panelEl);
      panelEl = null;
      await vi.advanceTimersByTimeAsync(300);
      expect(vm.searchOverlayStyle.left).toBe("60px");

      wrapper.unmount();
      wrapper = null;
    } finally {
      panelEl?.remove();
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });
});

describe("restoreTabs 并发基准", () => {
  it("8 文件按 4 并发读取：结构性验证并发上限，读取耗时显著低于串行", async () => {
    const paths = Array.from({ length: 8 }, (_, i) => `/docs/f${i}.md`);
    mockStorage["glim-reader-tabs"] = JSON.stringify({
      paths,
      activePath: paths[0],
    });
    const DELAY = 80; // 每次读取模拟耗时（ms）
    let concurrent = 0;
    let maxConcurrent = 0;
    let readsDoneAt = 0;
    let readsCompleted = 0;
    let resolveAllReads!: () => void;
    const allReadsDone = new Promise<void>((resolve) => {
      resolveAllReads = resolve;
    });
    readTextFileMock.mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, DELAY));
      concurrent -= 1;
      readsCompleted += 1;
      if (readsCompleted === paths.length) {
        readsDoneAt = performance.now();
        resolveAllReads();
      }
      return "# 标题\n\n正文内容。";
    });

    const start = performance.now();
    const wrapper = mountApp();
    // 确定性等待：直到全部读取完成，而非固定时长（避免慢机器上误判）
    await allReadsDone;
    await flushPromises();
    const readPhaseMs = readsDoneAt - start;

    expect(readTextFileMock).toHaveBeenCalledTimes(paths.length);
    // 结构性断言：有界并发恰好为 4（串行会一直是 1）——并行读取的确定性证明
    expect(maxConcurrent).toBe(4);
    // 串行需 8×80=640ms；4 并发约 160ms。阈值取串行的 80%，对慢机器留有充分余量
    const serialEstimateMs = paths.length * DELAY;
    expect(readPhaseMs).toBeLessThan(serialEstimateMs * 0.8);
    // 输出基准数据，便于量化启动提速效果
    const speedup = serialEstimateMs / Math.max(readPhaseMs, 1);
    console.log(
      `[benchmark] 8 文件恢复读取阶段 ${readPhaseMs.toFixed(0)}ms（串行估算 ${serialEstimateMs}ms），` +
        `提速约 ${speedup.toFixed(1)}x，最大并发 ${maxConcurrent}`
    );

    wrapper.unmount();
  });
});
