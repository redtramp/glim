<script lang="ts">
/**
 * HelpPanel.svelte — 帮助浮层面板（使用方式 / 快捷键 / 标签页 / 批注 / 搜索）。
 * 纯展示组件：无 props、无事件。
 */
import { t } from "../i18n/locale.svelte.ts";
</script>

<div class="help-panel flex h-full flex-col overflow-hidden">
  <div class="hp-header border-b-[length:0.5px] border-float-rail-separator px-3 pb-2 pt-3">
    <span class="hp-title text-[13px] font-semibold text-fg">{t("float.help")}</span>
  </div>
  <div class="hp-body min-h-0 flex-1 overflow-y-auto py-2">
    <!-- 使用方式 -->
    <section class="hp-section mb-3">
      <h3 class="hp-section-title mb-0.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{t("float.helpUsageTitle")}</h3>
      <ul class="hp-list m-0 list-none px-2 py-0">
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">📄</span>
          <span class="hp-item-text flex-1">{t("float.helpUsageOpen")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">📂</span>
          <span class="hp-item-text flex-1">{t("float.helpUsageFolder")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">✏️</span>
          <span class="hp-item-text flex-1">{t("float.helpUsageEdit")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">⇩</span>
          <span class="hp-item-text flex-1">{t("float.helpUsageExport")}</span>
        </li>
      </ul>
    </section>

    <!-- 快捷键 -->
    <section class="hp-section mb-3">
      <h3 class="hp-section-title mb-0.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{t("float.helpShortcutsTitle")}</h3>
      <div class="hp-shortcuts px-2 py-1">
        {#each [
          { key: "Ctrl+S", action: t("shortcuts.save") },
          { key: "Ctrl+N", action: t("shortcuts.newFile") },
          { key: "Ctrl+O", action: t("shortcuts.openFile") },
          { key: "Ctrl+E", action: t("shortcuts.toggleMode") },
          { key: "Ctrl+F", action: t("shortcuts.find") },
          { key: "Ctrl+Shift+F", action: t("shortcuts.searchPanel") },
          { key: "Ctrl+,", action: t("shortcuts.settings") },
          { key: "Ctrl+P", action: t("shortcuts.print") },
          { key: "Ctrl+D", action: t("shortcuts.toggleBookmark") },
          { key: "Ctrl+G", action: t("shortcuts.goToLine") },
        ] as shortcut (shortcut.key)}
          <div class="hp-shortcut-row flex items-center gap-2.5 px-1 py-1 text-[12px] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
            <kbd class="hp-key inline-flex min-w-[56px] items-center justify-center whitespace-nowrap rounded border-[length:0.5px] border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-fg [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]">{shortcut.key}</kbd>
            <span class="hp-action flex-1 text-fg-secondary">{shortcut.action}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- 标签页操作 -->
    <section class="hp-section mb-3">
      <h3 class="hp-section-title mb-0.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{t("float.helpTabsTitle")}</h3>
      <ul class="hp-list m-0 list-none px-2 py-0">
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">📑</span>
          <span class="hp-item-text flex-1">{t("float.helpTabsClick")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">🗑</span>
          <span class="hp-item-text flex-1">{t("float.helpTabsClose")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">↩️</span>
          <span class="hp-item-text flex-1">{t("float.helpTabsRightClick")}</span>
        </li>
      </ul>
    </section>

    <!-- 批注功能 -->
    <section class="hp-section mb-3">
      <h3 class="hp-section-title mb-0.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{t("float.helpAnnotationsTitle")}</h3>
      <ul class="hp-list m-0 list-none px-2 py-0">
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">📝</span>
          <span class="hp-item-text flex-1">{t("float.helpAnnotationsSelect")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">✏️</span>
          <span class="hp-item-text flex-1">{t("float.helpAnnotationsTypes")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">🤖</span>
          <span class="hp-item-text flex-1">{t("float.helpAnnotationsAI")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">🔍</span>
          <span class="hp-item-text flex-1">{t("float.helpAnnotationsReview")}</span>
        </li>
      </ul>
    </section>

    <!-- 搜索功能 -->
    <section class="hp-section mb-3">
      <h3 class="hp-section-title mb-0.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{t("float.helpSearchTitle")}</h3>
      <ul class="hp-list m-0 list-none px-2 py-0">
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">🔍</span>
          <span class="hp-item-text flex-1">{t("float.helpSearchDoc")}</span>
        </li>
        <li class="hp-item flex items-start gap-2 px-1 py-[5px] text-[12px] leading-[1.4] text-fg-secondary hover:rounded hover:bg-float-rail-icon-hover-bg">
          <span class="hp-item-icon w-[18px] shrink-0 text-center text-[14px]">📁</span>
          <span class="hp-item-text flex-1">{t("float.helpSearchFolder")}</span>
        </li>
      </ul>
    </section>
  </div>
</div>
