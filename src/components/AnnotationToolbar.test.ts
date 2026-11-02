/**
 * AnnotationToolbar 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 覆盖:渲染/隐藏、按钮回调、输入弹层交互(确认/取消/Enter/Esc)、
 * 视口边缘夹紧与翻转(computeToolbarPosition 纯函数)。
 *
 * 迁移要点:
 * - defineEmits(apply/input-start/cancel/copy-ai/copy/paste/clear-all/review/ai)
 *   → 回调 props(onApply/onInputStart/onCancel/onCopyAi/onCopy/onPaste/onClearAll/onReview/onAi)
 * - AnnotationToolbarMode 类型仍从组件导出（env.d.ts 兜底条随之删除）
 * - wrapper.setProps → rerender；setValue → fireEvent.input；keydown.enter/esc → keyDown
 * - vue-i18n 实例 → mock 自研 i18n(locale.svelte.ts)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, type RenderResult } from "@testing-library/svelte";
import { tick } from "svelte";
import AnnotationToolbar, {
  type AnnotationToolbarMode,
} from "./AnnotationToolbar.svelte";
import { computeToolbarPosition } from "../composables/toolbarPosition";

// Mock 自研 i18n（原 vue-i18n 实例的等价迁移，文案沿用原测试）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "annotation.groupClipboard": "剪贴板",
      "annotation.groupAI": "AI",
      "annotation.groupAnnotations": "批注",
      "annotation.del": "删除",
      "annotation.ins": "新增",
      "annotation.sub": "替换",
      "annotation.hl": "高亮",
      "annotation.comment": "评论",
      "annotation.copyAI": "复制给 AI",
      "annotation.copyPlain": "复制",
      "annotation.paste": "粘贴",
      "annotation.clearAll": "清除全部",
      "annotation.review": "审阅",
      "annotation.inputPlaceholder": "输入内容…",
      "annotation.subPlaceholder": "替换为…",
      "annotation.commentPlaceholder": "评论内容…",
      "annotation.confirm": "确定",
      "annotation.cancel": "取消",
      "ai.title": "AI 助手",
    };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

type Mock = ReturnType<typeof vi.fn>;
type Rendered = RenderResult<typeof AnnotationToolbar> & {
  onApply: Mock;
  onInputStart: Mock;
  onCancel: Mock;
  onCopyAi: Mock;
  onCopy: Mock;
  onPaste: Mock;
  onClearAll: Mock;
  onReview: Mock;
  onAi: Mock;
};

function mountToolbar(
  props: {
    visible?: boolean;
    x?: number;
    y?: number;
    mode?: AnnotationToolbarMode;
  } = {}
): Rendered {
  const onApply = vi.fn();
  const onInputStart = vi.fn();
  const onCancel = vi.fn();
  const onCopyAi = vi.fn();
  const onCopy = vi.fn();
  const onPaste = vi.fn();
  const onClearAll = vi.fn();
  const onReview = vi.fn();
  const onAi = vi.fn();
  const result = render(AnnotationToolbar, {
    props: {
      visible: props.visible ?? true,
      x: props.x ?? 100,
      y: props.y ?? 200,
      mode: props.mode ?? "",
      onApply,
      onInputStart,
      onCancel,
      onCopyAi,
      onCopy,
      onPaste,
      onClearAll,
      onReview,
      onAi,
    },
  });
  return {
    ...result,
    onApply,
    onInputStart,
    onCancel,
    onCopyAi,
    onCopy,
    onPaste,
    onClearAll,
    onReview,
    onAi,
  };
}

/** flush 异步定位/聚焦链（effect 内 await tick） */
async function flushLayout(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

describe("AnnotationToolbar - 渲染", () => {
  afterEach(() => cleanup());

  it("visible=true 时渲染五个批注按钮与复制/粘贴/复制给AI/清除/审阅/AI", () => {
    const { container } = mountToolbar();
    expect(container.querySelectorAll("button").length).toBe(11);
    expect(container.querySelector(".at-del")).not.toBeNull();
    expect(container.querySelector(".at-ins")).not.toBeNull();
    expect(container.querySelector(".at-sub")).not.toBeNull();
    expect(container.querySelector(".at-hl")).not.toBeNull();
    expect(container.querySelector(".at-comment")).not.toBeNull();
    expect(container.querySelector(".at-copy")).not.toBeNull();
    expect(container.querySelector(".at-clear")).not.toBeNull();
    expect(container.querySelector(".at-review")).not.toBeNull();
    expect(container.querySelector(".at-ai")).not.toBeNull();
    expect(container.querySelector(".at-sep")).not.toBeNull();
  });

  it("visible=false 时不渲染工具栏", () => {
    const { container } = mountToolbar({ visible: false });
    expect(container.querySelector(".annotation-toolbar")).toBeNull();
  });

  it("三带结构:剪贴板/AI/批注各一行,组名标签存在", () => {
    const { container } = mountToolbar();
    const bands = container.querySelectorAll(".at-band");
    expect(bands.length).toBe(3);
    const labels = Array.from(container.querySelectorAll(".at-band-label")).map(
      (n) => n.textContent
    );
    expect(labels).toEqual(["剪贴板", "AI", "批注"]);
    // 第一带:复制/粘贴;第二带:AI;第三带:批注全量
    expect(bands[0].querySelector(".at-copy-plain")).not.toBeNull();
    expect(bands[0].querySelector(".at-paste")).not.toBeNull();
    expect(bands[1].querySelector(".at-ai")).not.toBeNull();
    expect(bands[2].querySelector(".at-del")).not.toBeNull();
    expect(bands[2].querySelector(".at-copy")).not.toBeNull();
    expect(bands[2].querySelector(".at-review")).not.toBeNull();
  });
});

describe("AnnotationToolbar - 按钮回调", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("点击删除立即回调 onApply('del')", async () => {
    const { container, onApply } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-del")!);
    expect(onApply.mock.calls[0]).toEqual(["del"]);
  });

  it("点击高亮立即回调 onApply('hl')", async () => {
    const { container, onApply } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-hl")!);
    expect(onApply.mock.calls[0]).toEqual(["hl"]);
  });

  it("点击新增回调 onInputStart('ins') 而非直接 apply", async () => {
    const { container, onApply, onInputStart } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-ins")!);
    expect(onInputStart.mock.calls[0]).toEqual(["ins"]);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("点击复制纯文本回调 onCopy", async () => {
    const { container, onCopy } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-copy-plain")!);
    expect(onCopy).toHaveBeenCalled();
  });

  it("点击粘贴回调 onPaste", async () => {
    const { container, onPaste } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-paste")!);
    expect(onPaste).toHaveBeenCalled();
  });

  it("点击替换回调 onInputStart('sub')", async () => {
    const { container, onInputStart } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-sub")!);
    expect(onInputStart.mock.calls[0]).toEqual(["sub"]);
  });

  it("点击评论回调 onInputStart('comment')", async () => {
    const { container, onInputStart } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-comment")!);
    expect(onInputStart.mock.calls[0]).toEqual(["comment"]);
  });

  it("点击复制给 AI 回调 onCopyAi", async () => {
    const { container, onCopyAi } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-copy")!);
    expect(onCopyAi).toHaveBeenCalled();
  });

  it("点击清除全部回调 onClearAll", async () => {
    const { container, onClearAll } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-clear")!);
    expect(onClearAll).toHaveBeenCalled();
  });

  it("点击审阅回调 onReview", async () => {
    const { container, onReview } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-review")!);
    expect(onReview).toHaveBeenCalled();
  });

  it("点击 AI 回调 onAi", async () => {
    const { container, onAi } = mountToolbar();
    await fireEvent.click(container.querySelector(".at-ai")!);
    expect(onAi).toHaveBeenCalled();
  });
});

describe("AnnotationToolbar - 输入弹层", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("mode='ins' 时显示输入框与确定/取消,隐藏批注按钮", async () => {
    const { container } = mountToolbar({ mode: "ins" });
    await tick();
    expect(container.querySelector(".at-input")).not.toBeNull();
    expect(container.querySelector(".at-del")).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(2);
  });

  it("输入内容后点击确定回调 onApply('ins', 文本)", async () => {
    const { container, onApply } = mountToolbar({ mode: "ins" });
    await tick();
    await fireEvent.input(container.querySelector(".at-input")!, {
      target: { value: "新增内容" },
    });
    await fireEvent.click(container.querySelector(".at-confirm")!);
    expect(onApply.mock.calls[0]).toEqual(["ins", "新增内容"]);
  });

  it("输入为空白时确定按钮禁用", async () => {
    const { container } = mountToolbar({ mode: "comment" });
    await tick();
    expect(
      container.querySelector(".at-confirm")!.hasAttribute("disabled")
    ).toBe(true);
  });

  it("点击取消回调 onCancel", async () => {
    const { container, onCancel } = mountToolbar({ mode: "sub" });
    await tick();
    await fireEvent.click(
      container.querySelector("button.at-btn:not(.at-confirm)")!
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it("Enter 确认,Esc 取消", async () => {
    const first = mountToolbar({ mode: "ins" });
    await tick();
    await fireEvent.input(first.container.querySelector(".at-input")!, {
      target: { value: "x" },
    });
    await fireEvent.keyDown(first.container.querySelector(".at-input")!, {
      key: "Enter",
    });
    expect(first.onApply.mock.calls[0]).toEqual(["ins", "x"]);

    cleanup();
    const second = mountToolbar({ mode: "comment" });
    await tick();
    await fireEvent.keyDown(second.container.querySelector(".at-input")!, {
      key: "Escape",
    });
    expect(second.onCancel).toHaveBeenCalled();
  });

  it("替换使用替换专用占位符", async () => {
    const { container } = mountToolbar({ mode: "sub" });
    await tick();
    expect(container.querySelector(".at-input")!.getAttribute("placeholder")).toBe(
      "替换为…"
    );
  });

  it("评论使用评论专用占位符", async () => {
    const { container } = mountToolbar({ mode: "comment" });
    await tick();
    expect(container.querySelector(".at-input")!.getAttribute("placeholder")).toBe(
      "评论内容…"
    );
  });

  it("输入为空白时 Enter 确认不发 apply", async () => {
    const { container, onApply } = mountToolbar({ mode: "ins" });
    await tick();
    await fireEvent.keyDown(container.querySelector(".at-input")!, {
      key: "Enter",
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("输入弹层模式下输入框获得焦点", async () => {
    const focusSpy = vi
      .spyOn(HTMLInputElement.prototype, "focus")
      .mockImplementation(() => {});
    try {
      const { rerender } = mountToolbar({ mode: "" });
      await rerender({ mode: "ins" });
      await flushLayout();
      expect(focusSpy).toHaveBeenCalled();
    } finally {
      focusSpy.mockRestore();
    }
  });

  it("坐标变化时重新定位工具栏", async () => {
    const { container, rerender } = mountToolbar({ x: 100, y: 200 });
    await rerender({ x: 300, y: 250 });
    // reposition 在异步 effect 中执行,需 flush microtask/tick 链
    await flushLayout();
    const style = container
      .querySelector(".annotation-toolbar")!
      .getAttribute("style");
    // jsdom 中工具栏 getBoundingClientRect 为 0:left=x,top=y+10
    expect(style).toContain("left: 300px");
    expect(style).toContain("top: 260px");
  });
});

describe("computeToolbarPosition - 视口边缘夹紧与翻转", () => {
  const base = {
    x: 400,
    y: 300,
    width: 240,
    height: 36,
    viewportWidth: 1024,
    viewportHeight: 768,
  };

  it("常规位置:居中于 x,位于选区下方", () => {
    const { left, top } = computeToolbarPosition(base);
    expect(left).toBe(400 - 120);
    expect(top).toBe(300 + 10);
  });

  it("右侧越界时夹紧到视口边缘", () => {
    const { left } = computeToolbarPosition({
      ...base,
      x: 1000,
      viewportWidth: 1024,
    });
    expect(left).toBeLessThanOrEqual(1024 - 8 - 240);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it("左侧越界时夹紧到左侧边缘", () => {
    const { left } = computeToolbarPosition({ ...base, x: 10 });
    expect(left).toBe(8);
  });

  it("下方放不下且上方有空间时翻转到选区上方", () => {
    const { top } = computeToolbarPosition({
      ...base,
      y: 740,
      viewportHeight: 768,
    });
    expect(top).toBe(740 - 36 - 10);
  });

  it("上下都放不下时夹紧到视口顶部", () => {
    const { top } = computeToolbarPosition({
      ...base,
      y: 20,
      height: 800,
      viewportHeight: 768,
    });
    // 工具栏比视口还高:无法完整容纳,按上方优先夹紧到 8px
    expect(top).toBe(8);
  });

  it("工具栏宽于视口时限制宽度", () => {
    const { left } = computeToolbarPosition({
      ...base,
      width: 2000,
      viewportWidth: 1024,
    });
    expect(left).toBe(8);
  });
});
