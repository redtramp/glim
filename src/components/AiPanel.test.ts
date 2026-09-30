/**
 * AiPanel 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 覆盖:渲染/隐藏、选区相关按钮禁用逻辑、动作按钮回调 onRunAction、
 * loading 防抖、错误态显示与重试、结果渲染、复制结果、
 * 改写动作的「应用到文档」按钮、关闭。
 *
 * 迁移要点:
 * - defineEmits run-action/apply-result/close → 回调 props(onRunAction/onApplyResult/onClose)
 * - wrapper.emitted("x") → 断言对应回调 mock 的调用
 * - wrapper.find().trigger("click") → fireEvent.click + container.querySelector
 * - attributes("disabled") toBeDefined/toBeUndefined → hasAttribute("disabled")
 * - vue-i18n 实例 → mock 自研 i18n(locale.svelte.ts)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, type RenderResult } from "@testing-library/svelte";
import { tick } from "svelte";
import AiPanel from "./AiPanel.svelte";
import type { AiAction } from "../composables/useAiPanel.svelte.ts";
import { AiError } from "../composables/aiProvider";

// Mock 自研 i18n（原 vue-i18n 实例的等价迁移，文案沿用原测试）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "ai.title": "AI 助手",
      "ai.loading": "处理中…",
      "ai.selection": "选中文本",
      "ai.noSelection": "未选中文本",
      "ai.summarize": "摘要",
      "ai.translate": "翻译",
      "ai.explain": "解释",
      "ai.rewrite": "按批注改写",
      "ai.copy": "复制结果",
      "ai.copied": "已复制",
      "ai.apply": "应用到文档",
      "ai.retry": "重试",
      "ai.close": "关闭",
      "ai.error.configMissing": "请先在设置中启用并配置 AI",
      "ai.error.authFailed": "API key 无效",
      "ai.error.timeout": "请求超时",
      "ai.error.network": "无法连接",
      "ai.error.server": "服务错误",
    };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

type Mock = ReturnType<typeof vi.fn>;
type Rendered = RenderResult<typeof AiPanel> & {
  onRunAction: Mock;
  onApplyResult: Mock;
  onClose: Mock;
};

function mountPanel(
  props: {
    visible?: boolean;
    selectionText?: string;
    result?: string;
    loading?: boolean;
    error?: AiError | null;
    activeAction?: AiAction | null;
  } = {}
): Rendered {
  const onRunAction = vi.fn();
  const onApplyResult = vi.fn();
  const onClose = vi.fn();
  const result = render(AiPanel, {
    props: {
      visible: props.visible ?? true,
      selectionText: props.selectionText ?? "",
      result: props.result ?? "",
      loading: props.loading ?? false,
      error: props.error ?? null,
      activeAction: props.activeAction ?? null,
      onRunAction,
      onApplyResult,
      onClose,
    },
  });
  return { ...result, onRunAction, onApplyResult, onClose };
}

/** 让 renderMarkdown 异步渲染 settle（effect + microtask + macrotask） */
async function settleRender(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await tick();
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

describe("AiPanel - 渲染与禁用", () => {
  afterEach(() => cleanup());

  it("visible=false 时不渲染", () => {
    const { container } = mountPanel({ visible: false });
    expect(container.querySelector(".ai-overlay")).toBeNull();
  });

  it("无选区:显示「未选中文本」,选区类动作禁用,改写可用", () => {
    const { container } = mountPanel();
    expect(container.querySelector('[data-test="selection"]')!.textContent).toContain(
      "未选中文本"
    );
    expect(
      container.querySelector('[data-action="summarize"]')!.hasAttribute("disabled")
    ).toBe(true);
    expect(
      container.querySelector('[data-action="translate"]')!.hasAttribute("disabled")
    ).toBe(true);
    expect(
      container.querySelector('[data-action="explain"]')!.hasAttribute("disabled")
    ).toBe(true);
    expect(
      container.querySelector('[data-action="rewrite"]')!.hasAttribute("disabled")
    ).toBe(false);
  });

  it("有选区:选区类动作可用", () => {
    const { container } = mountPanel({ selectionText: "选中内容" });
    expect(container.querySelector('[data-test="selection"]')!.textContent).toContain(
      "选中内容"
    );
    expect(
      container.querySelector('[data-action="summarize"]')!.hasAttribute("disabled")
    ).toBe(false);
  });
});

describe("AiPanel - 事件", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("点击摘要回调 onRunAction('summarize')", async () => {
    const { container, onRunAction } = mountPanel({ selectionText: "x" });
    await fireEvent.click(container.querySelector('[data-action="summarize"]')!);
    expect(onRunAction.mock.calls[0]).toEqual(["summarize"]);
  });

  it("点击改写回调 onRunAction('rewrite')", async () => {
    const { container, onRunAction } = mountPanel();
    await fireEvent.click(container.querySelector('[data-action="rewrite"]')!);
    expect(onRunAction.mock.calls[0]).toEqual(["rewrite"]);
  });

  it("loading 时按钮禁用且不回调", async () => {
    const { container, onRunAction } = mountPanel({ selectionText: "x", loading: true });
    await fireEvent.click(container.querySelector('[data-action="summarize"]')!);
    expect(
      container.querySelector('[data-action="summarize"]')!.hasAttribute("disabled")
    ).toBe(true);
    expect(onRunAction).not.toHaveBeenCalled();
  });

  it("关闭按钮回调 onClose", async () => {
    const { container, onClose } = mountPanel();
    await fireEvent.click(container.querySelector('[data-action="close"]')!);
    expect(onClose).toHaveBeenCalled();
  });

  it("点击遮罩回调 onClose", async () => {
    const { container, onClose } = mountPanel();
    await fireEvent.click(container.querySelector(".ai-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("改写动作且有结果时显示「应用到文档」并回调 onApplyResult", async () => {
    const { container, onApplyResult } = mountPanel({
      result: "改写结果",
      activeAction: "rewrite",
    });
    expect(container.querySelector('[data-action="apply"]')).not.toBeNull();
    await fireEvent.click(container.querySelector('[data-action="apply"]')!);
    expect(onApplyResult).toHaveBeenCalled();
  });

  it("非改写动作不显示「应用到文档」", () => {
    const { container } = mountPanel({ result: "摘要结果", activeAction: "summarize" });
    expect(container.querySelector('[data-action="apply"]')).toBeNull();
  });

  it("改写动作但结果为空时不显示「应用到文档」", () => {
    const { container } = mountPanel({ result: "", activeAction: "rewrite" });
    expect(container.querySelector('[data-action="apply"]')).toBeNull();
  });
});

describe("AiPanel - 错误态", () => {
  afterEach(() => cleanup());

  it("显示按 code 映射的错误文案与 detail", () => {
    const { container } = mountPanel({
      error: new AiError("authFailed", "API key 无效", "401 Unauthorized"),
      activeAction: "translate",
    });
    const msg = container
      .querySelector('[data-test="error"] .ai-error-msg')!
      .textContent!;
    expect(msg).toContain("API key 无效");
    expect(msg).toContain("401 Unauthorized");
  });

  it("点击重试回调 onRunAction(当前动作)", async () => {
    const { container, onRunAction } = mountPanel({
      error: new AiError("network", "无法连接"),
      activeAction: "explain",
    });
    await fireEvent.click(container.querySelector('[data-action="retry"]')!);
    expect(onRunAction.mock.calls[0]).toEqual(["explain"]);
  });

  it("无 activeAction 时不显示重试按钮", () => {
    const { container } = mountPanel({ error: new AiError("network", "无法连接") });
    expect(container.querySelector('[data-action="retry"]')).toBeNull();
  });
});

describe("AiPanel - 结果", () => {
  afterEach(() => cleanup());

  it("有结果时显示结果区(markdown 渲染)", async () => {
    const { container } = mountPanel({ result: "**加粗** 与 `code`" });
    expect(container.querySelector('[data-test="result"]')).not.toBeNull();
    await settleRender();
    // markdown 渲染成功(主线程回退)后应出现渲染区
    expect(container.querySelector(".ai-result-html")).not.toBeNull();
    expect(container.querySelector(".ai-result-html")!.innerHTML).toContain("<strong>");
  });

  it("复制结果成功:按钮文案切换为已复制", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { container } = mountPanel({ result: "要复制的内容" });
    await fireEvent.click(container.querySelector('[data-action="copy"]')!);
    await new Promise((r) => setTimeout(r, 0));
    await tick();
    expect(writeText).toHaveBeenCalledWith("要复制的内容");
    expect(container.querySelector('[data-action="copy"]')!.textContent).toBe("已复制");
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  });
});
