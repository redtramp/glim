/**
 * AiPanel 组件测试
 *
 * 覆盖:渲染/隐藏、选区相关按钮禁用逻辑、动作按钮 emit run-action、
 * loading 防抖、错误态显示与重试、结果渲染、复制结果、
 * 改写动作的「应用到文档」按钮、关闭。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import AiPanel from "./AiPanel.vue";
import type { AiAction } from "../composables/useAiPanel.svelte.ts";
import { AiError } from "../composables/aiProvider";

const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      ai: {
        title: "AI 助手",
        loading: "处理中…",
        selection: "选中文本",
        noSelection: "未选中文本",
        summarize: "摘要",
        translate: "翻译",
        explain: "解释",
        rewrite: "按批注改写",
        copy: "复制结果",
        copied: "已复制",
        apply: "应用到文档",
        retry: "重试",
        error: {
          configMissing: "请先在设置中启用并配置 AI",
          authFailed: "API key 无效",
          timeout: "请求超时",
          network: "无法连接",
          server: "服务错误",
        },
      },
    },
  },
});

function mountPanel(props: {
  visible?: boolean;
  selectionText?: string;
  result?: string;
  loading?: boolean;
  error?: AiError | null;
  activeAction?: AiAction | null;
} = {}) {
  return mount(AiPanel, {
    global: { plugins: [i18n] },
    props: {
      visible: props.visible ?? true,
      selectionText: props.selectionText ?? "",
      result: props.result ?? "",
      loading: props.loading ?? false,
      error: props.error ?? null,
      activeAction: props.activeAction ?? null,
    },
  });
}

/** 让 renderMarkdown 异步渲染 settle */
async function settleRender(): Promise<void> {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe("AiPanel - 渲染与禁用", () => {
  it("visible=false 时不渲染", () => {
    const wrapper = mountPanel({ visible: false });
    expect(wrapper.find(".ai-overlay").exists()).toBe(false);
  });

  it("无选区:显示「未选中文本」,选区类动作禁用,改写可用", () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-test="selection"]').text()).toContain("未选中文本");
    expect(wrapper.find('[data-action="summarize"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-action="translate"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-action="explain"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-action="rewrite"]').attributes("disabled")).toBeUndefined();
  });

  it("有选区:选区类动作可用", () => {
    const wrapper = mountPanel({ selectionText: "选中内容" });
    expect(wrapper.find('[data-test="selection"]').text()).toContain("选中内容");
    expect(wrapper.find('[data-action="summarize"]').attributes("disabled")).toBeUndefined();
  });
});

describe("AiPanel - 事件", () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
    vi.clearAllMocks();
  });

  it("点击摘要 emit run-action('summarize')", async () => {
    wrapper = mountPanel({ selectionText: "x" });
    await wrapper.find('[data-action="summarize"]').trigger("click");
    expect(wrapper.emitted("run-action")?.[0]).toEqual(["summarize"]);
  });

  it("点击改写 emit run-action('rewrite')", async () => {
    wrapper = mountPanel();
    await wrapper.find('[data-action="rewrite"]').trigger("click");
    expect(wrapper.emitted("run-action")?.[0]).toEqual(["rewrite"]);
  });

  it("loading 时按钮禁用且不 emit", async () => {
    wrapper = mountPanel({ selectionText: "x", loading: true });
    await wrapper.find('[data-action="summarize"]').trigger("click");
    expect(wrapper.find('[data-action="summarize"]').attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("run-action")).toBeUndefined();
  });

  it("关闭按钮 emit close", async () => {
    wrapper = mountPanel();
    await wrapper.find('[data-action="close"]').trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("点击遮罩 emit close", async () => {
    wrapper = mountPanel();
    await wrapper.find(".ai-overlay").trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("改写动作且有结果时显示「应用到文档」并 emit apply-result", async () => {
    wrapper = mountPanel({ result: "改写结果", activeAction: "rewrite" });
    expect(wrapper.find('[data-action="apply"]').exists()).toBe(true);
    await wrapper.find('[data-action="apply"]').trigger("click");
    expect(wrapper.emitted("apply-result")).toBeTruthy();
  });

  it("非改写动作不显示「应用到文档」", () => {
    wrapper = mountPanel({ result: "摘要结果", activeAction: "summarize" });
    expect(wrapper.find('[data-action="apply"]').exists()).toBe(false);
  });

  it("改写动作但结果为空时不显示「应用到文档」", () => {
    wrapper = mountPanel({ result: "", activeAction: "rewrite" });
    expect(wrapper.find('[data-action="apply"]').exists()).toBe(false);
  });
});

describe("AiPanel - 错误态", () => {
  it("显示按 code 映射的错误文案与 detail", () => {
    const wrapper = mountPanel({
      error: new AiError("authFailed", "API key 无效", "401 Unauthorized"),
      activeAction: "translate",
    });
    const msg = wrapper.find('[data-test="error"] .ai-error-msg').text();
    expect(msg).toContain("API key 无效");
    expect(msg).toContain("401 Unauthorized");
  });

  it("点击重试 emit run-action(当前动作)", async () => {
    const wrapper = mountPanel({
      error: new AiError("network", "无法连接"),
      activeAction: "explain",
    });
    await wrapper.find('[data-action="retry"]').trigger("click");
    expect(wrapper.emitted("run-action")?.[0]).toEqual(["explain"]);
  });

  it("无 activeAction 时不显示重试按钮", () => {
    const wrapper = mountPanel({ error: new AiError("network", "无法连接") });
    expect(wrapper.find('[data-action="retry"]').exists()).toBe(false);
  });
});

describe("AiPanel - 结果", () => {
  it("有结果时显示结果区(markdown 渲染)", async () => {
    const wrapper = mountPanel({ result: "**加粗** 与 `code`" });
    expect(wrapper.find('[data-test="result"]').exists()).toBe(true);
    await settleRender();
    // markdown 渲染成功(主线程回退)后应出现渲染区
    expect(wrapper.find(".ai-result-html").exists()).toBe(true);
    expect(wrapper.find(".ai-result-html").html()).toContain("<strong>");
  });

  it("复制结果成功:按钮文案切换为已复制", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const wrapper = mountPanel({ result: "要复制的内容" });
    await wrapper.find('[data-action="copy"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("要复制的内容");
    expect(wrapper.find('[data-action="copy"]').text()).toBe("已复制");
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  });
});
