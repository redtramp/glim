/**
 * SearchPanel 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - 基础渲染:visible 开关、输入框聚焦、打开时 query-change 同步
 * - 搜索流程:防抖触发、Enter 立即搜索、无根目录报错、loading/结果/无匹配状态
 * - 结果展示:按文件分组、高亮 mark、点击条目回调 open(path, line)
 * - 并发安全:过期结果丢弃(runSeq 竞态)
 * - 大小写切换:active 类 + 重新搜索
 * - 暴露接口:focusInput 与 query getter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, type RenderResult } from "@testing-library/svelte";
import SearchPanel from "./SearchPanel.svelte";
import type { SearchMatch } from "../composables/useGlobalSearch";

vi.mock("../composables/useGlobalSearch", () => ({
  searchInFiles: vi.fn(),
  nextSearchSession: vi.fn(),
}));

import { searchInFiles, nextSearchSession } from "../composables/useGlobalSearch";
const mockedSearchInFiles = vi.mocked(searchInFiles);
const mockedNextSearchSession = vi.mocked(nextSearchSession);

// Mock 自研 i18n
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "find.caseSensitive": "区分大小写",
      "find.close": "关闭",
      "search.placeholder": "全文搜索",
      "search.openFolderFirst": "请先打开一个文件夹",
      "search.searching": "搜索中…",
      "search.noMatches": "无匹配",
      "search.matches": "处匹配",
      "search.files": "个文件",
      "search.typeToSearch": "输入关键字开始搜索",
    };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

function makeMatch(rel_path: string, line: number, preview: string): SearchMatch {
  return { path: `/root/${rel_path}`, rel_path, line, column: 1, preview };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 冲刷微任务（假定时器下等价原 flushPromises） */
async function flushPromises(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

type Mock = ReturnType<typeof vi.fn>;
type Rendered = RenderResult<typeof SearchPanel> & {
  onClose: Mock;
  onOpen: Mock;
  onQueryChange: Mock;
};

describe("SearchPanel", () => {
  let rendered: Rendered;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockedSearchInFiles.mockResolvedValue([]);
    mockedNextSearchSession.mockReturnValue(1);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function mountPanel(
    opts: { visible?: boolean; rootDir?: string } = {}
  ): Rendered {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const onQueryChange = vi.fn();
    const result = render(SearchPanel, {
      props: {
        visible: opts.visible ?? false,
        rootDir: opts.rootDir ?? "/root",
        onClose,
        onOpen,
        onQueryChange,
      },
    });
    rendered = { ...result, onClose, onOpen, onQueryChange };
    return rendered;
  }

  function input(): HTMLInputElement {
    return rendered.container.querySelector("input")!;
  }

  async function typeAndRun(text: string) {
    await fireEvent.input(input(), { target: { value: text } });
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();
  }

  describe("基础渲染", () => {
    it("visible=false 时不渲染面板", () => {
      const { container } = mountPanel();
      expect(container.querySelector(".search-panel")).toBeNull();
    });

    it("visible=true 时渲染输入框并聚焦", async () => {
      mountPanel({ visible: false });
      await rendered.rerender({ visible: true });
      await flushPromises();
      expect(rendered.container.querySelector(".search-panel")).not.toBeNull();
      expect(document.activeElement).toBe(input());
    });

    it("打开时同步当前查询给父组件", async () => {
      mountPanel();
      await rendered.rerender({ visible: true });
      await flushPromises();
      expect(rendered.onQueryChange).toHaveBeenCalled();
    });
  });

  describe("搜索流程", () => {
    it("输入触发防抖搜索并回调 query-change", async () => {
      mountPanel({ visible: true });
      await typeAndRun("hello");
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);
      expect(mockedSearchInFiles).toHaveBeenCalledWith(
        "/root",
        "hello",
        false,
        500,
        expect.any(Number)
      );
      expect(rendered.onQueryChange).toHaveBeenLastCalledWith("hello");
    });

    it("连续输入只触发一次防抖搜索", async () => {
      mountPanel({ visible: true });
      await fireEvent.input(input(), { target: { value: "a" } });
      await vi.advanceTimersByTimeAsync(100);
      await fireEvent.input(input(), { target: { value: "ab" } });
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);
      expect(mockedSearchInFiles).toHaveBeenCalledWith(
        "/root",
        "ab",
        false,
        500,
        expect.any(Number)
      );
    });

    it("Enter 立即搜索,不等防抖", async () => {
      mountPanel({ visible: true });
      await fireEvent.input(input(), { target: { value: "go" } });
      await fireEvent.keyDown(input(), { key: "Enter" });
      await flushPromises();
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);
      expect(mockedSearchInFiles).toHaveBeenCalledWith(
        "/root",
        "go",
        false,
        500,
        expect.any(Number)
      );
    });

    it("无根目录时显示错误提示", async () => {
      mountPanel({ visible: true, rootDir: "" });
      await typeAndRun("x");
      const err = rendered.container.querySelector(".status .error");
      expect(err).not.toBeNull();
      expect(err!.textContent).toBe("请先打开一个文件夹");
    });

    it("搜索中显示 loading 状态", async () => {
      const d = deferred<SearchMatch[]>();
      mockedSearchInFiles.mockReturnValueOnce(d.promise);
      mountPanel({ visible: true });
      await typeAndRun("slow");
      expect(
        rendered.container.querySelector(".status")!.textContent
      ).toContain("搜索中…");
      d.resolve([]);
      await flushPromises();
    });

    it("无结果时显示无匹配", async () => {
      mountPanel({ visible: true });
      await typeAndRun("nothing");
      expect(rendered.container.querySelector(".status")!.textContent).toContain(
        "无匹配"
      );
    });
  });

  describe("结果展示", () => {
    it("按文件分组渲染并显示统计", async () => {
      mockedSearchInFiles.mockResolvedValue([
        makeMatch("a.md", 1, "hello world"),
        makeMatch("a.md", 5, "hello again"),
        makeMatch("b.md", 2, "hello there"),
      ]);
      mountPanel({ visible: true });
      await typeAndRun("hello");
      expect(rendered.container.querySelectorAll(".group")).toHaveLength(2);
      expect(rendered.container.querySelector(".group-title")!.textContent).toBe(
        "a.md"
      );
      expect(rendered.container.querySelectorAll(".item")).toHaveLength(3);
      const status = rendered.container.querySelector(".status")!.textContent!;
      expect(status).toContain("3");
      expect(status).toContain("2");
    });

    it("预览内容高亮匹配关键字", async () => {
      mockedSearchInFiles.mockResolvedValue([
        makeMatch("a.md", 1, "hello world"),
      ]);
      mountPanel({ visible: true });
      await typeAndRun("hello");
      const mark = rendered.container.querySelector(".preview mark");
      expect(mark).not.toBeNull();
      expect(mark!.textContent).toBe("hello");
    });

    it("点击条目回调 open(path, line)", async () => {
      mockedSearchInFiles.mockResolvedValue([makeMatch("a.md", 7, "hello")]);
      mountPanel({ visible: true });
      await typeAndRun("hello");
      await fireEvent.click(rendered.container.querySelector(".item")!);
      expect(rendered.onOpen).toHaveBeenCalledWith("/root/a.md", 7);
    });
  });

  describe("并发安全", () => {
    it("过期搜索结果被丢弃(runSeq 竞态)", async () => {
      const first = deferred<SearchMatch[]>();
      const second = deferred<SearchMatch[]>();
      mockedSearchInFiles
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      mountPanel({ visible: true });

      await fireEvent.input(input(), { target: { value: "one" } });
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);

      // 发起第二次搜索后,先完成第二次,再完成第一次
      await fireEvent.input(input(), { target: { value: "two" } });
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();
      second.resolve([makeMatch("new.md", 1, "two results")]);
      await flushPromises();
      first.resolve([makeMatch("old.md", 1, "one results")]);
      await flushPromises();

      // 只展示第二次的结果,旧结果被丢弃
      expect(rendered.container.querySelectorAll(".item")).toHaveLength(1);
      const preview =
        rendered.container.querySelector(".preview")!.textContent!;
      expect(preview).toContain("two results");
      expect(preview).not.toContain("one results");
    });
  });

  describe("大小写切换", () => {
    it("点击切换 caseSensitive 并重新搜索", async () => {
      mountPanel({ visible: true });
      await typeAndRun("Hello");
      const btn = rendered.container.querySelectorAll(".ic")[0];
      expect(btn.classList.contains("active")).toBe(false);
      await fireEvent.click(btn);
      await flushPromises();
      expect(btn.classList.contains("active")).toBe(true);
      expect(mockedSearchInFiles).toHaveBeenCalledWith(
        "/root",
        "Hello",
        true,
        500,
        expect.any(Number)
      );
    });
  });

  describe("暴露接口", () => {
    it("focusInput 聚焦并选中输入框内容", async () => {
      mountPanel({ visible: true });
      await fireEvent.input(input(), { target: { value: "text" } });
      rendered.component.focusInput();
      expect(document.activeElement).toBe(input());
    });

    it("query getter 返回当前查询", async () => {
      mountPanel({ visible: true });
      await fireEvent.input(input(), { target: { value: "query-x" } });
      expect(rendered.component.query).toBe("query-x");
    });
  });
});
