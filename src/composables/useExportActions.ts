import { ref } from "vue";
import { useAppStore } from "../stores/useAppStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export function useExportActions() {
  const app = useAppStore();
  const showExportPanel = ref(false);

  function openExportPanel() {
    showExportPanel.value = true;
  }

  function closeExportPanel() {
    showExportPanel.value = false;
  }

  async function handleExportSave(format: string, content: string, title: string): Promise<void> {
    const defaultExt = format === "pdf" ? "pdf" : "html";
    const path = await save({
      defaultPath: `${title}.${defaultExt}`,
      filters: [{ name: format.toUpperCase(), extensions: [defaultExt] }],
    });
    if (typeof path !== "string") return;
    try {
      await writeFile(path, new TextEncoder().encode(content));
      app.showExportToast("导出成功");
    } catch (e: unknown) {
      app.showError(String((e as Error)?.message ?? e));
    }
  }

  return {
    showExportPanel,
    openExportPanel,
    closeExportPanel,
    handleExportSave,
  };
}
