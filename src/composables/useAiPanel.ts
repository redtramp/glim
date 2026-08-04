/**
 * useAiPanel.ts — 内置 AI 面板的状态编排（Phase 3）。
 *
 * 职责:
 * - 面板状态(可见性 / 选区 / 结果 / loading / 错误 / 当前动作);
 * - runAction:按动作构造 prompt(纯函数 buildAiMessages)→ chatComplete
 *   (Tauri http 插件)→ 更新结果;外部中止信号在 close 时取消进行中请求;
 * - applyResultToDoc:改写结果经 App 确认后应用到草稿;
 * - 与 Vue 状态(tabs/draftContent)的接线通过 AiPanelContext 注入,
 *   由 App.vue 提供,保持本模块可独立测试。
 *
 * 错误归一:所有失败以 AiError{code, detail} 呈现,面板按 code 映射 i18n 文案。
 */

import { reactive } from "vue";
import {
  chatComplete,
  getAiSettings,
  AiError,
  type AiMessage,
} from "./aiProvider";
import { i18n } from "../i18n";

export type AiAction = "summarize" | "translate" | "explain" | "rewrite";

/** 需要选区的动作（无选区时面板禁用这些按钮） */
export const SELECTION_ACTIONS: ReadonlySet<AiAction> = new Set([
  "summarize",
  "translate",
  "explain",
]);

export interface AiPanelState {
  visible: boolean;
  selectionText: string;
  result: string;
  loading: boolean;
  error: AiError | null;
  activeAction: AiAction | null;
}

/** App.vue 注入的上下文:改写动作需要全文,结果应用需写回草稿 */
export interface AiPanelContext {
  getSource: () => string;
  /** 改写结果应用到文档(由 App 负责确认后 setSource) */
  applyResult: (text: string) => void;
}

/** 当前界面语言名(中文 / English),用于摘要/翻译/解释的输出语言 */
export function currentLangName(): string {
  return i18n.global.locale.value === "zh-CN" ? "中文" : "English";
}

/**
 * 构造 AI 消息(纯函数,可单测)。
 * - summarize/translate/explain:user 提示词含选区与目标语言;
 * - rewrite:system 说明 CriticMarkup 批注语法,user 为含批注全文,
 *   要求输出无批注语法的完整文档。
 */
export function buildAiMessages(
  action: AiAction,
  opts: { selection: string; content: string; lang: string }
): AiMessage[] {
  const { selection, content, lang } = opts;
  switch (action) {
    case "summarize":
      return [
        {
          role: "user",
          content: `请用${lang}概括以下内容，保留关键信息，200 字以内：\n\n${selection}`,
        },
      ];
    case "translate":
      return [
        {
          role: "user",
          content: `请将以下内容翻译成${lang}：\n\n${selection}`,
        },
      ];
    case "explain":
      return [
        {
          role: "user",
          content: `请用${lang}解释以下内容的含义与背景：\n\n${selection}`,
        },
      ];
    case "rewrite":
      return [
        {
          role: "system",
          content:
            "你是文档审阅助手。以下是含 CriticMarkup 批注的文档。批注语法说明：{--删除--} 表示建议删除，{++新增++} 表示建议新增，{~~旧~>新~~} 表示建议替换，{==高亮==} 表示重点，{>>评论<<} 表示评论。请采纳合理的批注建议，输出修改后的完整文档，不要保留任何批注语法。",
        },
        { role: "user", content },
      ];
  }
}

export function useAiPanel(opts: { chat?: typeof chatComplete } = {}) {
  const chatImpl = opts.chat ?? chatComplete;

  const state = reactive<AiPanelState>({
    visible: false,
    selectionText: "",
    result: "",
    loading: false,
    error: null,
    activeAction: null,
  });

  let getCtx: () => AiPanelContext | null = () => null;
  let abortCtrl: AbortController | null = null;

  function configure(ctx: () => AiPanelContext | null): void {
    getCtx = ctx;
  }

  /** 工具栏「AI」触发:记录选区并打开面板 */
  function openWithSelection(selection: string): void {
    state.selectionText = selection;
    state.result = "";
    state.error = null;
    state.activeAction = null;
    state.visible = true;
  }

  /** 执行动作;并发防抖(loading 时忽略新动作);关闭面板可中止进行中请求 */
  async function runAction(action: AiAction): Promise<void> {
    if (state.loading) return;
    if (SELECTION_ACTIONS.has(action) && !state.selectionText.trim()) return;
    if (action === "rewrite" && !getCtx()?.getSource().trim()) return;

    state.loading = true;
    state.error = null;
    state.activeAction = action;
    // 切换动作时清掉上一个动作的结果,避免旧结果显示在新动作下
    state.result = "";
    abortCtrl = new AbortController();

    const settings = getAiSettings();
    const messages = buildAiMessages(action, {
      selection: state.selectionText,
      content: action === "rewrite" ? (getCtx()?.getSource() ?? "") : "",
      lang: currentLangName(),
    });

    // 捕获 signal 引用:close() 会先把 abortCtrl 置 null,若在此判断
    // abortCtrl?.signal.aborted 会失效(拿到 null),必须用捕获的 signal
    const signal = abortCtrl.signal;
    try {
      state.result = await chatImpl(settings, messages, undefined, signal);
    } catch (e) {
      // 面板关闭触发的中止:忽略错误,不覆盖已展示内容。
      // 不能用 signal.aborted 判断——超时也会 abort 同一信号,会把超时错误吞掉;
      // 按面板可见性区分:close() 同步置 visible=false,超时时面板仍可见。
      if (!state.visible) return;
      state.error = e instanceof AiError ? e : new AiError("network", String(e));
    } finally {
      state.loading = false;
      abortCtrl = null;
    }
  }

  /** 改写结果应用到文档(App 确认后写回草稿) */
  function applyResultToDoc(): void {
    if (!state.result.trim()) return;
    getCtx()?.applyResult(state.result);
  }

  /** 关闭面板:中止进行中请求并清态 */
  function close(): void {
    abortCtrl?.abort();
    abortCtrl = null;
    state.visible = false;
    state.loading = false;
    state.activeAction = null;
  }

  return {
    state,
    configure,
    openWithSelection,
    runAction,
    applyResultToDoc,
    close,
  };
}
