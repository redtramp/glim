<script lang="ts">
  import { t } from "../i18n/locale.svelte.ts";

  interface Props {
    oldContent: string;
    newContent: string;
    fileName: string;
    visible: boolean;
    onClose?: () => void;
  }

  let { oldContent, newContent, fileName, visible, onClose }: Props = $props();

  interface DiffLine {
    type: "added" | "removed" | "unchanged";
    text: string;
  }

  /**
   * 基于 LCS（最长公共子序列）计算行级差异。
   * 使用 O(m×n) DP 表，由 4M 保护阈值控制大文件退化。
   */
  function computeDiff(oldText: string, newText: string): DiffLine[] {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const m = a.length;
    const n = b.length;

    // 超大文件保护：超过阈值时退化为整体替换，避免 O(m×n) 内存膨胀卡死
    if (m * n > 4_000_000) {
      const lines: DiffLine[] = [];
      for (const line of a) lines.push({ type: "removed", text: line });
      for (const line of b) lines.push({ type: "added", text: line });
      return lines;
    }

    // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0)
    );
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] =
          a[i] === b[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const result: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        result.push({ type: "unchanged", text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: "removed", text: a[i] });
        i++;
      } else {
        result.push({ type: "added", text: b[j] });
        j++;
      }
    }
    while (i < m) result.push({ type: "removed", text: a[i++] });
    while (j < n) result.push({ type: "added", text: b[j++] });
    return result;
  }

  const diffLines = $derived.by<DiffLine[]>(() => {
    if (!visible) return [];
    return computeDiff(oldContent, newContent);
  });

  const hasChanges = $derived(
    diffLines.some((l) => l.type === "added" || l.type === "removed")
  );

  /** 行背景：原 .diff-line.added / .diff-line.removed 嵌套规则 */
  const rowBg: Record<DiffLine["type"], string> = {
    added: "bg-diff-add-bg",
    removed: "bg-diff-remove-bg",
    unchanged: "",
  };
  /** 符号色：原 .diff-line.added .diff-sign / .diff-line.removed .diff-sign */
  const signColor: Record<DiffLine["type"], string> = {
    added: "text-diff-add",
    removed: "text-diff-remove",
    unchanged: "text-fg-muted",
  };

  /** 仅点击遮罩本身才关闭，等价原内层 @click.stop 的效果 */
  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onClose?.();
  }
</script>

{#if visible}
  <div
    class="diff-overlay fixed inset-0 z-[101] flex items-center justify-center bg-overlay"
    role="presentation"
    onclick={handleOverlayClick}
  >
    <div
      class="diff-view flex max-h-[80vh] w-[min(700px,90vw)] flex-col overflow-hidden rounded-lg border border-border bg-bg text-fg shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
    >
      <div class="diff-header flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 class="diff-title m-0 text-[15px] font-semibold">{t("diff.title")}</h3>
        <span
          class="diff-filename flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[13px] text-fg-muted"
          >{fileName}</span
        >
        <button
          class="diff-close flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-fg-muted transition-[color,background-color] duration-150 ease-[ease] hover:bg-bg-btn-hover hover:text-fg"
          data-action="close"
          aria-label={t("diff.close")}
          onclick={() => onClose?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="diff-content flex-1 overflow-auto py-3">
        {#if !hasChanges}
          <div class="diff-empty p-5 text-center text-[13px] text-fg-muted">{t("diff.noChanges")}</div>
        {:else}
          <div
            class="diff-lines font-[family-name:var(--reader-font-family,monospace)] text-[13px] leading-[1.5]"
          >
            {#each diffLines as line, idx (idx)}
              <div class={"diff-line " + line.type + " flex items-stretch " + rowBg[line.type]}>
                <span class={"diff-sign shrink-0 basis-6 select-none text-center " + signColor[line.type]}>{line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}</span>
                <span class="diff-text flex-1 whitespace-pre-wrap break-words px-3">{line.text}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
