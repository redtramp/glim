import { describe, expect, it } from "vitest";
import {
  WHEEL_TAKEOVER_THRESHOLD,
  createWheelFallback,
  scrollByWheel,
  wheelAtBoundary,
  wheelUnit,
  type WheelLike,
} from "./editorWheel";

/** jsdom 不实现滚动，用最小假 scroller 代替：scrollTop 可写、尺寸固定 */
function fakeScroller(opts: { height?: number; viewport?: number; width?: number; vw?: number } = {}) {
  const el = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: opts.height ?? 3000,
    clientHeight: opts.viewport ?? 1000,
    scrollWidth: opts.width ?? 800,
    clientWidth: opts.vw ?? 800,
  };
  return el as unknown as HTMLElement;
}

function wheel(deltaY: number, deltaMode = 0): WheelLike {
  return { deltaX: 0, deltaY, deltaMode };
}

describe("wheelUnit", () => {
  it("像素单位按 1:1", () => {
    expect(wheelUnit(wheel(10), fakeScroller())).toBe(1);
  });

  it("行单位按 16px", () => {
    expect(wheelUnit(wheel(3, 1), fakeScroller())).toBe(16);
  });

  it("页单位按视口高度", () => {
    expect(wheelUnit(wheel(1, 2), fakeScroller({ viewport: 640 }))).toBe(640);
  });
});

describe("wheelAtBoundary", () => {
  it("顶部向上滚视为边界", () => {
    expect(wheelAtBoundary(wheel(-100), fakeScroller())).toBe(true);
  });

  it("中间位置不算边界", () => {
    const el = fakeScroller();
    el.scrollTop = 500;
    expect(wheelAtBoundary(wheel(100), el)).toBe(false);
  });

  it("底部向下滚视为边界", () => {
    const el = fakeScroller();
    el.scrollTop = 2000;
    expect(wheelAtBoundary(wheel(100), el)).toBe(true);
  });

  it("内容不足一屏时两个方向都是边界", () => {
    const el = fakeScroller({ height: 300, viewport: 1000 });
    expect(wheelAtBoundary(wheel(100), el)).toBe(true);
    expect(wheelAtBoundary(wheel(-100), el)).toBe(true);
  });
});

describe("scrollByWheel", () => {
  it("按 deltaY 滚动并夹在边界内", () => {
    const el = fakeScroller();
    expect(scrollByWheel(wheel(100), el)).toBe(true);
    expect(el.scrollTop).toBe(100);
    expect(scrollByWheel(wheel(99999), el)).toBe(true);
    expect(el.scrollTop).toBe(2000);
    expect(scrollByWheel(wheel(100), el)).toBe(false);
  });

  it("行单位换算成像素", () => {
    const el = fakeScroller();
    scrollByWheel(wheel(2, 1), el);
    expect(el.scrollTop).toBe(32);
  });
});

describe("createWheelFallback", () => {
  it("原生滚动生效（位置随事件变化）时不接管", () => {
    const fb = createWheelFallback();
    const el = fakeScroller();
    for (let i = 0; i < 5; i++) {
      expect(fb.handle(wheel(100), el)).toBe(false);
      el.scrollTop += 100; // 模拟浏览器原生滚动
    }
    expect(fb.takeover).toBe(false);
    expect(el.scrollTop).toBe(500);
  });

  it("连续多次原生未滚动后接管并按 delta 滚动", () => {
    const fb = createWheelFallback();
    const el = fakeScroller();
    const results = [] as boolean[];
    for (let i = 0; i < WHEEL_TAKEOVER_THRESHOLD + 2; i++) results.push(fb.handle(wheel(200), el));
    expect(results.slice(0, WHEEL_TAKEOVER_THRESHOLD).every((r) => r === false)).toBe(true);
    expect(fb.takeover).toBe(true);
    expect(results.at(-1)).toBe(true);
    expect(el.scrollTop).toBe(400);
  });

  it("接管后每个事件都滚动", () => {
    const fb = createWheelFallback();
    const el = fakeScroller();
    for (let i = 0; i < WHEEL_TAKEOVER_THRESHOLD; i++) fb.handle(wheel(50), el);
    const before = el.scrollTop;
    expect(fb.handle(wheel(50), el)).toBe(true);
    expect(el.scrollTop).toBe(before + 50);
  });

  it("在顶部继续往上滚不会误判为原生失效", () => {
    const fb = createWheelFallback();
    const el = fakeScroller();
    for (let i = 0; i < 10; i++) expect(fb.handle(wheel(-100), el)).toBe(false);
    expect(fb.takeover).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("行单位失效时按 16px 换算", () => {
    const fb = createWheelFallback(1);
    const el = fakeScroller();
    expect(fb.handle(wheel(2, 1), el)).toBe(false); // 首个事件仅建立基准
    expect(fb.handle(wheel(2, 1), el)).toBe(true);
    expect(el.scrollTop).toBe(32);
  });

  it("reset 后回到未接管状态", () => {
    const fb = createWheelFallback(1);
    const el = fakeScroller();
    fb.handle(wheel(100), el);
    fb.handle(wheel(100), el);
    expect(fb.takeover).toBe(true);
    fb.reset();
    expect(fb.takeover).toBe(false);
  });
});
