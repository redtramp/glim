/**
 * useSectionMarkers 测试
 *
 * 测试目标:
 * - 初始状态: 无 headings 时 markers 为空
 * - 有 headings 时生成对应标记点
 * - 书签管理（add/remove/get/clear）
 * - 标题变化时重建标记点
 *
 * 注意: scroll 联动测试需要 getBoundingClientRect 精确模拟，
 * 在 jsdom 环境中暂不覆盖，由浏览器集成测试补充。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { useSectionMarkers } from "./useSectionMarkers";
import type { Heading } from "./useMarkdown";

// Mock localStorage for jsdom
let store: Record<string, string> = {};
beforeEach(() => {
  store = {};
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    },
    writable: true,
    configurable: true,
  });
});

describe("useSectionMarkers", () => {
  it("无 headings 时 markers 为空", () => {
    const headings = ref<Heading[]>([]);
    const { markers, activeId } = useSectionMarkers(
      headings,
      ref(null),
      ref(null)
    );
    expect(markers.value).toHaveLength(0);
    expect(activeId.value).toBe("");
  });

  it("有 headings 时生成对应数量的标记点", () => {
    const headings = ref<Heading[]>([
      { id: "h1", text: "标题1", level: 1 },
      { id: "h2", text: "标题2", level: 2 },
      { id: "h3", text: "标题3", level: 1 },
    ]);
    const { markers } = useSectionMarkers(headings, ref(null), ref(null));
    expect(markers.value).toHaveLength(3);
  });

  it("标题变化时重建标记点", async () => {
    const headings = ref<Heading[]>([]);
    const { markers } = useSectionMarkers(headings, ref(null), ref(null));
    expect(markers.value).toHaveLength(0);

    headings.value = [
      { id: "h1", text: "标题1", level: 1 },
      { id: "h2", text: "标题2", level: 2 },
    ];
    await nextTick();
    expect(markers.value).toHaveLength(2);
    expect(markers.value[0].id).toBe("h1");
    expect(markers.value[1].id).toBe("h2");
  });

  it("标记点包含正确的属性", () => {
    const headings = ref<Heading[]>([
      { id: "intro", text: "引言", level: 1 },
    ]);
    const { markers } = useSectionMarkers(headings, ref(null), ref(null));

    expect(markers.value[0]).toMatchObject({
      id: "intro",
      text: "引言",
      level: 1,
      isBookmark: false,
    });
    expect(typeof markers.value[0].scrollTop).toBe("number");
    expect(["past", "current", "future"]).toContain(markers.value[0].state);
  });

  describe("书签管理", () => {
    it("addBookmark 添加书签后标记点增加", () => {
      const headings = ref<Heading[]>([
        { id: "h1", text: "标题1", level: 1 },
      ]);
      const { markers, addBookmark } = useSectionMarkers(
        headings,
        ref(null),
        ref(null)
      );

      const before = markers.value.length;
      addBookmark(100, "重要位置");
      expect(markers.value.length).toBe(before + 1);
      expect(markers.value[markers.value.length - 1].isBookmark).toBe(true);
    });

    it("removeBookmark 删除书签后标记点减少", () => {
      const headings = ref<Heading[]>([
        { id: "h1", text: "标题1", level: 1 },
      ]);
      const { markers, addBookmark, removeBookmark, getBookmarks } = useSectionMarkers(
        headings,
        ref(null),
        ref(null)
      );

      const before = markers.value.filter((m) => m.isBookmark).length;
      addBookmark(100, "测试");
      expect(markers.value.filter((m) => m.isBookmark).length).toBe(before + 1);

      const bmList = getBookmarks();
      expect(bmList).toHaveLength(1);
      removeBookmark(bmList[0].id);
      expect(markers.value.filter((m) => m.isBookmark).length).toBe(before);
    });

    it("getBookmarks 返回所有书签", () => {
      const headings = ref<Heading[]>([]);
      const { getBookmarks, addBookmark } = useSectionMarkers(
        headings,
        ref(null),
        ref(null)
      );

      addBookmark(100, "位置A");
      addBookmark(200, "位置B");
      const list = getBookmarks();
      expect(list).toHaveLength(2);
      expect(list[0].label).toBe("位置A");
      expect(list[1].label).toBe("位置B");
    });

    it("clearBookmarks 清除所有书签", () => {
      const headings = ref<Heading[]>([]);
      const { getBookmarks, addBookmark, clearBookmarks } = useSectionMarkers(
        headings,
        ref(null),
        ref(null)
      );

      addBookmark(100, "位置A");
      addBookmark(200, "位置B");
      expect(getBookmarks()).toHaveLength(2);
      clearBookmarks();
      expect(getBookmarks()).toHaveLength(0);
    });
  });
});