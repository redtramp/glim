<script lang="ts">
  /**
   * MarkdownEditor 测试替身（仅测试用）。
   *
   * AppMount 测试用它替换真实 MarkdownEditor，验证 App 的「按需加载编辑器」接线
   * （进入编辑模式后动态 import 并渲染），同时避免在 jsdom 中加载/初始化 CodeMirror。
   * 暴露与真实组件一致的实例方法签名，供 bind:this 调用。
   */
  interface Props {
    modelValue?: string;
    theme?: string;
    currentFile?: string;
    onUpdateModelValue?: (v: string) => void;
    onToggleMode?: () => void;
  }
  let { modelValue = "" }: Props = $props();

  export function focus(): void {}
  export function openSearch(): void {}
  export function openReplace(): void {}
  export function goToLine(): void {}
  export function getTopVisibleLine(): number {
    return 1;
  }
  export function scrollToLine(_line: number): void {}
</script>

<div class="markdown-editor-stub" data-len={modelValue.length}></div>
