<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{
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
</script>

<template>
  <div v-if="visible" class="export-menu" @click.stop>
    <button class="menu-item" @click="emit('export-html')">
      <span class="mi-label">{{ t("export.html") }}</span>
      <span class="mi-hint">{{ t("export.htmlHint") }}</span>
    </button>
    <button
      class="menu-item"
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
      @click="emit('export-pdf')"
      :title="pdfEnginePath ? t('app.usePath', { path: pdfEnginePath }) : t('app.specifyEdgePath')"
    >
      <span class="mi-label">{{ t("export.pdf") }}</span>
      <span class="mi-hint">
        {{ pdfEnginePath ? t("export.pdfHint") : t("export.pdfNoEdge") }}
      </span>
    </button>
    <div class="menu-divider"></div>
    <button class="menu-item" @click="emit('print'); emit('close')">
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
.menu-item:hover:not(:disabled) {
  background: var(--bg-btn-hover);
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