/**
 * clipboard.ts — 剪贴板写入共享工具。
 *
 * 优先 Clipboard API;失败回退 execCommand(快捷键触发等无权限场景)。
 * 供 useAnnotations(复制给 AI)与 AiPanel(复制结果)共用,避免重复实现。
 */

/** 剪贴板写入:优先 Clipboard API,失败回退 execCommand(快捷键触发等场景) */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* 回退 execCommand */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error("copy failed");
}
