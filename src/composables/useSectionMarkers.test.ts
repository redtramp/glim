/**
 * useSectionMarkers 测试
 *
 * 覆盖:
 * - 无 headings 时 activeId 为空
 * - 有 headings 时 activeId 指向视口内最后一个标题
 * - 标题变化时 activeId 跟随更新
 * - jumpTo 滚动到目标标题并更新 activeId
 * - jumpTo 未知 id / 无视图容器时静默忽略
 * - 滚动事件驱动 activeId 更新
 *
 * 注意: jsdom 中 getBoundingClientRect 恒为 0，
 * 因此所有标题的缓存位置均为 0；真实布局由浏览器集成测试补充。
 */
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";
import { createSubscriber } from "svelte/reactivity";
import { useSectionMarkers } from "./useSectionMarkers.svelte.ts";
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
      subscribe(); // effect 内登记依赖；非 effect 上下文为 no-op
      return current;
    },
    set value(v: T) {
      current = v;
      notify?.();
    },
  };
}

function makeBody(headings: Heading[]): HTMLElement {
  const body = document.createElement("div");
  for (const h of headings) {
    const el = document.createElement("h1");
    el.id = h.id;
    body.appendChild(el);
  }
  return body;
}

function makeViewer(): { el: HTMLElement; scrollTo: ReturnType<typeof vi.fn> } {
  const el = document.createElement("div");
  // jsdom 可能未实现 Element.scrollTo，用自有属性注入 mock
  const scrollTo = vi.fn();
  Object.defineProperty(el, "scrollTo", { value: scrollTo, configurable: true });
  return { el, scrollTo };
}

describe("useSectionMarkers", () => {
  it("无 headings 时 activeId 为空", () => {
    const headings = makeBox<Heading[]>([]);
    const { activeId } = useSectionMarkers(headings, makeBox(null), makeBox(null));
    expect(activeId.value).toBe("");
  });

  it("有 headings 时 activeId 指向视口内最后一个标题", () => {
    const headings = makeBox<Heading[]>([
      { id: "h1", text: "标题1", level: 1 },
      { id: "h2", text: "标题2", level: 2 },
      { id: "h3", text: "标题3", level: 1 },
    ]);
    const body = makeBody(headings.value);
    const { el } = makeViewer();
    const { activeId } = useSectionMarkers(headings, makeBox(el), makeBox(body));
    // jsdom 布局全为 0: 滚动位置 0 时最后一个标题为当前章节
    expect(activeId.value).toBe("h3");
  });

  it("标题元素未就绪（缓存为空）时 activeId 回退到第一个标题", () => {
    const headings = makeBox<Heading[]>([
      { id: "h1", text: "一", level: 1 },
      { id: "h2", text: "二", level: 1 },
    ]);
    // body 存在但不含任何标题元素 → 缓存为空
    const body = document.createElement("div");
    const { activeId } = useSectionMarkers(headings, makeBox(null), makeBox(body));
    expect(activeId.value).toBe("h1");
  });

  it("标题变化后 activeId 跟随更新", () => {
    const headings = makeBox<Heading[]>([{ id: "a", text: "A", level: 1 }]);
    const body = makeBox(makeBody(headings.value));
    const { activeId } = useSectionMarkers(headings, makeBox<HTMLElement | null>(null), body);
    expect(activeId.value).toBe("a");
    flushSync(); // 让 $effect 首次运行并完成订阅

    headings.value = [
      { id: "a", text: "A", level: 1 },
      { id: "b", text: "B", level: 1 },
    ];
    flushSync(); // 触发订阅通知（原 await nextTick）
    expect(activeId.value).toBe("b");
  });

  it("jumpTo 滚动到目标标题并更新 activeId", () => {
    const headings = makeBox<Heading[]>([
      { id: "h1", text: "一", level: 1 },
      { id: "h2", text: "二", level: 1 },
    ]);
    const body = makeBody(headings.value);
    const { el, scrollTo } = makeViewer();
    const { activeId, jumpTo } = useSectionMarkers(
      headings,
      makeBox(el),
      makeBox(body)
    );
    jumpTo("h2");
    expect(activeId.value).toBe("h2");
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0, // jsdom 布局为 0
      behavior: "smooth",
    });
  });

  it("jumpTo 未知 id 时静默忽略", () => {
    const headings = makeBox<Heading[]>([{ id: "h1", text: "一", level: 1 }]);
    const body = makeBody(headings.value);
    const { el, scrollTo } = makeViewer();
    const { jumpTo } = useSectionMarkers(headings, makeBox(el), makeBox(body));
    jumpTo("missing");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("无视图容器时 jumpTo 静默忽略", () => {
    const headings = makeBox<Heading[]>([{ id: "h1", text: "一", level: 1 }]);
    const { jumpTo } = useSectionMarkers(headings, makeBox(null), makeBox(null));
    expect(() => jumpTo("h1")).not.toThrow();
  });

  it("滚动事件驱动 activeId 更新", async () => {
    const headings = makeBox<Heading[]>([
      { id: "h1", text: "一", level: 1 },
      { id: "h2", text: "二", level: 1 },
    ]);
    const body = makeBody(headings.value);
    const { el } = makeViewer();
    const { activeId } = useSectionMarkers(headings, makeBox(el), makeBox(body));
    el.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(activeId.value).toBe("h2");
  });
});
