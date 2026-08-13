<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="help-panel">
    <div class="hp-header">
      <span class="hp-title">{{ t("float.help") }}</span>
    </div>
    <div class="hp-body">
      <!-- 使用方式 -->
      <section class="hp-section">
        <h3 class="hp-section-title">{{ t("float.helpUsageTitle") }}</h3>
        <ul class="hp-list">
          <li class="hp-item">
            <span class="hp-item-icon">📄</span>
            <span class="hp-item-text">{{ t("float.helpUsageOpen") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">📂</span>
            <span class="hp-item-text">{{ t("float.helpUsageFolder") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">✏️</span>
            <span class="hp-item-text">{{ t("float.helpUsageEdit") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">⇩</span>
            <span class="hp-item-text">{{ t("float.helpUsageExport") }}</span>
          </li>
        </ul>
      </section>

      <!-- 快捷键 -->
      <section class="hp-section">
        <h3 class="hp-section-title">{{ t("float.helpShortcutsTitle") }}</h3>
        <div class="hp-shortcuts">
          <div
            v-for="shortcut in [
              { key: 'Ctrl+S', action: t('shortcuts.save') },
              { key: 'Ctrl+N', action: t('shortcuts.newFile') },
              { key: 'Ctrl+O', action: t('shortcuts.openFile') },
              { key: 'Ctrl+E', action: t('shortcuts.toggleMode') },
              { key: 'Ctrl+F', action: t('shortcuts.find') },
              { key: 'Ctrl+Shift+F', action: t('shortcuts.searchPanel') },
              { key: 'Ctrl+,', action: t('shortcuts.settings') },
              { key: 'Ctrl+P', action: t('shortcuts.print') },
              { key: 'Ctrl+D', action: t('shortcuts.toggleBookmark') },
              { key: 'Ctrl+G', action: t('shortcuts.goToLine') },
            ]"
            :key="shortcut.key"
            class="hp-shortcut-row"
          >
            <kbd class="hp-key">{{ shortcut.key }}</kbd>
            <span class="hp-action">{{ shortcut.action }}</span>
          </div>
        </div>
      </section>

      <!-- 标签页操作 -->
      <section class="hp-section">
        <h3 class="hp-section-title">{{ t("float.helpTabsTitle") }}</h3>
        <ul class="hp-list">
          <li class="hp-item">
            <span class="hp-item-icon">📑</span>
            <span class="hp-item-text">{{ t("float.helpTabsClick") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">🗑</span>
            <span class="hp-item-text">{{ t("float.helpTabsClose") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">↩️</span>
            <span class="hp-item-text">{{ t("float.helpTabsRightClick") }}</span>
          </li>
        </ul>
      </section>

      <!-- 批注功能 -->
      <section class="hp-section">
        <h3 class="hp-section-title">{{ t("float.helpAnnotationsTitle") }}</h3>
        <ul class="hp-list">
          <li class="hp-item">
            <span class="hp-item-icon">📝</span>
            <span class="hp-item-text">{{ t("float.helpAnnotationsSelect") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">✏️</span>
            <span class="hp-item-text">{{ t("float.helpAnnotationsTypes") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">🤖</span>
            <span class="hp-item-text">{{ t("float.helpAnnotationsAI") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">🔍</span>
            <span class="hp-item-text">{{ t("float.helpAnnotationsReview") }}</span>
          </li>
        </ul>
      </section>

      <!-- 搜索功能 -->
      <section class="hp-section">
        <h3 class="hp-section-title">{{ t("float.helpSearchTitle") }}</h3>
        <ul class="hp-list">
          <li class="hp-item">
            <span class="hp-item-icon">🔍</span>
            <span class="hp-item-text">{{ t("float.helpSearchDoc") }}</span>
          </li>
          <li class="hp-item">
            <span class="hp-item-icon">📁</span>
            <span class="hp-item-text">{{ t("float.helpSearchFolder") }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.help-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.hp-header {
  padding: 12px 12px 8px;
  border-bottom: 0.5px solid var(--float-rail-separator);
}

.hp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}

.hp-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.hp-section {
  margin-bottom: 12px;
}

.hp-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 12px;
  margin-bottom: 2px;
}

.hp-list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
}

.hp-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 4px;
  font-size: 12px;
  color: var(--fg-secondary);
  line-height: 1.4;
}

.hp-item:hover {
  background: var(--float-rail-icon-hover-bg);
  border-radius: 4px;
}

.hp-item-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.hp-item-text {
  flex: 1;
}

.hp-shortcuts {
  padding: 4px 8px;
}

.hp-shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px;
  font-size: 12px;
  color: var(--fg-secondary);
}

.hp-shortcut-row:hover {
  background: var(--float-rail-icon-hover-bg);
  border-radius: 4px;
}

.hp-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 2px 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--fg);
  background: var(--bg-elevated);
  border: 0.5px solid var(--border);
  border-radius: 4px;
  white-space: nowrap;
}

.hp-action {
  flex: 1;
  color: var(--fg-secondary);
}
</style>
