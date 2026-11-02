import { useTabsStore } from "../stores/tabs.svelte.ts";
import type { Tab } from "../stores/tabs.svelte.ts";

type UnsavedChoice = "save" | "discard" | "cancel";
type UnsavedDialogMode = "unsaved" | "external";

// Ruling 6：模块级共享状态（不导出），修复旧 per-call ref 导致的双实例分裂
const showUnsavedDialog = $state<{ value: boolean }>({ value: false });
const unsavedDialogMode = $state<{ value: UnsavedDialogMode }>({ value: "unsaved" });
const dialogTab = $state<{ value: Tab | null }>({ value: null });
let unsavedResolve: ((choice: UnsavedChoice) => void) | null = null;

export function useUnsavedDialog() {
  const tabs = useTabsStore();

  /** 显示未保存变更对话框，返回用户选择 */
  function askUnsaved(tab: Tab, mode: UnsavedDialogMode): Promise<UnsavedChoice> {
    if (unsavedResolve) {
      return Promise.resolve("cancel");
    }
    return new Promise((resolve) => {
      dialogTab.value = tab;
      unsavedDialogMode.value = mode;
      unsavedResolve = resolve;
      showUnsavedDialog.value = true;
    });
  }

  function resolveDialog(choice: UnsavedChoice) {
    showUnsavedDialog.value = false;
    const resolve = unsavedResolve;
    unsavedResolve = null;
    dialogTab.value = null;
    resolve?.(choice);
  }

  async function handleUnsavedClose(targetId: string): Promise<UnsavedChoice> {
    const target = tabs.tabs.find((t) => t.id === targetId);
    if (!target || !target.isDirty) return "discard";
    return askUnsaved(target, "unsaved");
  }

  return {
    showUnsavedDialog,
    unsavedDialogMode,
    dialogTab,
    askUnsaved,
    resolveDialog,
    handleUnsavedClose,
  };
}
