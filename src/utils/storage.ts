/**
 * localStorage 持久化工具。
 * 统一 try-catch + JSON.parse 模式，避免各 composable 重复实现。
 */

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* 损坏的存储数据回退到默认值 */
  }
  return fallback;
}

export function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
