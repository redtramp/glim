/**
 * App.svelte 挂载回归测试
 *
 * 覆盖两类已修复的缺陷：
 * 1. TDZ 崩溃：useSectionMarkers 必须在使用 useTabs() 之后创建。
 *    其构造会同步求值 headings derived，若 activeTab 尚未
 *    初始化将抛出 ReferenceError，导致整个应用启动即崩溃、大纲无法跳转。
 * 2. 多文档恢复：restoreTabs 并行读取、标签顺序稳定、后台标签延迟提取大纲、
 *    监听目录去重（启动变慢的根因）。
 *
 * Vue test-utils → Svelte 5 迁移要点：
 * - shallowMount(分离树 + 子组件打桩) → mount 到悬挂 target（分离树保留
 *   document 隔离；子组件全部真实渲染，故面板状态改经 LeftRail 点击驱动）
 * - wrapper.vm 内部状态断言 → DOM 读取（.search-overlay 样式）/ useTabs 单例
 * - VTU flushPromises → 本地 flushPromises（setImmediate 宏任务 + svelte tick）
 */
// setImmediate 由 Node 运行时提供（jsdom 不覆盖、@types/node 未安装），显式声明
declare function setImmediate(callback: () => void): unknown;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, unmount, tick } from "svelte";
import App from "./App.svelte";
import { useTabs } from "./composables/useTabs.svelte.ts";

// ---- localStorage mock（持久化依赖） ----
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

interface MountedApp {
  target: HTMLElement;
  unmount: () => void;
}

/** 悬挂树挂载：等价旧 shallowMount 的 document 隔离，document.querySelector 只命中测试构造元素 */
function mountApp(): MountedApp {
  const target = document.createElement("div");
  const app = mount(App, { target });
  let done = false;
  return {
    target,
    unmount: () => {
      if (done) return;
      done = true;
      unmount(app);
      target.remove();
    },
  };
}

/** 宏任务排空微任务链 + 刷新 Svelte 渲染（setImmediate 不被假计时器伪造） */
async function flushPromises(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
  await tick();
}

/** 假计时器下的推进：先刷新 Svelte 效果（rAF/结算计时已调度），再推时钟，再刷新 DOM */
async function advance(ms: number): Promise<void> {
  await tick();
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
}

/** 点击 LeftRail 第 index 个按钮（LEFT_PANEL_META 顺序，分隔符非按钮不计入） */
function clickRailBtn(target: HTMLElement, index: number): void {
  const btns = target.querySelectorAll<HTMLButtonElement>(".left-rail-btn");
  btns[index]?.click();
}

/** 搜索浮层 left 内联样式（原 wrapper.vm.searchOverlayStyle.left 的等价 DOM 读取） */
function overlayStyleLeft(target: HTMLElement): string {
  return target.querySelector<HTMLElement>(".search-overlay")?.style.left ?? "";
}

// 顶层 beforeEach：对文件内所有 describe 生效（含下方基准测试），避免 mock 跨用例串扰
beforeEach(() => {
  for (const k in mockStorage) delete mockStorage[k];
  invokeMock.mockReset();
  invokeMock.mockImplementation(defaultInvoke);
  readTextFileMock.mockReset();
  // 标签存储是模块级单例（旧版为每用例新 Pinia 实例）：就地清空保证用例隔离
  const api = useTabs();
  api.tabs.splice(0, api.tabs.length);
  api.activeTabId = "";
});

describe("App.svelte 挂载", () => {
  it("应用可成功挂载（useSectionMarkers 不再触发 TDZ 崩溃）", async () => {
    const m = mountApp();
    await flushPromises();
    expect(m.target.querySelector(".app")).toBeTruthy();
    m.unmount();
  });

  it("多文档恢复：并行读取、顺序稳定、仅激活标签提取大纲、目录监听去重", async () => {
    mockStorage["glim-reader-tabs"] = JSON.stringify({
      paths: ["/docs/a.md", "/docs/b.md", "/docs/c.md"],
      activePath: "/docs/b.md",
    });
    readTextFileMock.mockImplementation(async (p: string | URL) => `# 标题 ${String(p)}\n\n正文内容。`);

    const m = mountApp();
    await flushPromises();

    // 所有持久化文件均被读取（并行）
    expect(readTextFileMock).toHaveBeenCalledTimes(3);

    const tabs = useTabs().tabs;
    expect(tabs.length).toBe(3);
    // 标签按上次会话顺序恢复
    expect(tabs.map((tb) => tb.path)).toEqual(["/docs/a.md", "/docs/b.md", "/docs/c.md"]);
    // 激活标签提取了大纲
    expect(tabs[1].headings.length).toBeGreaterThan(0);
    // 后台标签延迟提取（激活时才补，显著加快多文档启动）
    expect(tabs[0].headings.length).toBe(0);
    expect(tabs[2].headings.length).toBe(0);

    // Task 9 遗留「root 导出契约」收口：MarkdownView 导出的 root（article.markdown-body）
    // 由 App 的 bind:this 取实例后读 markdownState.root，渲染内容须落在 .viewer 容器内
    expect(m.target.querySelector(".viewer article.markdown-body")).toBeTruthy();

    // 同一目录 /docs 只注册一次 watch_path（去重）。
    // 恢复期间 watcher 尚未启动（watchFile 直接跳过），启动后 startWatching 统一注册一次；
    // 若无去重，恢复阶段会按文件数发出 N 次 IPC。
    const watchPathCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "watch_path");
    expect(watchPathCalls).toHaveLength(1);

    m.unmount();
  });

  it("恢复期间窗口关闭（onDestroy）：异步续体中止，不再装配标签", async () => {
    mockStorage["glim-reader-tabs"] = JSON.stringify({
      paths: ["/docs/a.md", "/docs/b.md"],
      activePath: "/docs/a.md",
    });
    // 让读取挂起，模拟恢复进行中用户关闭窗口
    const resolvers: Array<(v: string) => void> = [];
    readTextFileMock.mockImplementation(
      () => new Promise<string>((resolve) => { resolvers.push(resolve); })
    );

    const m = mountApp();
    // 读取已发起但未完成，此时卸载组件（等价于窗口关闭触发 onDestroy）
    await flushPromises();
    expect(resolvers).toHaveLength(2);
    m.unmount();
    // 全部读取完成后异步续体应检测 appDisposed 并中止装配
    resolvers.forEach((resolve) => resolve("# 迟到内容"));
    await flushPromises();

    // 标签未被装配：恢复中止而非继续写入已销毁实例
    expect(readTextFileMock).toHaveBeenCalledTimes(2);
    expect(useTabs().tabs.length).toBe(0);
  });

  it("关闭帮助/AI 面板后搜索框位置恢复（面板卸载延迟导致的残留偏移修复）", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    let panelEl: HTMLElement | null = null;
    let m: MountedApp | null = null;
    try {
      // 构造一个带宽度的浮动面板元素，模拟面板驻留 DOM（FloatingPanel 关闭后 250ms 才真正卸载）
      panelEl = document.createElement("div");
      panelEl.className = "floating-panel left";
      Object.defineProperty(panelEl, "offsetWidth", { value: 320, configurable: true });
      document.body.appendChild(panelEl);

      m = mountApp();
      await flushPromises();

      // 打开帮助面板（LeftRail 第 13 个按钮）：搜索框让出面板宽度 40 + 320 + 20 = 380
      // （recalcSearchPosition 由 activeLeftPanel 变化触发，与 searchVisible 无关）
      clickRailBtn(m.target, 12);
      await advance(20); // rAF 重算
      expect(overlayStyleLeft(m.target)).toBe("380px");

      // 关闭面板：此刻面板仍驻留 DOM（250ms 卸载延迟未到），立即重算结果不变——
      // 这正是原缺陷的成因；若无延迟重算，偏移将永久残留
      clickRailBtn(m.target, 12);
      await advance(20);
      expect(overlayStyleLeft(m.target)).toBe("380px");

      // 面板完成卸载（250ms 后），300ms 结算重算应恢复原位 40 + 0 + 20 = 60
      document.body.removeChild(panelEl);
      panelEl = null;
      await advance(300);
      expect(overlayStyleLeft(m.target)).toBe("60px");

      m.unmount();
      m = null;
    } finally {
      panelEl?.remove();
      m?.unmount();
      vi.useRealTimers();
    }
  });

  it("快速关闭→再开→再关面板：结算计时以最后一次关闭为起点，偏移仍能恢复", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    let panelEl: HTMLElement | null = null;
    let m: MountedApp | null = null;
    try {
      // 面板驻留 DOM 期间宽度保持 320（真实 FloatingPanel 由 unmountTimer 延迟 250ms 卸载）
      panelEl = document.createElement("div");
      panelEl.className = "floating-panel left";
      Object.defineProperty(panelEl, "offsetWidth", { value: 320, configurable: true });
      document.body.appendChild(panelEl);

      m = mountApp();
      await flushPromises();

      // 关 A（结算计时 300ms）→ 开 B → 关 B：应重置结算计时
      clickRailBtn(m.target, 12); // 开 help
      await advance(20);
      expect(overlayStyleLeft(m.target)).toBe("380px");
      clickRailBtn(m.target, 12); // 关 help（A）
      await advance(100);
      clickRailBtn(m.target, 10); // 开 ai（B）
      await advance(100);
      clickRailBtn(m.target, 10); // 关 ai（B）：重置结算计时
      await advance(20);
      expect(overlayStyleLeft(m.target)).toBe("380px");

      // 面板真正卸载后，最后一次关闭的 300ms 结算重算恢复原位
      document.body.removeChild(panelEl);
      panelEl = null;
      await advance(300);
      expect(overlayStyleLeft(m.target)).toBe("60px");

      m.unmount();
      m = null;
    } finally {
      panelEl?.remove();
      m?.unmount();
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
    const m = mountApp();
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

    m.unmount();
  });
});
