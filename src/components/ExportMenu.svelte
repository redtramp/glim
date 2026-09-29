<script lang="ts">
  import { t } from "../i18n/locale.svelte.ts";

  interface Props {
    visible: boolean;
    pandocInfo: { available: boolean } | null;
    pdfEnginePath: string | null;
    onExportHtml?: () => void;
    onExportDocx?: () => void;
    onExportPdf?: () => void;
    onPrint?: () => void;
    onClose?: () => void;
  }

  let {
    visible,
    pandocInfo,
    pdfEnginePath,
    onExportHtml,
    onExportDocx,
    onExportPdf,
    onPrint,
    onClose,
  }: Props = $props();

  /** .menu-item 全部条目共用（原 scoped CSS 的 .menu-item 规则整块转工具类） */
  const itemClass =
    "menu-item flex w-full flex-col gap-0.5 cursor-pointer whitespace-nowrap border-none bg-transparent px-4 py-1.5 text-left text-fg hover:bg-bg-btn-hover focus-visible:bg-bg-btn-hover focus-visible:outline-none disabled:cursor-default disabled:opacity-50 disabled:text-fg-muted";
  /** .mi-hint 次要说明行 */
  const hintClass = "text-[11px] text-fg-muted";

  let menuEl = $state<HTMLElement | null>(null);
  /** 打开前处于焦点的元素（通常是工具栏导出按钮），关闭时归还焦点 */
  let restoreFocusTo: HTMLElement | null = null;
  /** 按 Tab 离开菜单时不归还焦点（让浏览器把焦点移到下一个控件） */
  let suppressRestore = false;
  /** 跳过挂载首跑，等价 Vue watch 的默认非 immediate 语义 */
  let firstRun = true;

  function menuItems(): HTMLButtonElement[] {
    if (!menuEl) return [];
    return Array.from(
      menuEl.querySelectorAll<HTMLButtonElement>("button.menu-item:not(:disabled)")
    );
  }

  function focusItem(index: number): void {
    const items = menuItems();
    if (!items.length) return;
    items[(index + items.length) % items.length]?.focus();
  }

  function restoreFocus(): void {
    if (suppressRestore) {
      // Tab 关闭：焦点已由浏览器移到下一控件，不抢回
      suppressRestore = false;
      restoreFocusTo = null;
      return;
    }
    if (restoreFocusTo && document.contains(restoreFocusTo)) restoreFocusTo.focus();
    restoreFocusTo = null;
  }

  /** 键盘导航：方向键在条目间移动，Home/End 跳首尾，ESC 关闭，Tab 关闭并移出菜单 */
  function onKeydown(e: KeyboardEvent): void {
    const items = menuItems();
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        onClose?.();
        break;
      case "Tab":
        // 让原生 Tab 把焦点移到下一个控件；关闭菜单但不抢回焦点
        suppressRestore = true;
        onClose?.();
        break;
      case "ArrowDown":
        e.preventDefault();
        focusItem(currentIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(currentIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
    }
  }

  $effect(() => {
    const isOpen = visible;
    if (firstRun) {
      firstRun = false;
      return;
    }
    if (isOpen) {
      restoreFocusTo = document.activeElement as HTMLElement | null;
      // $effect 已在 DOM 更新后执行，等价 Vue 的 nextTick 聚焦首项
      menuItems()[0]?.focus();
    } else {
      restoreFocus();
    }
  });
</script>

{#if visible}
  <div
    id="export-menu"
    bind:this={menuEl}
    class="fixed right-3 top-11 z-[70] min-w-60 rounded-md border border-border bg-bg-toolbar py-1 text-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
    role="menu"
    tabindex="-1"
    aria-label={t("export.export")}
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKeydown}
  >
    <button class={itemClass} role="menuitem" onclick={() => onExportHtml?.()}>
      <span class="text-[12px] font-medium">{t("export.html")}</span>
      <span class={hintClass}>{t("export.htmlHint")}</span>
    </button>
    <button
      class={itemClass}
      role="menuitem"
      disabled={!pandocInfo?.available}
      title={!pandocInfo?.available ? t("export.docxRequiresPandoc") : ""}
      onclick={() => onExportDocx?.()}
    >
      <span class="text-[12px] font-medium">{t("export.docx")}</span>
      <span class={hintClass}>
        {pandocInfo?.available ? t("export.docxHint") : t("export.docxRequiresPandoc")}
      </span>
    </button>
    <button
      class={itemClass}
      role="menuitem"
      title={pdfEnginePath ? t("app.usePath", { path: pdfEnginePath }) : t("app.specifyEdgePath")}
      onclick={() => onExportPdf?.()}
    >
      <span class="text-[12px] font-medium">{t("export.pdf")}</span>
      <span class={hintClass}>
        {pdfEnginePath ? t("export.pdfHint") : t("export.pdfNoEdge")}
      </span>
    </button>
    <div class="my-1 h-px bg-border" aria-hidden="true"></div>
    <button
      class={itemClass}
      role="menuitem"
      onclick={() => {
        onPrint?.();
        onClose?.();
      }}
    >
      <span class="text-[12px] font-medium">{t("export.print")}</span>
      <span class={hintClass}>{t("export.printHint")}</span>
    </button>
  </div>
{/if}
