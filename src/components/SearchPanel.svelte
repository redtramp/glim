<script lang="ts">
/**
 * SearchPanel.svelte — 全文搜索面板（防抖检索 / 分组结果 / 关键字高亮）。
 *
 * - defineExpose → 导出 focusInput 与 query（Svelte 组件实例即 exports 对象）
 * - watch(visible) → $effect（firstRun 区分“挂载即打开”与“后续打开”）
 */
import { untrack } from "svelte";
import { t } from "../i18n/locale.svelte.ts";
import {
  searchInFiles,
  nextSearchSession,
  type SearchMatch,
} from "../composables/useGlobalSearch";

interface Props {
  visible: boolean;
  rootDir: string;
  onClose?: () => void;
  onOpen?: (path: string, line: number) => void;
  onQueryChange?: (query: string) => void;
}

let { visible, rootDir, onClose, onOpen, onQueryChange }: Props = $props();

let query = $state("");
let caseSensitive = $state(false);
let loading = $state(false);
let results = $state<SearchMatch[]>([]);
let error = $state("");
let inputRef: HTMLInputElement | null = $state(null);

/** 供外部在面板打开后调用，将焦点移入输入框 */
export function focusInput(): void {
  inputRef?.focus();
  inputRef?.select();
}
// 实时查询值：以 getter 暴露，外部读取到的始终是当前输入
export { query };

const grouped = $derived.by(() => {
  const map: Record<string, SearchMatch[]> = {};
  for (const m of results) {
    (map[m.rel_path] ||= []).push(m);
  }
  return Object.entries(map).map(([rel, matches]) => ({ rel, matches }));
});

let runSeq = 0;

async function run() {
  error = "";
  if (!rootDir) {
    error = t("search.openFolderFirst");
    results = [];
    return;
  }
  const q = query.trim();
  if (!q) {
    results = [];
    return;
  }
  const seq = ++runSeq;
  const session = nextSearchSession();
  loading = true;
  try {
    const data = await searchInFiles(rootDir, q, caseSensitive, 500, session);
    if (seq !== runSeq) return; // 已有更新的搜索请求，丢弃过期结果
    results = data;
  } catch (e: unknown) {
    if (seq !== runSeq) return;
    error = String((e as { message?: string })?.message ?? e);
    results = [];
  } finally {
    if (seq === runSeq) loading = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function onInput(evt: Event) {
  query = (evt.currentTarget as HTMLInputElement).value;
  onQueryChange?.(query); // 实时同步查询，供父组件保存到 lastSearchQuery
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 220);
}

function onKey(evt: KeyboardEvent) {
  if (evt.key === "Enter") run();
}

function toggleCase() {
  caseSensitive = !caseSensitive;
  run();
}

/** 高亮结果中命中片段（返回 HTML，供 {@html} 渲染） */
function highlight(text: string, q: string): string {
  if (!q) return escapeHtml(text);
  const flags = caseSensitive ? "g" : "gi";
  const escQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escQ, flags);
  const parts: string[] = [];
  let last = 0;
  text.replace(re, (m, offset) => {
    parts.push(escapeHtml(text.slice(last, offset)));
    // Tailwind 工具类写在生成的 HTML 里即可被扫描进产物（无全局 mark 规则）
    parts.push(`<mark class="${MARK_CLASS}">${escapeHtml(m)}</mark>`);
    last = offset + m.length;
    return m;
  });
  parts.push(escapeHtml(text.slice(last)));
  return parts.join("");
}

const MARK_CLASS = "bg-search-hl-bg text-search-hl-fg px-[1px] rounded-sm";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 面板打开：焦点移入输入框并把当前查询同步给父组件（原 watch(visible, 非 immediate)）
let firstRun = true;
$effect(() => {
  const v = visible;
  const ref = inputRef;
  const isFirst = firstRun;
  firstRun = false;
  if (!v || ref === null) return;
  ref.focus();
  ref.select();
  if (!isFirst) untrack(() => onQueryChange?.(query));
});

/* .ic 与 .ic.active 各自带完整 bg/text —— 同名工具类同 layer 内顺序不可控；
   且原样式 .ic.active 在 .ic:hover 之后，激活态悬停不变色，故 active 不带 hover:* */
const icBase = "ic cursor-pointer rounded border border-transparent px-2 py-[3px] text-[12px]";
const icNormal = icBase + " bg-transparent text-fg hover:bg-bg-btn-hover";
// active 为外部标记类（原 :class="{ active }"），必须保留在 class 串里
const icActive = icBase + " active bg-active text-link";
</script>

{#if visible}
  <div class="search-panel flex h-full flex-col bg-toolbar">
    <div class="header flex gap-1 border-b border-border p-2">
      <input
        bind:this={inputRef}
        type="text"
        value={query}
        placeholder={t("search.placeholder")}
        class="input min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-[13px] text-fg outline-none focus:border-link"
        oninput={onInput}
        onkeydown={onKey}
      />
      <button
        class={caseSensitive ? icActive : icNormal}
        title={t("find.caseSensitive")}
        onclick={toggleCase}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 5h11a4 4 0 010 8H3" />
          <path d="M3 19h11a4 4 0 000-8H3" />
          <path d="M15 5v14" />
        </svg>
      </button>
      <button class={icNormal} title={t("find.close")} onclick={() => onClose?.()}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
    <div class="status border-b border-border px-3 py-1.5 text-[12px] text-fg-muted">
      {#if loading}
        <span>{t("search.searching")}</span>
      {:else if error}
        <span class="error">{error}</span>
      {:else if query.trim() && results.length === 0}
        <span>{t("search.noMatches")}</span>
      {:else if results.length > 0}
        <span>
          {results.length} {t("search.matches")} · {grouped.length} {t("search.files")}
        </span>
      {:else}
        <span class="muted">{t("search.typeToSearch")}</span>
      {/if}
    </div>
    <div class="results min-h-0 flex-1 overflow-auto text-[12px]">
      {#each grouped as g (g.rel)}
        <div class="group my-1">
          <div
            class="group-title sticky top-0 z-[1] overflow-hidden text-ellipsis whitespace-nowrap border-b border-border bg-toolbar px-3 py-1 font-medium text-link"
            title={g.rel}
          >
            {g.rel}
          </div>
          {#each g.matches as m (m.path + ":" + m.line + ":" + m.column)}
            <div
              class="item flex cursor-pointer gap-2 overflow-hidden whitespace-nowrap py-1 pl-5 pr-3 text-fg hover:bg-bg-btn-hover"
              role="presentation"
              onclick={() => onOpen?.(m.path, m.line)}
            >
              <span class="ln shrink-0 text-fg-muted">L{m.line}</span>
              <span
                class="preview min-w-0 flex-1 overflow-hidden text-ellipsis [font-family:ui-monospace,SFMono-Regular,Consolas,monospace]"
                >{@html highlight(m.preview, query)}</span
              >
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
