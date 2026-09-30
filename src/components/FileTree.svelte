<script lang="ts">
/**
 * FileTree.svelte — 文件树（懒加载子级，点击三角展开）。
 *
 * 展开状态由本组件自行维护：默认全部折叠，切换根目录/外部聚焦信号时整体重置。
 */
import { t } from "../i18n/locale.svelte.ts";
import type { TreeNode } from "../composables/useFileTree.svelte.ts";
// 自引用：目录节点递归渲染下一级
import FileTree from "./FileTree.svelte";

interface Props {
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
  onOpen?: (path: string) => void;
  onGoUp?: () => void;
}

let {
  nodes,
  currentPath,
  depth = 0,
  scrollContainer = null,
  canGoUp = false,
  focusKey = 0,
  rootDir = "",
  loadChildren,
  onOpen,
  onGoUp,
}: Props = $props();

/** 展开状态：未记录 = 折叠（默认全部折叠），点击三角展开 */
let expanded = $state<Record<string, boolean>>({});

function toggle(key: string) {
  expanded[key] = !expanded[key];
}

/** 点击目录行：若尚未加载子级则先懒加载（仅下一级），加载成功后再切换展开 */
async function onDirClick(node: TreeNode) {
  if (!node.loaded && loadChildren) {
    try {
      await loadChildren(node);
    } catch {
      return; // 加载失败：不展开，错误由 useFileTree 暴露
    }
  }
  toggle(node.path);
}

function scrollToActive() {
  if (!scrollContainer) return;
  const active = scrollContainer.querySelector(
    ".row.file.active"
  ) as HTMLElement | null;
  if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// currentPath 变化（打开/切换文档）：滚动定位当前文件（树保持折叠，不自动展开）
// 首次运行只记录基线，等价 Vue watch 的非 immediate 行为
let prevPath: string | null = null;
$effect(() => {
  const path = currentPath;
  if (prevPath === null) {
    prevPath = path;
    return;
  }
  if (path === prevPath) return;
  prevPath = path;
  if (path) setTimeout(scrollToActive, 50);
});

// 根目录/外部信号变化：树数据源整体更换，旧展开状态失效，全部折叠
const treeKey = $derived(rootDir + " " + focusKey);
let prevTreeKey: string | null = null;
$effect(() => {
  const key = treeKey;
  if (prevTreeKey === null) {
    prevTreeKey = key;
    return;
  }
  if (key === prevTreeKey) return;
  prevTreeKey = key;
  expanded = {};
});

/** 行内缩进：目录 12px/级 + 8px，文件 12px/级 + 22px */
function rowPad(isDir: boolean): string {
  return "padding-left: " + ((depth || 0) * 12 + (isDir ? 8 : 22)) + "px";
}

/** 行配色：激活态用激活配色，否则行配色 + hover（原 `.row:hover` 对目录/文件均生效） */
function rowState(active: boolean): string {
  if (active) {
    return "bg-[var(--tree-row-active-bg)] text-[var(--tree-row-active-color)] shadow-[var(--tree-row-active-shadow)]";
  }
  return "text-[var(--tree-row-color)] hover:bg-[var(--tree-row-hover-bg)]";
}

/** 名称配色：激活 > 目录 > 文件 */
function nameState(active: boolean, isDir: boolean): string {
  if (active) return "text-[var(--tree-row-active-color)]";
  return isDir
    ? "font-medium text-[var(--tree-dir-color)]"
    : "text-[var(--tree-file-color)]";
}
</script>

<ul class="tree {depth ? '' : 'root'} m-0 list-none {depth ? 'p-0' : 'py-1'} text-[13px]">
  {#if depth === 0 && canGoUp}
    <li class="tree-item" title={t("app.goUp")}>
      <div
        class="row dir go-up mb-[2px] flex cursor-pointer items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap border-b border-b-[var(--border)] px-2 py-[3px] select-none {rowState(false)}"
        role="presentation"
        onclick={() => onGoUp?.()}
      >
        <span
          class="caret flex h-3 w-3 items-center justify-center text-[var(--tree-caret-color)]"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="17 15 12 10 7 15" />
            <polyline points="17 9 12 4 7 9" />
          </svg>
        </span>
        <span class="name overflow-hidden text-ellipsis {nameState(false, true)}"
          >..</span
        >
      </div>
    </li>
  {/if}
  {#each nodes as node (node.path || node.name)}
    <li class="tree-item">
      {#if node.isDir}
        <div
          class="row dir flex cursor-pointer items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 py-[3px] select-none {rowState(
            false
          )} {expanded[node.path] ? '' : 'is-collapsed'}"
          style={rowPad(true)}
          role="presentation"
          onclick={() => onDirClick(node)}
        >
          <span
            class="caret flex h-3 w-3 items-center justify-center text-[var(--tree-caret-color)]"
          >
            {#if !expanded[node.path]}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            {:else}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            {/if}
          </span>
          <span
            class="name overflow-hidden text-ellipsis {nameState(false, true)}"
            >{node.name}</span
          >
        </div>
        {#if expanded[node.path] && node.children}
          <FileTree
            nodes={node.children}
            {currentPath}
            depth={(depth || 0) + 1}
            {scrollContainer}
            {loadChildren}
            {onOpen}
          />
        {/if}
      {:else}
        <div
          class="row file flex cursor-pointer items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 py-[3px] select-none {currentPath ===
          node.path
            ? 'active ' + rowState(true)
            : rowState(false)}"
          style={rowPad(false)}
          title={node.path}
          role="presentation"
          onclick={() => onOpen?.(node.path)}
        >
          <span
            class="name overflow-hidden text-ellipsis {nameState(
              currentPath === node.path,
              false
            )}">{node.name}</span
          >
        </div>
      {/if}
    </li>
  {/each}
</ul>
