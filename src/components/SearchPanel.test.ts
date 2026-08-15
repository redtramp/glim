/**
 * SearchPanel 组件测试
 *
 * 测试目标:
 * - 基础渲染:visible 开关、输入框聚焦、打开时 query-change 同步
 * - 搜索流程:防抖触发、Enter 立即搜索、无根目录报错、loading/结果/无匹配状态
 * - 结果展示:按文件分组、高亮 mark、点击条目 emit open(path, line)
 * - 并发安全:过期结果丢弃(runSeq 竞态)
 * - 大小写切换:active 类 + 重新搜索
 * - 暴露接口:focusInput 与 query getter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import SearchPanel from "./SearchPanel.vue";
import type { SearchMatch } from "../composables/useGlobalSearch";

vi.mock("../composables/useGlobalSearch", () => ({
  searchInFiles: vi.fn(),
  nextSearchSession: vi.fn(),
}));

import { searchInFiles, nextSearchSession } from "../composables/useGlobalSearch";
const mockedSearchInFiles = vi.mocked(searchInFiles);
const mockedNextSearchSession = vi.mocked(nextSearchSession);

const i18n = createI18n({
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      find: { caseSensitive: "区分大小写", close: "关闭" },
      search: {
        placeholder: "全文搜索",
        openFolderFirst: "请先打开一个文件夹",
        searching: "搜索中…",
        noMatches: "无匹配",
        matches: "处匹配",
        files: "个文件",
        typeToSearch: "输入关键字开始搜索",
      },
    },
  },
});

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

describe("SearchPanel", () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockedSearchInFiles.mockResolvedValue([]);
    mockedNextSearchSession.mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    wrapper?.unmount();
  });

  function mountPanel(opts: { visible?: boolean; rootDir?: string } = {}) {
    wrapper = mount(SearchPanel, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        visible: opts.visible ?? false,
        rootDir: opts.rootDir ?? "/root",
        "onClose": vi.fn(),
        "onOpen": vi.fn(),
        "onQueryChange": vi.fn(),
      },
    });
  }

  async function typeAndRun(text: string) {
    await wrapper.find("input").setValue(text);
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();
  }

  describe("基础渲染", () => {
    it("visible=false 时不渲染面板", () => {
      mountPanel();
      expect(wrapper.find(".search-panel").exists()).toBe(false);
    });

    it("visible=true 时渲染输入框并聚焦", async () => {
      mountPanel({ visible: false });
      await wrapper.setProps({ visible: true });
      await nextTick();
      await flushPromises();
      expect(wrapper.find(".search-panel").exists()).toBe(true);
      expect(document.activeElement).toBe(wrapper.find("input").element);
    });

    it("打开时同步当前查询给父组件", async () => {
      mountPanel();
      await wrapper.setProps({ visible: true });
      await flushPromises();
      expect(wrapper.emitted("query-change")).toBeTruthy();
    });
  });

  describe("搜索流程", () => {
    it("输入触发防抖搜索并 emit query-change", async () => {
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
      expect(wrapper.emitted("query-change")!.at(-1)).toEqual(["hello"]);
    });

    it("连续输入只触发一次防抖搜索", async () => {
      mountPanel({ visible: true });
      const input = wrapper.find("input");
      await input.setValue("a");
      await vi.advanceTimersByTimeAsync(100);
      await input.setValue("ab");
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
      const input = wrapper.find("input");
      await input.setValue("go");
      await input.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);
      expect(mockedSearchInFiles).toHaveBeenCalledWith("/root", "go", false, 500, expect.any(Number));
    });

    it("无根目录时显示错误提示", async () => {
      mountPanel({ visible: true, rootDir: "" });
      await typeAndRun("x");
      expect(wrapper.find(".status .error").exists()).toBe(true);
      expect(wrapper.find(".status .error").text()).toBe("请先打开一个文件夹");
    });

    it("搜索中显示 loading 状态", async () => {
      const d = deferred<SearchMatch[]>();
      mockedSearchInFiles.mockReturnValueOnce(d.promise);
      mountPanel({ visible: true });
      await typeAndRun("slow");
      expect(wrapper.find(".status").text()).toContain("搜索中…");
      d.resolve([]);
      await flushPromises();
    });

    it("无结果时显示无匹配", async () => {
      mountPanel({ visible: true });
      await typeAndRun("nothing");
      expect(wrapper.find(".status").text()).toContain("无匹配");
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
      expect(wrapper.findAll(".group")).toHaveLength(2);
      expect(wrapper.find(".group-title").text()).toBe("a.md");
      expect(wrapper.findAll(".item")).toHaveLength(3);
      expect(wrapper.find(".status").text()).toContain("3");
      expect(wrapper.find(".status").text()).toContain("2");
    });

    it("预览内容高亮匹配关键字", async () => {
      mockedSearchInFiles.mockResolvedValue([makeMatch("a.md", 1, "hello world")]);
      mountPanel({ visible: true });
      await typeAndRun("hello");
      const mark = wrapper.find(".preview mark");
      expect(mark.exists()).toBe(true);
      expect(mark.text()).toBe("hello");
    });

    it("点击条目 emit open(path, line)", async () => {
      mockedSearchInFiles.mockResolvedValue([makeMatch("a.md", 7, "hello")]);
      mountPanel({ visible: true });
      await typeAndRun("hello");
      await wrapper.find(".item").trigger("click");
      expect(wrapper.emitted("open")![0]).toEqual(["/root/a.md", 7]);
    });
  });

  describe("并发安全", () => {
    it("过期搜索结果被丢弃(runSeq 竞态)", async () => {
      const first = deferred<SearchMatch[]>();
      const second = deferred<SearchMatch[]>();
      mockedSearchInFiles.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      mountPanel({ visible: true });

      const input = wrapper.find("input");
      await input.setValue("one");
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();
      expect(mockedSearchInFiles).toHaveBeenCalledTimes(1);

      // 发起第二次搜索后,先完成第二次,再完成第一次
      await input.setValue("two");
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();
      second.resolve([makeMatch("new.md", 1, "two results")]);
      await flushPromises();
      first.resolve([makeMatch("old.md", 1, "one results")]);
      await flushPromises();

      // 只展示第二次的结果,旧结果被丢弃
      expect(wrapper.findAll(".item")).toHaveLength(1);
      expect(wrapper.find(".preview").text()).toContain("two results");
      expect(wrapper.find(".preview").text()).not.toContain("one results");
    });
  });

  describe("大小写切换", () => {
    it("点击切换 caseSensitive 并重新搜索", async () => {
      mountPanel({ visible: true });
      await typeAndRun("Hello");
      const btn = wrapper.findAll(".ic")[0];
      expect(btn.classes()).not.toContain("active");
      await btn.trigger("click");
      await flushPromises();
      expect(btn.classes()).toContain("active");
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
      const input = wrapper.find("input");
      await input.setValue("text");
      (wrapper.vm as any).focusInput();
      expect(document.activeElement).toBe(input.element);
    });

    it("query getter 返回当前查询", async () => {
      mountPanel({ visible: true });
      await wrapper.find("input").setValue("query-x");
      expect((wrapper.vm as any).query).toBe("query-x");
    });
  });
});
