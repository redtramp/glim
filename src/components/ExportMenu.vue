<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  visible: boolean;
  pandocInfo: { available: boolean } | null;
  pdfEnginePath: string | null;
}>();

const emit = defineEmits<{
  (e: "export-html"): void;
  (e: "export-docx"): void;
  (e: "export-pdf"): void;
  (e: "print"): void;
  (e: "close"): void;
}>();

const { t } = useI18n();

const menuEl = ref<HTMLElement | null>(null);
/** 打开前处于焦点的元素（通常是工具栏导出按钮），关闭时归还焦点 */
let restoreFocusTo: HTMLElement | null = null;
/** 按 Tab 离开菜单时不归还焦点（让浏览器把焦点移到下一个控件） */
let suppressRestore = false;

function menuItems(): HTMLButtonElement[] {
  if (!menuEl.value) return [];
  return Array.from(
    menuEl.value.querySelectorAll<HTMLButtonElement>("button.menu-item:not(:disabled)")
  );
}

function focusItem(index: number): void {
  const items = menuItems();
  if (!items.length) return;
  items[(index + items.length) % items.length]?.focus();
}

function restoreFocus(): void {
  if (suppressRestore) {
    // Tab 关闭：焦点已由浏览器移到下一控件，不抢回
    suppressRestore = false;
    restoreFocusTo = null;
    return;
  }
  if (restoreFocusTo && document.contains(restoreFocusTo)) restoreFocusTo.focus();
  restoreFocusTo = null;
}

/** 键盘导航：方向键在条目间移动，Home/End 跳首尾，ESC 关闭，Tab 关闭并移出菜单 */
function onKeydown(e: KeyboardEvent): void {
  const items = menuItems();
  if (!items.length) return;
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      emit("close");
      break;
    case "Tab":
      // 让原生 Tab 把焦点移到下一个控件；关闭菜单但不抢回焦点
      suppressRestore = true;
      emit("close");
      break;
    case "ArrowDown":
      e.preventDefault();
      focusItem(currentIndex + 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      focusItem(currentIndex - 1);
      break;
    case "Home":
      e.preventDefault();
      items[0]?.focus();
      break;
    case "End":
      e.preventDefault();
      items[items.length - 1]?.focus();
      break;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      restoreFocusTo = document.activeElement as HTMLElement | null;
      nextTick(() => menuItems()[0]?.focus());
    } else {
      restoreFocus();
    }
  }
);
</script>

<template>
  <div
    v-if="visible"
    id="export-menu"
    ref="menuEl"
    class="export-menu"
    role="menu"
    :aria-label="t('export.export')"
    @click.stop
    @keydown="onKeydown"
  >
    <button class="menu-item" role="menuitem" @click="emit('export-html')">
      <span class="mi-label">{{ t("export.html") }}</span>
      <span class="mi-hint">{{ t("export.htmlHint") }}</span>
    </button>
    <button
      class="menu-item"
      role="menuitem"
      :disabled="!pandocInfo?.available"
      @click="emit('export-docx')"
      :title="!pandocInfo?.available ? t('export.docxRequiresPandoc') : ''"
    >
      <span class="mi-label">{{ t("export.docx") }}</span>
      <span class="mi-hint">
        {{ pandocInfo?.available ? t("export.docxHint") : t("export.docxRequiresPandoc") }}
      </span>
    </button>
    <button
      class="menu-item"
      role="menuitem"
      @click="emit('export-pdf')"
      :title="pdfEnginePath ? t('app.usePath', { path: pdfEnginePath }) : t('app.specifyEdgePath')"
    >
      <span class="mi-label">{{ t("export.pdf") }}</span>
      <span class="mi-hint">
        {{ pdfEnginePath ? t("export.pdfHint") : t("export.pdfNoEdge") }}
      </span>
    </button>
    <div class="menu-divider" aria-hidden="true"></div>
    <button class="menu-item" role="menuitem" @click="emit('print'); emit('close')">
      <span class="mi-label">{{ t("export.print") }}</span>
      <span class="mi-hint">{{ t("export.printHint") }}</span>
    </button>
  </div>
</template>

<style scoped>
.export-menu {
  position: fixed;
  top: 44px;
  right: 12px;
  z-index: 70;
  min-width: 240px;
  padding: 4px 0;
  background: var(--bg-toolbar);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}
.menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 16px;
  background: transparent;
  border: none;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.menu-item:hover:not(:disabled),
.menu-item:focus-visible {
  background: var(--bg-btn-hover);
  outline: none;
}
.menu-item:disabled {
  color: var(--fg-muted);
  opacity: 0.5;
  cursor: default;
}
.mi-label {
  font-size: 12px;
  font-weight: 500;
}
.mi-hint {
  font-size: 11px;
  color: var(--fg-muted);
}
.menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}
</style>
