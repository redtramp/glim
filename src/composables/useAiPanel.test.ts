/**
 * useAiPanel 单测
 *
 * 覆盖:buildAiMessages 四动作 prompt 构造、openWithSelection 状态、
 * runAction 成功/失败/缺选区 no-op/loading 防抖/外部中止、
 * applyResultToDoc 回调、close 清态。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// i18n 模块加载时会读 localStorage(探测语言),vitest4 + jsdom 无此 API,
// 与 App.test.ts 相同的模式:在 import 目标模块前注入内存实现。
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const key in mockStorage) delete mockStorage[key];
    },
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
  },
});

import {
  useAiPanel,
  buildAiMessages,
  SELECTION_ACTIONS,
  currentLangName,
} from "./useAiPanel.svelte.ts";
import { AiError, type AiSettings } from "./aiProvider";
import type { AiMessage } from "./aiProvider";

/** 可控制完成时机的 mock chat;响应中止信号(与真实 chatComplete 行为一致) */
function mockChat() {
  let resolveFn: ((v: string) => void) | null = null;
  let rejectFn: ((e: unknown) => void) | null = null;
  const impl = vi.fn(
    (
      _s: AiSettings,
      _m: AiMessage[],
      _f?: unknown,
      signal?: AbortSignal
    ): Promise<string> =>
      new Promise((resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort);
        resolveFn = resolve;
        rejectFn = reject;
      })
  );
  return { impl, resolve: (v: string) => resolveFn?.(v), reject: (e: unknown) => rejectFn?.(e) };
}

describe("buildAiMessages", () => {
  const opts = { selection: "选中文本", content: "全文内容", lang: "中文" };

  it("summarize:user 提示含选区与语言", () => {
    const msgs = buildAiMessages("summarize", opts);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("选中文本");
    expect(msgs[0].content).toContain("中文");
  });

  it("translate:提示翻译成目标语言", () => {
    const msgs = buildAiMessages("translate", { ...opts, lang: "English" });
    expect(msgs[0].content).toContain("English");
    expect(msgs[0].content).toContain("选中文本");
  });

  it("explain:提示解释含义与背景", () => {
    const msgs = buildAiMessages("explain", opts);
    expect(msgs[0].content).toContain("解释");
    expect(msgs[0].content).toContain("选中文本");
  });

  it("rewrite:system 说明批注语法,user 为全文", () => {
    const msgs = buildAiMessages("rewrite", opts);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("CriticMarkup");
    expect(msgs[1].content).toBe("全文内容");
    expect(msgs[1].content).not.toContain("选中文本");
  });
});

describe("useAiPanel - 状态与动作", () => {
  beforeEach(() => {
    delete mockStorage["glim-reader-ai"];
  });

  it("SELECTION_ACTIONS 包含三类选区动作", () => {
    expect(SELECTION_ACTIONS.has("summarize")).toBe(true);
    expect(SELECTION_ACTIONS.has("translate")).toBe(true);
    expect(SELECTION_ACTIONS.has("explain")).toBe(true);
    expect(SELECTION_ACTIONS.has("rewrite")).toBe(false);
  });

  it("currentLangName 默认中文(测试环境 locale)", () => {
    expect(["中文", "English"]).toContain(currentLangName());
  });

  it("openWithSelection 设置选区并清空旧结果/错误", () => {
    const { state, openWithSelection } = useAiPanel();
    openWithSelection("选中文字");
    expect(state.visible).toBe(true);
    expect(state.selectionText).toBe("选中文字");
    expect(state.result).toBe("");
    expect(state.error).toBeNull();
  });

  it("runAction 成功:结果写入、loading 复位、无错误", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p = runAction("summarize");
    expect(state.loading).toBe(true);
    chat.resolve("AI 摘要");
    await p;
    expect(state.loading).toBe(false);
    expect(state.result).toBe("AI 摘要");
    expect(state.error).toBeNull();
    expect(state.activeAction).toBe("summarize");
  });

  it("runAction 失败:错误归一为 AiError", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p = runAction("translate");
    chat.reject(new AiError("authFailed", "API key 无效"));
    await p;
    expect(state.error?.code).toBe("authFailed");
    expect(state.result).toBe("");
  });

  it("runAction 缺选区:选区类动作直接返回不发请求", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("   ");
    await runAction("summarize");
    expect(chat.impl).not.toHaveBeenCalled();
    expect(state.loading).toBe(false);
  });

  it("runAction rewrite 无文件:直接返回不发请求", async () => {
    const chat = mockChat();
    const { runAction, configure } = useAiPanel({ chat: chat.impl });
    configure(() => ({ getSource: () => "", applyResult: () => {} }));
    await runAction("rewrite");
    expect(chat.impl).not.toHaveBeenCalled();
  });

  it("loading 期间重复调用被防抖忽略", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p1 = runAction("summarize");
    await runAction("explain"); // 第二次:loading 中,忽略
    expect(chat.impl).toHaveBeenCalledTimes(1);
    chat.resolve("done");
    await p1;
    expect(state.result).toBe("done");
  });

  it("close:中止进行中请求并清态", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction, close } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p = runAction("summarize");
    close();
    await p;
    // 中止路径:信号 abort 后错误被忽略,结果与错误保持空
    expect(state.visible).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("回归:面板仍可见时中止(超时) → 错误必须展示,不被吞掉", async () => {
    // 模拟超时:面板未关闭但请求因超时 abort 失败,错误应呈现给用户
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p = runAction("summarize");
    chat.reject(new AiError("timeout", "AI 请求超时"));
    await p;
    expect(state.visible).toBe(true);
    expect(state.error?.code).toBe("timeout");
    expect(state.loading).toBe(false);
  });

  it("runAction 切换动作清空上一动作结果", async () => {
    const chat = mockChat();
    const { state, openWithSelection, runAction } = useAiPanel({ chat: chat.impl });
    openWithSelection("x");
    const p1 = runAction("summarize");
    chat.resolve("摘要1");
    await p1;
    expect(state.result).toBe("摘要1");
    const p2 = runAction("translate");
    // 新动作开始时旧结果即被清空(loading 中)
    expect(state.result).toBe("");
    chat.resolve("译文");
    await p2;
    expect(state.result).toBe("译文");
  });

  it("applyResultToDoc:把结果交给注入上下文", async () => {
    const chat = mockChat();
    const applyResult = vi.fn();
    const { openWithSelection, runAction, applyResultToDoc, configure } =
      useAiPanel({ chat: chat.impl });
    configure(() => ({ getSource: () => "full", applyResult }));
    openWithSelection("x");
    const p = runAction("rewrite");
    chat.resolve("改写结果");
    await p;
    applyResultToDoc();
    expect(applyResult).toHaveBeenCalledWith("改写结果");
  });

  it("applyResultToDoc 无结果时不下发", async () => {
    const applyResult = vi.fn();
    const { applyResultToDoc, configure } = useAiPanel();
    configure(() => ({ getSource: () => "full", applyResult }));
    applyResultToDoc();
    expect(applyResult).not.toHaveBeenCalled();
  });
});
