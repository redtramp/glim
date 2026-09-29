/**
 * 应用级状态: 主题 / 错误提示 / 导出提示 / 保存中
 *
 * 由 Pinia defineStore 迁移为 Svelte 5 模块级 $state。
 * 导出 API 形状与旧 useAppStore() 保持一致，组件侧仅需更换 import 来源。
 */
export type Theme = "light" | "dark";

export function setTheme(v: Theme): void {
  app.theme = v;
  localStorage.setItem("glim-reader-theme", v);
  applyTheme();
}

export function toggleTheme(): void {
  setTheme(app.theme === "light" ? "dark" : "light");
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = app.theme;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("set_app_theme", { theme: app.theme }))
    .catch(() => {
      /* 非 Tauri 环境忽略 */
    });
}

export function showError(msg: string, duration = 5000): void {
  app.errorMsg = msg;
  if (duration > 0) {
    window.setTimeout(() => {
      app.errorMsg = "";
    }, duration);
  }
}

export function showExportToast(msg: string, duration = 3500): void {
  app.exportToast = msg;
  if (duration > 0) {
    window.setTimeout(() => {
      app.exportToast = "";
    }, duration);
  }
}

export const app = $state({
  theme: (localStorage.getItem("glim-reader-theme") as Theme) || "light",
  errorMsg: "",
  exportToast: "",
  saving: false,
  // Interfaces: useAppStore() 返回含函数的完整对象（Tasks 5-11 仅换 import）
  setTheme,
  toggleTheme,
  applyTheme,
  showError,
  showExportToast,
});

/** 兼容旧调用形状: const store = useAppStore(); store.theme */
export function useAppStore() {
  return app;
}
