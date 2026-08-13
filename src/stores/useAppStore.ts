import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "light" | "dark";

export const useAppStore = defineStore("app", () => {
  const theme = ref<Theme>(
    (localStorage.getItem("glim-reader-theme") as Theme) || "light"
  );
  const errorMsg = ref<string>("");
  const exportToast = ref<string>("");
  const saving = ref(false);

  function setTheme(v: Theme) {
    theme.value = v;
    localStorage.setItem("glim-reader-theme", v);
    applyTheme();
  }

  function toggleTheme() {
    setTheme(theme.value === "light" ? "dark" : "light");
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_app_theme", { theme: theme.value }))
      .catch(() => {
        /* 非 Tauri 环境忽略 */
      });
  }

  function showError(msg: string, duration = 5000) {
    errorMsg.value = msg;
    if (duration > 0) {
      window.setTimeout(() => {
        errorMsg.value = "";
      }, duration);
    }
  }

  function showExportToast(msg: string, duration = 3500) {
    exportToast.value = msg;
    if (duration > 0) {
      window.setTimeout(() => {
        exportToast.value = "";
      }, duration);
    }
  }

  return {
    theme,
    errorMsg,
    exportToast,
    saving,
    setTheme,
    toggleTheme,
    applyTheme,
    showError,
    showExportToast,
  };
});
