/**
 * editorPreload — 编辑器（CodeMirror）空闲预加载的「编辑意图」判定与持久化。
 *
 * 背景:CodeMirror 全量约 613KB（gzip ~210KB），是体积最大的可选依赖。若在每次
 * 启动后都空闲预加载，纯阅读用户也被迫拉取该重块。仅在用户此前使用过编辑模式时
 * 才预加载，把「为纯阅读用户不拉取」与「回访编辑者首次编辑零等待」区分开;
 * 首次编辑由悬停编辑按钮的按需预取（见 App 的 onPanelHover）或进入编辑时的
 * 动态 import 兜底。
 *
 * localStorage 访问统一 try-catch:隐私模式 / 存储禁用下退化为「无意图」，
 * 不影响功能（仅退回到按需加载）。
 */

const EDITOR_USED_KEY = "glim-reader-editor-used";

/** 标记用户已使用过编辑模式（进入编辑时调用），此后启动将空闲预加载编辑器 */
export function markEditorUsed(): void {
  try {
    localStorage.setItem(EDITOR_USED_KEY, "1");
  } catch {
    /* 存储不可用（隐私模式等）忽略 */
  }
}

/** 用户此前是否使用过编辑模式（决定启动后是否空闲预加载编辑器） */
export function hasEditorIntent(): boolean {
  try {
    return localStorage.getItem(EDITOR_USED_KEY) === "1";
  } catch {
    return false;
  }
}
