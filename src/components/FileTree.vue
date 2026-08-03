<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import type { TreeNode } from "../composables/useFileTree";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    nodes: TreeNode[];
    currentPath: string;
    depth?: number;
    scrollContainer?: HTMLElement | null;
    /** 根层是否显示 `..` 上一级入口（由外部根据 rootDir 计算） */
    canGoUp?: boolean;
    /** 外部触发重置展开状态（如切换到上一级目录后），值变化时全部折叠 */
    focusKey?: number;
    /** 根目录：变化（切换文件夹/打开子目录文件）时重置展开状态 */
    rootDir?: string;
    /** 懒加载：展开目录时按需加载其直接子级（仅下一级，不递归） */
    loadChildren?: (node: TreeNode) => Promise<void>;
  }>(),
  {
    depth: 0,
    scrollContainer: null,
    canGoUp: false,
    focusKey: 0,
    rootDir: "",
    loadChildren: undefined,
  }
);

const emit = defineEmits<{
  (e: "open", path: string): void;
  (e: "go-up"): void;
}>();

/** 展开状态：未记录 = 折叠（默认全部折叠），点击三角展开 */
const expanded = ref<Record<string, boolean>>({});

function toggle(key: string) {
  expanded.value[key] = !expanded.value[key];
}

/** 点击目录行：若尚未加载子级则先懒加载（仅下一级），加载成功后再切换展开 */
async function onDirClick(node: TreeNode) {
  if (!node.loaded && props.loadChildren) {
    try {
      await props.loadChildren(node);
    } catch {
      return; // 加载失败：不展开，错误由 useFileTree 暴露
    }
  }
  toggle(node.path);
}

function scrollToActive() {
  const container = props.scrollContainer;
  if (!container) return;
  const active = container.querySelector(".row.file.active") as HTMLElement | null;
  if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// currentPath 变化（打开/切换文档）：滚动定位当前文件（树保持折叠，不自动展开）
watch(
  () => props.currentPath,
  () => {
    nextTick(() => {
      setTimeout(scrollToActive, 50);
    });
  }
);

// 根目录/外部信号变化：树数据源整体更换，旧展开状态失效，全部折叠
watch(
  () => props.rootDir,
  () => {
    expanded.value = {};
  }
);
watch(
  () => props.focusKey,
  () => {
    expanded.value = {};
  }
);
</script>

<template>
  <ul class="tree" :class="{ root: !depth }">
    <li
      v-if="depth === 0 && canGoUp"
      class="tree-item"
      :title="t('app.goUp')"
    >
      <div class="row dir go-up" @click="emit('go-up')">
        <span class="caret">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 15 12 10 7 15" />
            <polyline points="17 9 12 4 7 9" />
          </svg>
        </span>
        <span class="name">..</span>
      </div>
    </li>
    <li v-for="node in nodes" :key="node.path || node.name" class="tree-item">
      <template v-if="node.isDir">
        <div
          class="row dir"
          :class="{ 'is-collapsed': !expanded[node.path] }"
          :style="{ paddingLeft: (depth || 0) * 12 + 8 + 'px' }"
          @click="onDirClick(node)"
        >
          <span class="caret">
            <svg v-if="!expanded[node.path]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
          <span class="name">{{ node.name }}</span>
        </div>
        <FileTree
          v-if="expanded[node.path] && node.children"
          :nodes="node.children"
          :current-path="currentPath"
          :depth="(depth || 0) + 1"
          :scroll-container="scrollContainer"
          :load-children="loadChildren"
          @open="(p) => emit('open', p)"
        />
      </template>
      <template v-else>
        <div
          class="row file"
          :class="{ active: currentPath === node.path }"
          :style="{ paddingLeft: (depth || 0) * 12 + 22 + 'px' }"
          :title="node.path"
          @click="emit('open', node.path)"
        >
          <span class="name">{{ node.name }}</span>
        </div>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
}
.tree.root {
  padding: 4px 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tree-row-color);
  user-select: none;
}
.row:hover {
  background: var(--tree-row-hover-bg);
}
.row.active {
  background: var(--tree-row-active-bg);
  color: var(--tree-row-active-color);
  box-shadow: var(--tree-row-active-shadow);
}
.caret {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--tree-caret-color);
}
.dir .name {
  font-weight: 500;
  color: var(--tree-dir-color);
}
.go-up {
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
}
.file .name {
  color: var(--tree-file-color);
}
.row.active .name {
  color: var(--tree-row-active-color);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
