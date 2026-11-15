/**
 * useSectionMarkers 测试（阶段二：CM6 行位置体系）
 *
 * 单一视图下不再有 markdown-it 渲染 DOM 的 [id] 标题元素，改为 Heading.line
 * + LinePositionSource 换算。用假位置源驱动，可精确验证行号→滚动位置映射，
 * 不再依赖 jsdom 恒为 0 的 getBoundingClientRect。
 *
 * 覆盖：
 * - 无 headings / 无位置源时 activeId 回退行为
 * - 滚动到不同行时 activeId 指向视口内最后一个标题
 * - 标题变化 / 位置源就绪后 activeId 与缓存重建
 * - jumpTo 滚动到目标行并更新 activeId；未知 id / 无容器静默忽略
 * - 滚动事件驱动 activeId 更新
 */
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";
import { createSubscriber } from "svelte/reactivity";
import {
  useSectionMarkers,
  type LinePositionSource,
} from "./useSectionMarkers.svelte.ts";
import type { Heading } from "./useMarkdown";

/** 测试侧响应式 box（.test.ts 不走 svelte 编译器，不能用 $state rune） */
function makeBox<T>(initial: T): { value: T } {
  let current = initial;
  let notify: (() => void) | null = null;
  const subscribe = createSubscriber((update) => {
    notify = update;
    return () => {
      notify = null;
    };
  });
  return {
    get value() {
      subscribe();
      return current;
    },
    set value(v: T) {
      current = v;
      notify?.();
    },
  };
}

/** 每行固定 20px 的假位置源：line1→top0, line2→top20, line5→top80 ... */
const LINE_HEIGHT = 20;
function fakeSource(): LinePositionSource {
  return {
    lineTop: (line: number) =>
      line >= 1 && line <= 500 ? (line - 1) * LINE_HEIGHT : null,
    lineAtTop: (top: number) => Math.floor(Math.max(0, top) / LINE_HEIGHT) + 1,
  };
}

function heading(id: string, line: number): Heading {
  return { id, text: id, level: 1, line };
}

function makeViewer(scrollTop = 0): {
  el: HTMLElement;
  scrollTo: ReturnType<typeof vi.fn>;
} {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  const scrollTo = vi.fn();
  Object.defineProperty(el, "scrollTo", { value: scrollTo, configurable: true });
  return { el, scrollTo };
}

describe("useSectionMarkers（CM6 行位置体系）", () => {
  it("无 headings 时 activeId 为空", () => {
    const { activeId } = useSectionMarkers(
      makeBox<Heading[]>([]),
      makeBox(null),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(activeId.value).toBe("");
  });

  it("无位置源时回退到第一个标题（视图尚未就绪）", () => {
    const headings = makeBox<Heading[]>([heading("h1", 1), heading("h2", 5)]);
    const { activeId } = useSectionMarkers(
      headings,
      makeBox(null),
      makeBox<LinePositionSource | null>(null),
    );
    expect(activeId.value).toBe("h1");
  });

  it("滚动位置决定当前章节：top=0 → 行 1 的标题", () => {
    const headings = makeBox<Heading[]>([
      heading("h1", 1),
      heading("h2", 5),
      heading("h3", 10),
    ]);
    const { el } = makeViewer(0);
    const { activeId, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(activeId.value).toBe("h1");
    dispose();
  });

  it("滚动位置决定当前章节：top=100 → 行 6，最后一个 ≤6 的标题是 h2", () => {
    const headings = makeBox<Heading[]>([
      heading("h1", 1),
      heading("h2", 5),
      heading("h3", 10),
    ]);
    const { el } = makeViewer(100); // lineAtTop(100)=6
    const { activeId, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(activeId.value).toBe("h2");
    dispose();
  });

  it("标题变化后 activeId 跟随更新", () => {
    const headings = makeBox<Heading[]>([heading("a", 1)]);
    const { el } = makeViewer(0);
    const { activeId, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(activeId.value).toBe("a");
    flushSync();

    headings.value = [heading("a", 1), heading("b", 1)];
    flushSync();
    expect(activeId.value).toBe("b");
    dispose();
  });

  it("位置源从 null 就绪后重算（编辑器异步加载完成）", () => {
    const headings = makeBox<Heading[]>([heading("h1", 1), heading("h2", 5)]);
    const { el } = makeViewer(100);
    const source = makeBox<LinePositionSource | null>(null);
    const { activeId, dispose } = useSectionMarkers(headings, makeBox(el), source);
    expect(activeId.value).toBe("h1"); // 未就绪回退
    flushSync();
    source.value = fakeSource();
    flushSync();
    expect(activeId.value).toBe("h2"); // 就绪后按真实行号
    dispose();
  });

  it("jumpTo 滚动到目标行的绝对 top 并更新 activeId", () => {
    const headings = makeBox<Heading[]>([heading("h1", 1), heading("h2", 5)]);
    const { el, scrollTo } = makeViewer(0);
    const { activeId, jumpTo, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    jumpTo("h2");
    expect(activeId.value).toBe("h2");
    // line5 → top 80，减 SCROLL_OFFSET(16) = 64
    expect(scrollTo).toHaveBeenCalledWith({ top: 64, behavior: "smooth" });
    dispose();
  });

  it("jumpTo 未知 id 静默忽略", () => {
    const headings = makeBox<Heading[]>([heading("h1", 1)]);
    const { el, scrollTo } = makeViewer(0);
    const { jumpTo, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    jumpTo("missing");
    expect(scrollTo).not.toHaveBeenCalled();
    dispose();
  });

  it("无视图容器时 jumpTo 静默忽略", () => {
    const headings = makeBox<Heading[]>([heading("h1", 1)]);
    const { jumpTo, dispose } = useSectionMarkers(
      headings,
      makeBox(null),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(() => jumpTo("h1")).not.toThrow();
    dispose();
  });

  it("滚动事件驱动 activeId 更新", async () => {
    const headings = makeBox<Heading[]>([heading("h1", 1), heading("h2", 5)]);
    const { el } = makeViewer(0);
    const { activeId, dispose } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox<LinePositionSource | null>(fakeSource()),
    );
    expect(activeId.value).toBe("h1");
    el.scrollTop = 100; // 行 6
    el.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(activeId.value).toBe("h2");
    dispose();
  });
});
