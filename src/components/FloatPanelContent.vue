<template>
  <FloatingPanel
    :visible="!!floatState.activeLeftPanel"
    :side="isMobile ? 'bottom' : 'left'"
    :width="320"
    @close="floatState.closePanel"
  >
    <template v-if="floatState.activeLeftPanel === 'filetree'">
      <div class="float-panel-header">{{ t("float.filetree") }}</div>
      <div class="float-panel-body tree-scroll" ref="treeScrollEl">
        <FileTree
          v-if="rootDir"
          :nodes="tree" :current-path="currentFile" :scroll-container="treeScrollEl"
          :can-go-up="canGoUp" :focus-key="treeFocusKey"
          :root-dir="rootDir" :load-children="loadChildren"
          @open="emit('openFile', $event)" @go-up="emit('goUp')"
        />
        <div v-else class="empty-tip">{{ t("app.openFolderHint") }}</div>
      </div>
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'history'">
      <HistoryPanel :items="recentFiltered" :current-path="currentFile" @open="p => emit('open', p)" @clear="emit('refreshRecent')" />
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'annotations'">
      <AnnotationList :source="draftContent" :file-name="currentFile"
                      @focus="emit('annotationFocus', $event)" @open-review="emit('openReview')"
                      @copy-ai="() => emit('copyAi')" />
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'bookmark'">
      <BookmarkPanel :current-path="currentFile" :show-current-only="true"
                     @jump="(p, s) => emit('bookmarkJump', p, s)" @refresh="emit('refreshBookmarks')" />
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'ai'">
      <AiPanelInline
        :selection-text="aiPanel.state.selectionText" :result="aiPanel.state.result"
        :loading="aiPanel.state.loading" :error="aiPanel.state.error"
        :active-action="aiPanel.state.activeAction"
        @run-action="(a) => emit('runAiAction', a)"
        @apply-result="() => emit('applyAiResult')"
        @close="floatState.closePanel"
      />
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'settings'">
      <QuickSettings
        :theme="theme"
        :font-size="isEditing ? readingSettings.editorFontSize : readingSettings.fontSize"
        :float-layout-enabled="floatLayoutEnabled"
        @toggle-theme="emit('toggleTheme')"
        @open-settings="emit('openSettings')"
        @zoom-in="emit('zoomIn')" @zoom-out="emit('zoomOut')"
        @set-max-width="emit('setMaxWidth', $event)" @set-line-height="emit('setLineHeight', $event)"
        @toggle-float-layout="emit('toggleFloatLayout')"
      />
    </template>
    <template v-else-if="floatState.activeLeftPanel === 'help'">
      <HelpPanel />
    </template>
  </FloatingPanel>
</template>

<script setup lang="ts">
import FloatingPanel from "./FloatingPanel.vue";
import FileTree from "./FileTree.vue";
import HistoryPanel from "./HistoryPanel.vue";
import AnnotationList from "./AnnotationList.vue";
import BookmarkPanel from "./BookmarkPanel.vue";
import AiPanelInline from "./AiPanelInline.vue";
import QuickSettings from "./QuickSettings.vue";
import HelpPanel from "./HelpPanel.vue";
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import type { LeftPanelID } from "../composables/useFloatLayout";
import type { TreeNode } from "../composables/useFileTree";
import type { RecentItem } from "../stores/useHistoryStore";
import type { AiPanelState, AiAction } from "../composables/useAiPanel";

const { t } = useI18n();
const treeScrollEl = ref<HTMLElement | null>(null);

defineProps<{
  floatState: { activeLeftPanel: LeftPanelID | null; closePanel: () => void };
  isMobile: boolean;
  rootDir: string | null;
  tree: TreeNode[];
  currentFile: string;
  canGoUp: boolean;
  treeFocusKey: number;
  loadChildren: (dir: TreeNode) => Promise<void>;
  recentFiltered: RecentItem[];
  draftContent: string;
  theme: "light" | "dark";
  isEditing: boolean;
  readingSettings: { editorFontSize: number; fontSize: number };
  floatLayoutEnabled: boolean;
  showSettings: boolean;
  aiPanel: { state: AiPanelState };
}>();

const emit = defineEmits<{
  (e: "openFile", path: string): void;
  (e: "goUp"): void;
  (e: "open", path: string): void;
  (e: "refreshRecent"): void;
  (e: "annotationFocus", id: number): void;
  (e: "openReview"): void;
  (e: "copyAi"): void;
  (e: "bookmarkJump", path: string, scrollTop: number): void;
  (e: "runAiAction", action: AiAction): void;
  (e: "applyAiResult"): void;
  (e: "toggleTheme"): void;
  (e: "zoomIn"): void;
  (e: "zoomOut"): void;
  (e: "setMaxWidth", v: number): void;
  (e: "setLineHeight", v: number): void;
  (e: "toggleFloatLayout"): void;
  (e: "openSettings"): void;
  (e: "refreshBookmarks"): void;
}>();
</script>
