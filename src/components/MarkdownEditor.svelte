<script lang="ts">
  /**
   * MarkdownEditor.vue → .svelte 迁移要点:
   * - defineExpose({ focus, openSearch, ... }) → 顶层 `export function`，
   *   父级用 bind:this 取实例后直接调用（App.vue 的 editorRef.getTopVisibleLine 等）
   * - ref<HTMLElement | null> → $state + bind:this；view 保持普通 let（CodeMirror 非响应式）
   * - onMounted/onBeforeUnmount → onMount/onDestroy
   * - watch(modelValue) → $effect 内比较 view.state.doc 后再 replaceDoc
   * - watch(theme/readonly/overrides) → $effect + 首跑跳过（原 Vue watch 非 immediate）
   *   ⚠️ 必须在首跑 return 之前先读依赖，否则不会注册跟踪，之后永不重跑
   * - emit("update:modelValue"/"ready"/"toggle-mode") → onUpdateModelValue/onReady/onToggleMode
   * - 原来把 MutationObserver 挂在 host DOM 上清理，改为普通 let，行为等价
   * - scoped CSS → Tailwind（markdown-editor* 三个类在全局 CSS 中无消费方）
   */
  import { onMount, onDestroy } from "svelte";
  import { basicSetup } from "codemirror";
  import {
    Compartment,
    EditorSelection,
    EditorState,
    Prec,
    type ChangeSpec,
    type Extension,
    type SelectionRange,
  } from "@codemirror/state";
  import { EditorView, keymap, drawSelection } from "@codemirror/view";
  import { indentWithTab } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import {
    getSearchQuery,
    gotoLine,
    openSearchPanel,
    search,
    searchKeymap,
    searchPanelOpen,
  } from "@codemirror/search";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
  import { useShortcuts } from "../composables/useShortcuts";

  interface Props {
    modelValue: string;
    theme: "light" | "dark";
    readonly?: boolean;
    currentFile?: string;
    onUpdateModelValue?: (value: string) => void;
    onReady?: () => void;
    onToggleMode?: () => void;
  }

  let {
    modelValue,
    theme,
    readonly,
    currentFile,
    onUpdateModelValue,
    onReady,
    onToggleMode,
  }: Props = $props();

  let host: HTMLElement | null = $state(null);
  let searchCounter = $state({ visible: false, current: 0, total: 0 });
  let view: EditorView | null = null;
  let searchCounterTimer: number | null = null;
  // eslint-disable-next-line no-undef
  let fontObserver: MutationObserver | null = null;

  const themeCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const keymapCompartment = new Compartment();
  const fontFamilyCompartment = new Compartment();
  const shortcuts = useShortcuts();
  const { getBinding, toCodeMirror } = shortcuts;
  const replacePanelTheme = EditorView.baseTheme({
    ".cm-panel.cm-search [name=replace]": {
      display: "inline-block",
    },
    ".cm-panel.cm-search [name=replaceAll]": {
      display: "inline-block",
    },
  });

  const editorBaseTheme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--bg)",
      color: "var(--fg)",
    },
    ".cm-scroller": {
      fontSize: "var(--editor-font-size, 14px)",
      lineHeight: "1.65",
    },
    ".cm-content": {
      padding: "24px 0 80px",
    },
    ".cm-line": {
      padding: "0 16px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-toolbar)",
      color: "var(--fg-muted)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--editor-active-line-bg, rgba(0, 0, 0, 0.03))",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--bg-active)",
      color: "var(--link)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--editor-selection-bg, rgba(9, 105, 218, 0.3))",
    },
    ".cm-search": {
      backgroundColor: "var(--bg-toolbar)",
      color: "var(--fg)",
      borderTop: "1px solid var(--border)",
    },
    ".cm-search input": {
      backgroundColor: "var(--bg)",
      color: "var(--fg)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      outline: "none",
    },
    ".cm-search button": {
      backgroundColor: "var(--bg-btn)",
      color: "var(--fg)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      cursor: "pointer",
    },
    ".cm-search button:hover": {
      backgroundColor: "var(--bg-btn-hover)",
    },
  });

  function themeExtension(): Extension {
    return theme === "dark" ? [oneDark, editorBaseTheme] : [editorBaseTheme];
  }

  function editableExtension() {
    return EditorView.editable.of(!readonly);
  }

  function updateSearchCounter() {
    if (!view || !searchPanelOpen(view.state)) {
      searchCounter = { visible: false, current: 0, total: 0 };
      return;
    }
    const query = getSearchQuery(view.state);
    if (!query.valid || !query.search) {
      searchCounter = { visible: true, current: 0, total: 0 };
      return;
    }
    const selection = view.state.selection.main;
    const cursor = query.getCursor(view.state, 0, view.state.doc.length);
    let total = 0;
    let current = 0;
    let firstAfterSelection = 0;
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      total += 1;
      const match = next.value;
      if (match.from === selection.from && match.to === selection.to)
        current = total;
      if (!firstAfterSelection && match.from >= selection.from)
        firstAfterSelection = total;
    }
    if (!current) current = firstAfterSelection || (total ? 1 : 0);
    searchCounter = {
      visible: true,
      current,
      total,
    };
  }

  function scheduleSearchCounterUpdate() {
    if (!view) return;
    if (searchCounterTimer !== null) window.clearTimeout(searchCounterTimer);
    searchCounterTimer = window.setTimeout(() => {
      searchCounterTimer = null;
      updateSearchCounter();
    }, 80);
  }

  function focusSearchInput() {
    if (!view) return;
    window.requestAnimationFrame(() => {
      const root = view?.dom.parentElement ?? host;
      const input = root?.querySelector<HTMLInputElement>(
        '.cm-search [main-field="true"], .cm-search input[name="search"], .cm-search input'
      );
      input?.focus();
      input?.select();
      updateSearchCounter();
    });
  }

  function buildKeymap() {
    return Prec.highest(
      keymap.of([
        {
          key: toCodeMirror(getBinding("highlight")),
          run: () => wrapSelection("<mark>", "</mark>"),
        },
        { key: toCodeMirror(getBinding("bold")), run: () => wrapSelection("**") },
        {
          key: toCodeMirror(getBinding("italic")),
          run: () => wrapSelection("*"),
        },
        {
          key: toCodeMirror(getBinding("underline")),
          run: () => wrapSelection("<u>", "</u>"),
        },
        {
          key: toCodeMirror(getBinding("inline-code")),
          run: () => wrapSelection("`"),
        },
        {
          key: toCodeMirror(getBinding("toggle-mode")),
          run: () => {
            onToggleMode?.();
            return true;
          },
        },
        {
          key: toCodeMirror(getBinding("find")),
          run: () => {
            openSearch();
            return true;
          },
        },
        {
          key: toCodeMirror(getBinding("replace")),
          run: () => {
            openReplace();
            return true;
          },
        },
      ])
    );
  }

  function getEditorFontFamily(): string {
    return (
      // eslint-disable-next-line no-undef
      getComputedStyle(document.documentElement)
        .getPropertyValue("--editor-font-family")
        .trim() ||
      'ui-monospace, SFMono-Regular, "JetBrains Mono", "Cascadia Code", Consolas, monospace'
    );
  }

  function fontFamilyExtension(): Extension {
    return EditorView.theme({
      ".cm-scroller": {
        fontFamily: getEditorFontFamily(),
      },
    });
  }

  function createEditor() {
    if (!host) return;
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: modelValue,
        extensions: [
          basicSetup,
          drawSelection(),
          markdown(),
          search({ top: true }),
          replacePanelTheme,
          fontFamilyCompartment.of(fontFamilyExtension()),
          keymapCompartment.of(buildKeymap()),
          keymap.of([indentWithTab, ...searchKeymap]),
          themeCompartment.of(themeExtension()),
          editableCompartment.of(editableExtension()),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onUpdateModelValue?.(update.state.doc.toString());
            }
            if (
              update.docChanged ||
              update.selectionSet ||
              update.transactions.length
            ) {
              scheduleSearchCounterUpdate();
            }
          }),
        ],
      }),
    });
    onReady?.();
    updateSearchCounter();
  }

  function replaceDoc(value: string) {
    if (!view) return;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    if (!view) return false;
    const state = view.state;
    const changes: ChangeSpec[] = [];
    const ranges: SelectionRange[] = [];
    let offset = 0;
    for (const range of state.selection.ranges) {
      const selected = state.sliceDoc(range.from, range.to);
      const insert = `${prefix}${selected}${suffix}`;
      changes.push({ from: range.from, to: range.to, insert });
      const from = range.from + offset + prefix.length;
      const to = from + selected.length;
      ranges.push(
        selected ? EditorSelection.range(from, to) : EditorSelection.cursor(from)
      );
      offset += prefix.length + suffix.length;
    }
    view.dispatch({
      changes,
      selection: EditorSelection.create(ranges),
      scrollIntoView: true,
      userEvent: "input",
    });
    view.focus();
    return true;
  }

  /** 父级经 bind:this 调用：暴露为组件导出方法 */
  export function focus() {
    view?.focus();
  }

  export function openSearch() {
    if (!view) return;
    openSearchPanel(view);
    focusSearchInput();
  }

  export function openReplace() {
    openSearch();
  }

  export function goToLine() {
    if (!view) return;
    gotoLine(view);
  }

  export function getTopVisibleLine(): number {
    if (!view) return 1;
    const scroller = view.scrollDOM;
    const block = view.lineBlockAtHeight(scroller.scrollTop);
    return view.state.doc.lineAt(block.from).number;
  }

  export function scrollToLine(line: number) {
    if (!view) return;
    const target = Math.min(Math.max(1, line), view.state.doc.lines);
    const pos = view.state.doc.line(target).from;
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start" }),
    });
    view.focus();
  }

  function formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function getImageDir(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    const i = normalized.lastIndexOf("/");
    const baseDir = i < 0 ? "" : normalized.slice(0, i);
    return baseDir ? `${baseDir}/images` : "images";
  }

  function handlePaste(e: ClipboardEvent) {
    if (!currentFile || !view) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const pos = view.state.selection.main.from;
          void insertPastedImage(file, pos);
          return;
        }
      }
    }
  }

  async function insertPastedImage(file: File, pos: number) {
    if (!view) return;
    try {
      const ext = file.type
        ? (file.type.split("/")[1] || "png").toLowerCase()
        : "png";
      const fileName = `paste-${formatTimestamp(new Date())}.${ext}`;
      const imageDir = getImageDir(currentFile || "");
      await mkdir(imageDir, { recursive: true });
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(`${imageDir}/${fileName}`, bytes);
      const markdown = `![](images/${fileName})\n`;
      view.dispatch({
        changes: { from: pos, insert: markdown },
        selection: { anchor: pos + markdown.length },
      });
      view.focus();
    } catch (err) {
      console.error("paste image failed", err);
    }
  }

  onMount(() => {
    createEditor();
    host?.addEventListener("paste", handlePaste, true);

    // 字体族跟随 CSS 变量（写在 documentElement 的 style 上）热更新
    // eslint-disable-next-line no-undef
    fontObserver = new MutationObserver(() => {
      if (view) {
        view.dispatch({ effects: fontFamilyCompartment.reconfigure(fontFamilyExtension()) });
      }
    });
    fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  });

  onDestroy(() => {
    host?.removeEventListener("paste", handlePaste, true);
    fontObserver?.disconnect();
    fontObserver = null;
    view?.destroy();
    view = null;
    if (searchCounterTimer !== null) {
      window.clearTimeout(searchCounterTimer);
      searchCounterTimer = null;
    }
  });

  /* 外部 modelValue → 文档（比较后再 dispatch，避免自触发循环） */
  $effect(() => {
    const value = modelValue;
    if (!view || value === view.state.doc.toString()) return;
    replaceDoc(value);
  });

  /* 主题切换：原 watch 非 immediate，首跑仅注册依赖 */
  let themeSynced = false;
  $effect(() => {
    theme;
    if (!themeSynced) {
      themeSynced = true;
      return;
    }
    view?.dispatch({ effects: themeCompartment.reconfigure(themeExtension()) });
  });

  /* 只读开关：原 watch 非 immediate */
  let readonlySynced = false;
  $effect(() => {
    readonly;
    if (!readonlySynced) {
      readonlySynced = true;
      return;
    }
    view?.dispatch({ effects: editableCompartment.reconfigure(editableExtension()) });
  });

  /* 快捷键覆盖变化 → 重建 keymap；store 总是整体替换 overrides 对象，浅读即可跟踪 */
  let overridesSynced = false;
  $effect(() => {
    shortcuts.overrides;
    if (!overridesSynced) {
      overridesSynced = true;
      return;
    }
    view?.dispatch({ effects: keymapCompartment.reconfigure(buildKeymap()) });
  });
</script>

<div class="markdown-editor-shell relative h-full min-h-0 overflow-hidden">
  <div class="markdown-editor h-full min-h-0 overflow-hidden" bind:this={host}></div>
  {#if searchCounter.visible}
    <div class="editor-find-counter pointer-events-none absolute top-[58px] right-4 z-[8] min-w-[44px] rounded-[6px] border border-border bg-toolbar px-2 py-1 text-center text-[12px] text-fg-muted shadow-[0_4px_12px_rgba(0,0,0,0.12)]">{searchCounter.current}/{searchCounter.total}</div>
  {/if}
</div>
