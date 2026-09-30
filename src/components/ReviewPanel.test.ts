/**
 * ReviewPanel 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 覆盖:列表渲染(类型/内容/行号)、空态、逐条接受/拒绝回调、
 * 全部接受/拒绝回调、点击条目 focus、关闭。
 * 组件为纯展示+事件,决策逻辑在 App 侧(由 criticMarkup.test.ts 覆盖)。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ReviewPanel from "./ReviewPanel.svelte";

// Mock 自研 i18n(count 带 {n} 插值)
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "review.title": "审阅批注",
      "review.accept": "接受",
      "review.reject": "拒绝",
      "review.acceptAll": "全部接受",
      "review.rejectAll": "全部拒绝",
      "review.empty": "文档中没有批注",
      "review.count": "{n} 条批注",
      "review.typeDel": "删除",
      "review.typeIns": "新增",
      "review.typeSub": "替换",
      "review.typeHl": "高亮",
      "review.typeComment": "评论",
    };
    let text = map[key] ?? key;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (m, k) =>
        k in params ? String(params[k]) : m
      );
    }
    return text;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

function mountPanel(
  props: { visible?: boolean; source?: string; fileName?: string } = {}
) {
  const onApply = vi.fn();
  const onApplyAll = vi.fn();
  const onFocus = vi.fn();
  const onClose = vi.fn();
  const result = render(ReviewPanel, {
    props: {
      visible: props.visible ?? true,
      source: props.source ?? "",
      fileName: props.fileName ?? "test.md",
      onApply,
      onApplyAll,
      onFocus,
      onClose,
    },
  });
  return { ...result, onApply, onApplyAll, onFocus, onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewPanel - 渲染", () => {
  it("visible=false 时不渲染", () => {
    const { container } = mountPanel({ visible: false });
    expect(container.querySelector(".rv-overlay")).toBeNull();
  });

  it("空源显示空态文案", () => {
    const { container } = mountPanel();
    expect(container.querySelector(".rv-empty")).not.toBeNull();
    expect(container.querySelector(".rv-item")).toBeNull();
  });

  it("五种批注类型均渲染为条目", () => {
    const { container } = mountPanel({
      source: "a{--del--}b{++ins++}c{~~old~>new~~}d{==hl==}e{>>cmt<<}f",
    });
    const items = container.querySelectorAll(".rv-item");
    expect(items).toHaveLength(5);
    const labels = Array.from(items).map(
      (i) => i.querySelector(".rv-type")!.textContent
    );
    expect(labels).toEqual(["删除", "新增", "替换", "高亮", "评论"]);
  });

  it("删除批注显示删除线旧文本,无新文本", () => {
    const { container } = mountPanel({ source: "a{--bad--}b" });
    expect(container.querySelector(".rv-old")!.textContent).toBe("bad");
    expect(container.querySelector(".rv-new")).toBeNull();
  });

  it("替换批注同时显示旧→新", () => {
    const { container } = mountPanel({ source: "x{~~old~>new~~}y" });
    expect(container.querySelector(".rv-old")!.textContent).toBe("old");
    expect(container.querySelector(".rv-new")!.textContent).toBe("new");
    expect(container.querySelector(".rv-arrow")).not.toBeNull();
  });

  it("行号显示 1-based 起始行", () => {
    const { container } = mountPanel({ source: "line1\nline2{==x==}" });
    expect(container.querySelector(".rv-line")!.textContent).toBe("L2");
  });

  it("计数显示批注条数", () => {
    const { container } = mountPanel({ source: "a{--x--}b{++y++}c" });
    expect(container.querySelector(".rv-count")!.textContent).toBe("2 条批注");
  });
});

describe("ReviewPanel - 事件", () => {
  function mountSample() {
    return mountPanel({ source: "a{--x--}b{++y++}c" });
  }

  it("点击接受按钮回调 apply('accept', id)", async () => {
    const w = mountSample();
    await fireEvent.click(
      w.container.querySelector('[data-action="accept-0"]')!
    );
    expect(w.onApply).toHaveBeenCalledWith("accept", 0);
  });

  it("点击拒绝按钮回调 apply('reject', id)", async () => {
    const w = mountSample();
    await fireEvent.click(
      w.container.querySelector('[data-action="reject-1"]')!
    );
    expect(w.onApply).toHaveBeenCalledWith("reject", 1);
  });

  it("点击条目回调 focus(id)", async () => {
    const w = mountSample();
    await fireEvent.click(w.container.querySelectorAll(".rv-item")[1]);
    expect(w.onFocus).toHaveBeenCalledWith(1);
  });

  it("点击条目内按钮不触发 focus(事件冒泡被阻止)", async () => {
    const w = mountSample();
    await fireEvent.click(
      w.container.querySelector('[data-action="accept-0"]')!
    );
    expect(w.onFocus).not.toHaveBeenCalled();
  });

  it("全部接受回调 apply-all('accept')", async () => {
    const w = mountSample();
    await fireEvent.click(
      w.container.querySelector('[data-action="accept-all"]')!
    );
    expect(w.onApplyAll).toHaveBeenCalledWith("accept");
  });

  it("全部拒绝回调 apply-all('reject')", async () => {
    const w = mountSample();
    await fireEvent.click(
      w.container.querySelector('[data-action="reject-all"]')!
    );
    expect(w.onApplyAll).toHaveBeenCalledWith("reject");
  });

  it("关闭按钮回调 close", async () => {
    const w = mountSample();
    await fireEvent.click(w.container.querySelector('[data-action="close"]')!);
    expect(w.onClose).toHaveBeenCalled();
  });

  it("点击遮罩回调 close", async () => {
    const w = mountSample();
    await fireEvent.click(w.container.querySelector(".rv-overlay")!);
    expect(w.onClose).toHaveBeenCalled();
  });
});
