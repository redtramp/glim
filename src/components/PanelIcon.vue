<script setup lang="ts">
import type { LeftPanelID } from "../composables/useFloatLayout";

const props = defineProps<{ name: LeftPanelID }>();

const ICON_PATHS: Record<LeftPanelID, string[]> = {
  filetree: [
    "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  ],
  history: [
    "M12 8v4l2.5 2.5",
    "M3.5 12a8.5 8.5 0 101.5-4.8",
    "M3.5 3.5v4h4",
  ],
  search: [
    "M11 19a8 8 0 100-16 8 8 0 000 16z",
    "M21 21l-4.35-4.35",
  ],
  annotations: [
    "M12 20h9",
    "M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  ],
  bookmark: [
    "M19 21l-7-4-7 4V5a2 2 0 012-2h10a2 2 0 012 2v16z",
  ],
  ai: [
    "M12 2l2.4 4.8L19 9l-4.6 2.2L12 16l-2.4-4.8L5 9l4.6-2.2L12 2z",
    "M19 15l1.2 2.3L22.5 18l-2.3 1.2L19 21.5l-1.2-2.3L15.5 18l2.3-1.2L19 15z",
  ],
  settings: [
    "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
    "M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 01-4 0v-.09a1.7 1.7 0 00-1.1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 010-4h.09a1.7 1.7 0 001.55-1.1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 012.83-2.83l.06.06a1.7 1.7 0 001.87.34h.02a1.7 1.7 0 001-1.55V3a2 2 0 014 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 012.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.02a1.7 1.7 0 001.55 1h.09a2 2 0 010 4h-.09a1.7 1.7 0 00-1.55 1z",
  ],
  "new-file": [
    "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z",
    "M14 3v6h6",
    "M12 12v6",
    "M9 15h6",
  ],
  "open-file": [
    "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z",
    "M14 3v6h6",
  ],
  "open-folder": [
    "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  ],
  export: [
    "M12 3v12",
    "M7 10l5-5 5 5",
    "M5 17h14",
    "M5 21h14",
  ],
  edit: [
    "M12 20h9",
    "M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  ],
};
</script>

<template>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-for="d in ICON_PATHS[props.name]" :key="d">
      <path :d="d" />
    </template>
  </svg>
</template>