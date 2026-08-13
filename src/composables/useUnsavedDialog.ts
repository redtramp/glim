import { ref } from "vue";
import { useTabsStore } from "../stores/useTabsStore";
import type { Tab } from "../stores/useTabsStore";

type UnsavedChoice = "save" | "discard" | "cancel";
type UnsavedDialogMode = "unsaved" | "external";

export function useUnsavedDialog() {
  const tabs = useTabsStore();
  const showUnsavedDialog = ref(false);
  const unsavedDialogMode = ref<UnsavedDialogMode>("unsaved");
  const dialogTab = ref<Tab | null>(null);
  let unsavedResolve: ((choice: UnsavedChoice) => void) | null = null;

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
