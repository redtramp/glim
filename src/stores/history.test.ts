/**
 * stores/history 测试（补 useHistoryStore.test.ts 未覆盖的分支）
 *
 * 测试目标:
 * - pushRecent: 去重置顶、上限 20、空路径忽略
 * - pushRecentBatch: 空输入忽略、输入去重、反转移入置顶、与既有合并去重、上限 20
 * - clearRecent / saveScroll（空路径忽略、条目结构、超上限淘汰）/ getScroll（number/object/缺失）
 * - useHistory 包装层委托
 */
import { describe, it, expect, beforeEach } from "vitest";
import { historyState, useHistoryStore } from "./history.svelte.ts";
import { useHistory } from "../composables/useHistory";

describe("stores/history", () => {
  beforeEach(() => {
    historyState.recent = [];
    historyState.scrollMap = {};
    localStorage.clear();
  });

  describe("pushRecent", () => {
    it("去重并置顶，记录 basename 与时间戳", () => {
      historyState.pushRecent("/a/one.md");
      historyState.pushRecent("/a/two.md");
      historyState.recent.unshift({ path: "/a/one.md", name: "one.md", ts: 0 });
      historyState.pushRecent("/a/one.md");
      expect(historyState.recent.map((r) => r.path)).toEqual(["/a/one.md", "/a/two.md"]);
      expect(historyState.recent[0].name).toBe("one.md");
      expect(typeof historyState.recent[0].ts).toBe("number");
    });

    it("空路径忽略", () => {
      historyState.pushRecent("");
      expect(historyState.recent).toHaveLength(0);
    });

    it("上限 20 条", () => {
      for (let i = 0; i < 25; i++) historyState.pushRecent(`/f/${i}.md`);
      expect(historyState.recent).toHaveLength(20);
      expect(historyState.recent[0].path).toBe("/f/24.md");
    });
  });

  describe("pushRecentBatch", () => {
    it("空输入忽略", () => {
      historyState.pushRecentBatch([]);
      expect(historyState.recent).toHaveLength(0);
    });

    it("输入去重且反转移入（最后的路径最先展示）", () => {
      historyState.pushRecentBatch(["/a.md", "/b.md", "/a.md"]);
      expect(historyState.recent.map((r) => r.path)).toEqual(["/b.md", "/a.md"]);
      expect(historyState.recent[0].name).toBe("b.md");
    });

    it("与既有记录合并去重，既有重复项移除", () => {
      historyState.pushRecent("/x.md");
      historyState.pushRecent("/y.md");
      historyState.pushRecentBatch(["/x.md", "/z.md"]);
      expect(historyState.recent.map((r) => r.path)).toEqual(["/z.md", "/x.md", "/y.md"]);
    });

    it("空字符串项跳过", () => {
      historyState.pushRecentBatch(["", "/a.md"]);
      expect(historyState.recent.map((r) => r.path)).toEqual(["/a.md"]);
    });

    it("上限 20 条", () => {
      const paths = Array.from({ length: 30 }, (_, i) => `/p/${i}.md`);
      historyState.pushRecentBatch(paths);
      expect(historyState.recent).toHaveLength(20);
      expect(historyState.recent[0].path).toBe("/p/29.md");
    });
  });

  describe("clearRecent", () => {
    it("清空并持久化", () => {
      historyState.pushRecent("/a.md");
      historyState.clearRecent();
      expect(historyState.recent).toHaveLength(0);
    });
  });

  describe("saveScroll / getScroll", () => {
    it("空路径忽略", () => {
      historyState.saveScroll("", 10);
      expect(Object.keys(historyState.scrollMap)).toHaveLength(0);
    });

    it("保存条目并读取 top", () => {
      historyState.saveScroll("/a.md", 123);
      expect(historyState.getScroll("/a.md")).toBe(123);
    });

    it("缺失路径返回 0", () => {
      expect(historyState.getScroll("/nope.md")).toBe(0);
    });

    it("兼容旧格式（number）", () => {
      historyState.scrollMap["/old.md"] = 42;
      expect(historyState.getScroll("/old.md")).toBe(42);
    });

    it("兼容缺 top 的对象条目返回 0", () => {
      historyState.scrollMap["/bad.md"] = { ts: Date.now() } as unknown as number;
      expect(historyState.getScroll("/bad.md")).toBe(0);
    });

    it("条目数超上限 100 时淘汰最旧", () => {
      for (let i = 0; i < 100; i++) {
        historyState.scrollMap[`/f/${i}.md`] = { top: i, ts: i };
      }
      historyState.saveScroll("/f/new.md", 999);
      const keys = Object.keys(historyState.scrollMap);
      expect(keys.length).toBe(100);
      // 最早 ts（0）的条目应被淘汰
      expect(historyState.scrollMap["/f/0.md"]).toBeUndefined();
      expect(historyState.scrollMap["/f/new.md"]).toEqual(expect.objectContaining({ top: 999 }));
    });
  });

  describe("useHistoryStore / useHistory 包装层", () => {
    it("useHistoryStore 返回同一状态", () => {
      expect(useHistoryStore()).toBe(historyState);
    });

    it("useHistory 委托全部方法并暴露 recent", () => {
      const h = useHistory();
      h.pushRecent("/w/a.md");
      expect(h.recent.map((r) => r.path)).toEqual(["/w/a.md"]);
      h.saveScroll("/w/a.md", 5);
      expect(h.getScroll("/w/a.md")).toBe(5);
      h.clearRecent();
      expect(h.recent).toHaveLength(0);
    });
  });
});
