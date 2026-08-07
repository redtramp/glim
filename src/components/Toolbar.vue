<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useShortcuts } from "../composables/useShortcuts";

defineProps<{
  isEditing: boolean;
  isDirty: boolean;
  hasActiveFile: boolean;
  saving: boolean;
  canExport: boolean;
  exportBusy: boolean;
  showExportMenu: boolean;
  currentFile: string;
  displayFileName: string;
  rootDir: string | null;
  treeLoading: boolean;
  showSettings: boolean;
  theme: "light" | "dark";
  locale: string;
  hasBookmarkAtCurrentPos: boolean;
  floatLayoutEnabled: boolean;
  pandocInfo: { available: boolean } | null;
  pdfEnginePath: string | null;
}>();

const emit = defineEmits<{
  (e: "create-new-file"): void;
  (e: "pick-file"): void;
  (e: "pick-folder"): void;
  (e: "refresh-tree"): void;
  (e: "close-folder"): void;
  (e: "toggle-editor-mode"): void;
  (e: "save"): void;
  (e: "save-as"): void;
  (e: "find"): void;
  (e: "toggle-export-menu"): void;
  (e: "close-export-menu"): void;
  (e: "export-html"): void;
  (e: "export-docx"): void;
  (e: "export-pdf"): void;
  (e: "print"): void;
  (e: "open-settings"): void;
  (e: "toggle-bookmark"): void;
  (e: "toggle-theme"): void;
  (e: "toggle-locale"): void;
  (e: "toggle-float-layout"): void;
}>();

const { t } = useI18n();
const { getBinding, formatBinding } = useShortcuts();
function shortcutSuffix(id: string): string {
  return " (" + formatBinding(getBinding(id)) + ")";
}
</script>

<template>
  <header class="toolbar">
    <span class="toolbar-brand" :title="t('app.title')">
      GLIM<span class="caret" aria-hidden="true"></span>
    </span>
    <button class="btn" @click="emit('create-new-file')" :title="t('toolbar.new') + shortcutSuffix('new-file')">
      {{ t("toolbar.new") }}
    </button>
    <button class="btn" @click="emit('pick-file')" :title="t('app.file') + shortcutSuffix('open-file')">
      {{ t("app.file") }}
    </button>
    <button class="btn" @click="emit('pick-folder')" :title="t('app.folder')">
      {{ t("app.folder") }}
    </button>
    <button v-if="rootDir" class="btn" @click="emit('refresh-tree')" :disabled="treeLoading" :title="t('app.refresh')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      </svg>
    </button>
    <button v-if="rootDir" class="btn" @click="emit('close-folder')" :title="t('app.closeFolder')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
    <div class="filename" :title="currentFile">{{ displayFileName }}</div>
    <div class="toolbar-right">
      <button class="btn" @click="emit('toggle-editor-mode')" :disabled="!hasActiveFile"
              :title="(isEditing ? t('editor.preview') : t('editor.edit')) + shortcutSuffix('toggle-mode')">
        {{ isEditing ? t("editor.preview") : t("editor.edit") }}
        <svg v-if="isEditing" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-left: 2px">
          <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-left: 2px">
          <path d="M11 2l3 3L4 15H1v-3z" /><path d="M8 6l2 2" />
        </svg>
      </button>
      <button class="btn" @click="emit('save')" :disabled="!hasActiveFile || !isDirty || saving" :title="t('editor.save') + shortcutSuffix('save')">
        {{ t("editor.save") }}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-left: 2px">
          <path d="M3 2h8l4 4v9H3V2z" /><path d="M11 2v4h4" /><path d="M5 8h6v5H5z" />
        </svg>
      </button>
      <button class="btn" @click="emit('save-as')" :disabled="!hasActiveFile || saving" :title="t('editor.saveAs') + shortcutSuffix('save-as')">
        {{ t("editor.saveAs") }}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-left: 2px">
          <path d="M3 2h6l4 4v8H3V2z" /><path d="M9 2v4h4" /><path d="M6 10h6M6 12h6" />
        </svg>
      </button>
      <button class="btn" @click="emit('find')" :title="t('toolbar.find') + shortcutSuffix('find')" :disabled="!hasActiveFile">
        {{ t("toolbar.find") }}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="vertical-align: -2px; margin-left: 2px">
          <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4.5 4.5" />
        </svg>
      </button>
      <div class="export-wrap">
        <button class="btn" @click="emit('toggle-export-menu')" :disabled="!canExport || exportBusy"
                :title="exportBusy ? t('export.exportBusy') : t('export.exportShortcut')">
          {{ t("toolbar.export") + " " }}
          <svg v-if="exportBusy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px">
            <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px">
            <path d="M8 2v9M4 6l4-4 4 4" /><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" />
          </svg>
        </button>
      </div>
      <button class="btn" @click="emit('open-settings')" :title="t('toolbar.settings') + shortcutSuffix('settings')">
        {{ t("toolbar.settingsBtn") }}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="vertical-align: -2px; margin-left: 2px">
          <circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
        </svg>
      </button>
      <button class="btn icon" :class="{ active: hasBookmarkAtCurrentPos }" :disabled="!hasActiveFile || isEditing"
              :title="t('float.toggleBookmark') + shortcutSuffix('toggle-bookmark')" @click="emit('toggle-bookmark')">
        <svg v-if="hasBookmarkAtCurrentPos" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px">
          <polygon points="19 21 12 17 5 21 5 3 19 3 19 21" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px">
          <polygon points="19 21 12 17 5 21 5 3 19 3 19 21" />
        </svg>
      </button>
      <button class="btn icon" @click="emit('toggle-theme')" :title="t('app.toggleTheme')">
        <svg v-if="theme === 'light'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </button>
      <button class="btn lang" @click="emit('toggle-locale')" :title="t('app.switchLanguage')">
        {{ locale === "zh-CN" ? "EN" : "中" }}
      </button>
      <button
        class="btn float-toggle"
        :class="{ active: floatLayoutEnabled }"
        :title="t('float.floatLayout')"
        @click="emit('toggle-float-layout')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px">
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <line x1="2" y1="8" x2="22" y2="8" />
          <line x1="8" y1="2" x2="8" y2="22" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
/* Toolbar styles are defined in styles.css (.toolbar, .toolbar .btn, etc.) */
</style>