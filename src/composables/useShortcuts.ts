/**
 * useShortcuts — 向后兼容薄包装层，核心状态已迁移到 useShortcutsStore
 *
 * 新代码应直接使用 useShortcutsStore。
 */
import { useShortcutsStore } from "../stores/shortcuts.svelte.ts";
import type { ShortcutTarget, ShortcutCategory, ShortcutDef } from "../stores/shortcuts.svelte.ts";

export type { ShortcutTarget, ShortcutCategory, ShortcutDef };

export function useShortcuts() {
  const store = useShortcutsStore();

  function getBinding(id: string): string {
    return store.getBinding(id);
  }

  function getDef(id: string): ShortcutDef | undefined {
    return store.getDef(id);
  }

  function setBinding(
    id: string,
    combo: string
  ): { ok: boolean; conflict?: string } {
    return store.setBinding(id, combo);
  }

  function resetBinding(id: string) {
    store.resetBinding(id);
  }

  function resetAll() {
    store.resetAll();
  }

  function isCustom(id: string): boolean {
    return store.isCustom(id);
  }

  function normalizeEvent(e: KeyboardEvent): string {
    return store.normalizeEvent(e);
  }

  function toCodeMirror(combo: string): string {
    return store.toCodeMirror(combo);
  }

  function formatBinding(combo: string): string {
    return store.formatBinding(combo);
  }

  function isValidCombo(combo: string): boolean {
    return store.isValidCombo(combo);
  }

  function isModifierKey(key: string): boolean {
    return store.isModifierKey(key);
  }

  return {
    get defs() {
      return store.defs;
    },
    get overrides() {
      return store.overrides;
    },
    getBinding,
    getDef,
    setBinding,
    resetBinding,
    resetAll,
    isCustom,
    normalizeEvent,
    toCodeMirror,
    formatBinding,
    isValidCombo,
    isModifierKey,
  };
}
