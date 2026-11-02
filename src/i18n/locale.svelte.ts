/**
 * 自研轻量 i18n — 替代 vue-i18n
 *
 * 设计:
 * - locale 为模块级 $state 对象包装（Ruling 6: 5.57 禁止重赋值已导出 $state）,
 *   读写均 locale.value — 与 vue-i18n 组件原语法一致，模板中读取自动追踪切语言重渲染
 * - 消息文件 zh-CN.ts / en-US.ts 为嵌套结构（Ruling 8），t() 按点号下探，行为同 vue-i18n
 * - 持久化键与旧版一致: glim-reader-locale
 */
import zhCN from "./zh-CN";
import enUS from "./en-US";

export type AppLocale = "zh-CN" | "en-US";

const STORAGE_KEY = "glim-reader-locale";
const messages: Record<AppLocale, Record<string, unknown>> = {
  "zh-CN": zhCN as unknown as Record<string, unknown>,
  "en-US": enUS as unknown as Record<string, unknown>,
};

/** 探测初始语言: localStorage 优先，其次系统语言，防御隐私模式异常（Produces 要求导出） */
export function detectLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en-US") return saved;
  } catch {
    /* 隐私模式/受限 webview 忽略 */
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

/** 当前语言（响应式对象包装；访问 locale.value，同 vue-i18n 用法） */
export const locale = $state({ value: detectLocale() });

/** 点号路径查找: 平铺 key 直查，miss 则按 "." 逐段下探嵌套消息；非字符串（命中中间对象）视为 miss */
function lookup(map: Record<string, unknown>, key: string): string | undefined {
  const flat = map[key];
  if (typeof flat === "string") return flat;
  const nested = key.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    map
  );
  return typeof nested === "string" ? nested : undefined;
}

/** 翻译: 当前语言 miss 回退 en-US，再 miss 原样返回 key（与 vue-i18n 一致）；支持 {name} 插值 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw =
    lookup(messages[locale.value], key) ?? lookup(messages["en-US"], key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name) =>
    name in params ? String(params[name]) : whole
  );
}

/** 持久化语言选择（不修改当前 locale） */
export function persistLocale(l: AppLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* 忽略 */
  }
}

/** 切换语言: 更新 $state + 持久化 */
export function setLocale(l: AppLocale): void {
  locale.value = l;
  persistLocale(l);
}
