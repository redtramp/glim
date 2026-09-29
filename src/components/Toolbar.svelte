<script lang="ts">
  /**
   * Toolbar.vue → .svelte 迁移要点:
   * - defineProps/defineEmits → Props 接口 + onXxx 回调 prop（kebab 事件名转 camelCase）
   * - useI18n().t → ../i18n/locale.svelte.ts 的 t（内部读 locale.value 保持响应）
   * - 本组件 <style scoped> 仅一行注释，真实样式在 src/legacy-components.css 的
   *   .toolbar* 全局规则（未分层，优先级高于 Tailwind 工具类）。故保留
   *   toolbar/btn/filename/toolbar-right/export-wrap/toolbar-brand/caret 类名原样，
   *   不改写为工具类——否则会与全局规则同属性冲突，且丢失暗色主题
   *   --shell-toolbar-bg 的渐变背景与 .toolbar-brand 的磷光 text-shadow
   * - .icon/.lang/.float-toggle 在全局 CSS 中无对应规则，属纯标记类，保留
   * - 内联 style → Tailwind 任意值类（vertical-align 在 inline-flex 中本就无效，等价保留）
   */
  import { t } from "../i18n/locale.svelte.ts";
  import { useShortcuts } from "../composables/useShortcuts";

  interface Props {
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
    onCreateNewFile?: () => void;
    onPickFile?: () => void;
    onPickFolder?: () => void;
    onRefreshTree?: () => void;
    onCloseFolder?: () => void;
    onToggleEditorMode?: () => void;
    onSave?: () => void;
    onSaveAs?: () => void;
    onFind?: () => void;
    onToggleExportMenu?: () => void;
    onCloseExportMenu?: () => void;
    onExportHtml?: () => void;
    onExportDocx?: () => void;
    onExportPdf?: () => void;
    onPrint?: () => void;
    onOpenSettings?: () => void;
    onToggleBookmark?: () => void;
    onToggleTheme?: () => void;
    onToggleLocale?: () => void;
    onToggleFloatLayout?: () => void;
  }

  let {
    isEditing,
    isDirty,
    hasActiveFile,
    saving,
    canExport,
    exportBusy,
    showExportMenu,
    currentFile,
    displayFileName,
    rootDir,
    treeLoading,
    theme,
    locale,
    hasBookmarkAtCurrentPos,
    floatLayoutEnabled,
    onCreateNewFile,
    onPickFile,
    onPickFolder,
    onRefreshTree,
    onCloseFolder,
    onToggleEditorMode,
    onSave,
    onSaveAs,
    onFind,
    onToggleExportMenu,
    onOpenSettings,
    onToggleBookmark,
    onToggleTheme,
    onToggleLocale,
    onToggleFloatLayout,
  }: Props = $props();

  const { getBinding, formatBinding } = useShortcuts();

  function shortcutSuffix(id: string): string {
    return " (" + formatBinding(getBinding(id)) + ")";
  }

  /* 内联 style 的两个属性；vertical-align 对 inline-flex 子项无效但按原样保留 */
  const svgInline = "[vertical-align:-2px]";
  const svgInlineGap = "[vertical-align:-2px] ml-[2px]";
</script>

<header class="toolbar">
  <span class="toolbar-brand" title={t("app.title")}>GLIM<span class="caret" aria-hidden="true"></span></span>
  <button class="btn" onclick={onCreateNewFile} title={t("toolbar.new") + shortcutSuffix("new-file")}>{t("toolbar.new")}</button>
  <button class="btn" onclick={onPickFile} title={t("app.file") + shortcutSuffix("open-file")}>{t("app.file")}</button>
  <button class="btn" onclick={onPickFolder} title={t("app.folder")}>{t("app.folder")}</button>
  {#if rootDir}
    <button class="btn" onclick={onRefreshTree} disabled={treeLoading} title={t("app.refresh")}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
    </button>
    <button class="btn" onclick={onCloseFolder} title={t("app.closeFolder")}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    </button>
  {/if}
  <div class="filename" title={currentFile}>{displayFileName}</div>
  <div class="toolbar-right">
    <button
      class="btn"
      onclick={onToggleEditorMode}
      disabled={!hasActiveFile}
      title={(isEditing ? t("editor.preview") : t("editor.edit")) + shortcutSuffix("toggle-mode")}>{isEditing
        ? t("editor.preview")
        : t("editor.edit")}{#if isEditing}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={svgInlineGap}><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>{:else}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={svgInlineGap}><path d="M11 2l3 3L4 15H1v-3z" /><path d="M8 6l2 2" /></svg>{/if}</button
    >
    <button
      class="btn"
      onclick={onSave}
      disabled={!hasActiveFile || !isDirty || saving}
      title={t("editor.save") + shortcutSuffix("save")}>{t("editor.save")}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={svgInlineGap}><path d="M3 2h8l4 4v9H3V2z" /><path d="M11 2v4h4" /><path d="M5 8h6v5H5z" /></svg></button
    >
    <button
      class="btn"
      onclick={onSaveAs}
      disabled={!hasActiveFile || saving}
      title={t("editor.saveAs") + shortcutSuffix("save-as")}>{t("editor.saveAs")}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={svgInlineGap}><path d="M3 2h6l4 4v8H3V2z" /><path d="M9 2v4h4" /><path d="M6 10h6M6 12h6" /></svg></button
    >
    <button
      class="btn"
      onclick={onFind}
      title={t("toolbar.find") + shortcutSuffix("find")}
      disabled={!hasActiveFile}>{t("toolbar.find")}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class={svgInlineGap}><circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4.5 4.5" /></svg></button
    >
    <div class="export-wrap">
      <button
        class="btn"
        onclick={onToggleExportMenu}
        disabled={!canExport || exportBusy}
        aria-expanded={showExportMenu ? "true" : "false"}
        aria-haspopup="menu"
        aria-controls={showExportMenu ? "export-menu" : undefined}
        title={exportBusy ? t("export.exportBusy") : t("export.exportShortcut")}>{t("toolbar.export") + " "}{#if exportBusy}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={svgInline}><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="5.64" x2="19.78" y2="4.22" /></svg>{:else}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={svgInline}><path d="M8 2v9M4 6l4-4 4 4" /><path d="M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" /></svg>{/if}</button
      >
    </div>
    <button
      class="btn"
      onclick={onOpenSettings}
      title={t("toolbar.settings") + shortcutSuffix("settings")}>{t("toolbar.settingsBtn")}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class={svgInlineGap}><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" /></svg></button
    >
    <button
      class="btn icon"
      class:active={hasBookmarkAtCurrentPos}
      disabled={!hasActiveFile || isEditing}
      title={t("float.toggleBookmark") + shortcutSuffix("toggle-bookmark")}
      onclick={onToggleBookmark}>{#if hasBookmarkAtCurrentPos}<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={svgInline}><polygon points="19 21 12 17 5 21 5 3 19 3 19 21" /></svg>{:else}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={svgInline}><polygon points="19 21 12 17 5 21 5 3 19 3 19 21" /></svg>{/if}</button
    >
    <button class="btn icon" onclick={onToggleTheme} title={t("app.toggleTheme")}>{#if theme === "light"}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>{:else}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>{/if}</button
    >
    <button class="btn lang" onclick={onToggleLocale} title={t("app.switchLanguage")}>{locale === "zh-CN" ? "EN" : "中"}</button>
    <button
      class="btn float-toggle"
      class:active={floatLayoutEnabled}
      title={t("float.floatLayout")}
      onclick={onToggleFloatLayout}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={svgInline}><rect x="2" y="2" width="20" height="20" rx="2" /><line x1="2" y1="8" x2="22" y2="8" /><line x1="8" y1="2" x2="8" y2="22" /></svg></button
    >
  </div>
</header>
