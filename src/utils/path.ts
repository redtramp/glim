/**
 * 路径工具函数。
 * 统一处理文件路径的 basename 和 dirname 提取，
 * 兼容 Windows 反斜杠路径。
 */

export function basename(p: string): string {
  if (!p) return "";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

export function dirOf(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  return i < 0 ? "" : normalized.slice(0, i);
}