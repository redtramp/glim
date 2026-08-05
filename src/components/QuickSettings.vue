<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useReadingSettings } from "../composables/useReadingSettings";

const props = defineProps<{
  theme: "light" | "dark";
  fontSize: number;
  floatLayoutEnabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-theme"): void;
  (e: "open-settings"): void;
  (e: "zoom-in"): void;
  (e: "zoom-out"): void;
  (e: "set-max-width", width: number): void;
  (e: "set-line-height", height: number): void;
  (e: "toggle-float-layout"): void;
}>();

const { t } = useI18n();
const { settings } = useReadingSettings();

const themeLabel = computed(() =>
  props.theme === "dark" ? t("float.lightMode") : t("float.darkMode")
);

const MAX_WIDTH_PRESETS = [
  { label: "float.widthNarrow", value: 600 },
  { label: "float.widthMedium", value: 750 },
  { label: "float.widthWide", value: 900 },
];

const LINE_HEIGHT_PRESETS = [
  { label: "float.lineHeightTight", value: 1.4 },
  { label: "float.lineHeightNormal", value: 1.75 },
  { label: "float.lineHeightRelaxed", value: 2.0 },
];
</script>

<template>
  <div class="qs">
    <div class="qs-header">{{ t("float.quickSettings") }}</div>

    <div class="qs-body">
      <div class="qs-row">
        <span class="qs-label">{{ t("float.theme") }}</span>
        <button class="qs-btn" @click="emit('toggle-theme')">{{ themeLabel }}</button>
      </div>

      <div class="qs-row">
        <span class="qs-label">{{ t("float.fontSize") }}</span>
        <div class="qs-control">
          <button class="qs-btn qs-icon-btn" :disabled="fontSize <= 10" @click="emit('zoom-out')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <span class="qs-value">{{ fontSize }}</span>
          <button class="qs-btn qs-icon-btn" :disabled="fontSize >= 28" @click="emit('zoom-in')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>

      <div class="qs-row">
        <span class="qs-label">{{ t("float.maxWidth") }}</span>
        <div class="qs-btn-group">
          <button
            v-for="preset in MAX_WIDTH_PRESETS"
            :key="preset.value"
            class="qs-btn"
            :class="{ active: settings.maxWidth === preset.value }"
            @click="emit('set-max-width', preset.value)"
          >{{ t(preset.label) }}</button>
        </div>
      </div>

      <div class="qs-row">
        <span class="qs-label">{{ t("float.lineHeight") }}</span>
        <div class="qs-btn-group">
          <button
            v-for="preset in LINE_HEIGHT_PRESETS"
            :key="preset.value"
            class="qs-btn"
            :class="{ active: Math.abs(settings.lineHeight - preset.value) < 0.01 }"
            @click="emit('set-line-height', preset.value)"
          >{{ t(preset.label) }}</button>
        </div>
      </div>

      <div class="qs-row">
        <span class="qs-label">{{ t("float.floatLayout") }}</span>
        <button class="qs-btn" :class="{ active: floatLayoutEnabled }" @click="emit('toggle-float-layout')">
          {{ floatLayoutEnabled ? t("float.floatLayoutOn") : t("float.floatLayoutOff") }}
        </button>
      </div>
    </div>

    <div class="qs-footer">
      <button class="qs-link-btn" @click="emit('open-settings')">
        {{ t("float.fullSettings") }}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.qs { flex: 1; display: flex; flex-direction: column; min-height: 0; font-size: 13px; }
.qs-header {
  flex: 0 0 auto; padding: 12px 16px 8px; border-bottom: 1px solid var(--float-panel-header-border);
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--float-panel-header-fg);
}
.qs-body { flex: 1; overflow-y: auto; padding: 8px 16px; display: flex; flex-direction: column; gap: 12px; }
.qs-row { display: flex; align-items: center; gap: 10px; }
.qs-label { flex: 0 0 60px; font-size: 12px; color: var(--fg-muted); white-space: nowrap; }
.qs-control { display: flex; align-items: center; gap: 6px; }
.qs-value { min-width: 24px; text-align: center; font-size: 12px; color: var(--fg); font-variant-numeric: tabular-nums; }
.qs-btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
.qs-btn {
  padding: 3px 10px; font-size: 12px; border: 1px solid var(--border); border-radius: 5px;
  background: var(--bg-btn); color: var(--fg); cursor: pointer; white-space: nowrap;
}
.qs-btn:hover { background: var(--bg-btn-hover); }
.qs-btn.active { background: var(--bg-active); border-color: var(--link); color: var(--link); }
.qs-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.qs-icon-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; }
.qs-footer {
  flex: 0 0 auto; padding: 8px 16px 12px; border-top: 1px solid var(--float-panel-header-border);
  display: flex; justify-content: flex-end;
}
.qs-link-btn {
  display: flex; align-items: center; padding: 4px 12px; font-size: 12px;
  border: 1px solid var(--border); border-radius: 5px; background: transparent; color: var(--link); cursor: pointer;
}
.qs-link-btn:hover { background: var(--bg-active); }
</style>