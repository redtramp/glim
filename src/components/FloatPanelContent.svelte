<script lang="ts">
/**
 * FloatPanelContent.svelte — 悬浮左侧面板内容分发器（按 activeLeftPanel 切换 7 种面板）。
 *
 * - Vue `defineProps`（16 个）/ `defineEmits`（18 个）→ `$props()` + `onXxx` 回调 props
 * - 8 个子组件 import 全部指向已迁移的 `.svelte`（Ruling 1）
 * - `ref<HTMLElement>("treeScrollEl")` → `$state` + `bind:this`
 * - 无 `<style>` 块：Task 12 已将原 legacy-components.css 的
 *   `float-panel-header/body`、`tree-scroll`、`empty-tip` 逐条译为工具类
 *   （类名 token 保留，供 JS/测试查询；FileTree 测试 mock 依赖 .tree-scroll）
 */
import FloatingPanel from "./FloatingPanel.svelte";
import FileTree from "./FileTree.svelte";
import HistoryPanel from "./HistoryPanel.svelte";
import AnnotationList from "./AnnotationList.svelte";
import BookmarkPanel from "./BookmarkPanel.svelte";
import AiPanelInline from "./AiPanelInline.svelte";
import QuickSettings from "./QuickSettings.svelte";
import HelpPanel from "./HelpPanel.svelte";
import { t } from "../i18n/locale.svelte.ts";
import type { LeftPanelID } from "../composables/useFloatLayout.svelte.ts";
import type { TreeNode } from "../composables/useFileTree.svelte.ts";
import type { RecentItem } from "../composables/useHistory";
import type { AiPanelState, AiAction } from "../composables/useAiPanel.svelte.ts";

interface Props {
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
  /** App.vue 仍传入，但 Vue 版模板自始未引用 —— 只声明不解构（noUnusedLocals） */
  showSettings: boolean;
  aiPanel: { state: AiPanelState };
  onOpenFile?: (path: string) => void;
  onGoUp?: () => void;
  onOpen?: (path: string) => void;
  onRefreshRecent?: () => void;
  onAnnotationFocus?: (id: number) => void;
  onOpenReview?: () => void;
  onCopyAi?: () => void;
  onBookmarkJump?: (path: string, scrollTop: number) => void;
  onRunAiAction?: (action: AiAction) => void;
  onApplyAiResult?: () => void;
  onToggleTheme?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSetMaxWidth?: (v: number) => void;
  onSetLineHeight?: (v: number) => void;
  onToggleFloatLayout?: () => void;
  onOpenSettings?: () => void;
  onRefreshBookmarks?: () => void;
}

let {
  floatState,
  isMobile,
  rootDir,
  tree,
  currentFile,
  canGoUp,
  treeFocusKey,
  loadChildren,
  recentFiltered,
  draftContent,
  theme,
  isEditing,
  readingSettings,
  floatLayoutEnabled,
  aiPanel,
  onOpenFile,
  onGoUp,
  onOpen,
  onRefreshRecent,
  onAnnotationFocus,
  onOpenReview,
  onCopyAi,
  onBookmarkJump,
  onRunAiAction,
  onApplyAiResult,
  onToggleTheme,
  onZoomIn,
  onZoomOut,
  onSetMaxWidth,
  onSetLineHeight,
  onToggleFloatLayout,
  onOpenSettings,
  onRefreshBookmarks,
}: Props = $props();

/** 文件树滚动容器（原 Vue `ref="treeScrollEl"`，交 FileTree 做滚动定位） */
let treeScrollEl = $state<HTMLElement | null>(null);
</script>

<FloatingPanel
  visible={!!floatState.activeLeftPanel}
  side={isMobile ? "bottom" : "left"}
  width={320}
  onClose={floatState.closePanel}
>
  {#if floatState.activeLeftPanel === "filetree"}
    <div class="float-panel-header flex-none px-4 pt-3 pb-2 text-xs uppercase tracking-[0.6px] text-float-panel-header-fg border-b border-float-panel-header-border">{t("float.filetree")}</div>
    <div class="float-panel-body tree-scroll flex-1 min-h-0 overflow-auto flex flex-col" bind:this={treeScrollEl}>
      {#if rootDir}
        <FileTree
          nodes={tree}
          currentPath={currentFile}
          scrollContainer={treeScrollEl}
          canGoUp={canGoUp}
          focusKey={treeFocusKey}
          rootDir={rootDir}
          loadChildren={loadChildren}
          onOpen={onOpenFile}
          onGoUp={onGoUp}
        />
      {:else}
        <div class="empty-tip p-4 text-xs text-fg-muted text-center">{t("app.openFolderHint")}</div>
      {/if}
    </div>
  {:else if floatState.activeLeftPanel === "history"}
    <HistoryPanel items={recentFiltered} currentPath={currentFile} onOpen={onOpen} onClear={onRefreshRecent} />
  {:else if floatState.activeLeftPanel === "annotations"}
    <AnnotationList
      source={draftContent}
      fileName={currentFile}
      onFocus={onAnnotationFocus}
      onOpenReview={onOpenReview}
      onCopyAi={onCopyAi}
    />
  {:else if floatState.activeLeftPanel === "bookmark"}
    <BookmarkPanel currentPath={currentFile} showCurrentOnly={true} onJump={onBookmarkJump} onRefresh={onRefreshBookmarks} />
  {:else if floatState.activeLeftPanel === "ai"}
    <AiPanelInline
      selectionText={aiPanel.state.selectionText}
      result={aiPanel.state.result}
      loading={aiPanel.state.loading}
      error={aiPanel.state.error}
      activeAction={aiPanel.state.activeAction}
      onRunAction={onRunAiAction}
      onApplyResult={onApplyAiResult}
      onClose={floatState.closePanel}
    />
  {:else if floatState.activeLeftPanel === "settings"}
    <QuickSettings
      theme={theme}
      fontSize={isEditing ? readingSettings.editorFontSize : readingSettings.fontSize}
      floatLayoutEnabled={floatLayoutEnabled}
      onToggleTheme={onToggleTheme}
      onOpenSettings={onOpenSettings}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onSetMaxWidth={onSetMaxWidth}
      onSetLineHeight={onSetLineHeight}
      onToggleFloatLayout={onToggleFloatLayout}
    />
  {:else if floatState.activeLeftPanel === "help"}
    <HelpPanel />
  {/if}
</FloatingPanel>
