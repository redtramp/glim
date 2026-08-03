<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount } from "vue";
import {
  renderMarkdown,
  renderMath,
  renderMermaid,
} from "../composables/useMarkdown";
import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

const props = defineProps<{
  source: string;
  currentFile: string;
  rootDir: string;
  renderTick?: number;
}>();
const emit = defineEmits<{
  (e: "rendered", el: HTMLElement): void;
  (e: "internal-link", path: string, hash: string): void;
}>();

const html = ref<string>("");
const root = ref<HTMLElement | null>(null);

/** 渲染请求序号:仅最新一次 update 的结果被采用,避免快速切换时旧结果覆盖新内容 */
let renderSeq = 0;

async function update() {
  const seq = ++renderSeq;
  // 渲染期间保留旧内容,避免切换文档时白屏闪烁;新结果就绪后原子替换
  let renderedHtml: string;
  try {
    renderedHtml = await renderMarkdown(props.source);
  } catch (e) {
    console.error("markdown render failed:", e);
    if (seq !== renderSeq) return;
    html.value = `<pre class="mermaid-error">Markdown 渲染失败: ${String(
      (e as Error)?.message ?? e
    )}</pre>`;
    return;
  }
  if (seq !== renderSeq) return; // 已有更新的渲染请求,丢弃本次结果
  html.value = renderedHtml;
  await nextTick();
  if (seq !== renderSeq) return;
  if (root.value) {
    rewriteImagesAndLinks(
      root.value,
      { currentFile: props.currentFile, rootDir: props.rootDir },
      (path, hash) => emit("internal-link", path, hash)
    );
    await renderMath(root.value);
    await renderMermaid(root.value);
    if (seq !== renderSeq) return;
    emit("rendered", root.value);
  }
}

async function refreshThemeRender() {
  // 只重渲染 mermaid,不参与 markdown 渲染的请求序号,避免废弃进行中的渲染结果
  if (!root.value) return;
  await renderMermaid(root.value, true);
  emit("rendered", root.value);
}

onMounted(() => update());
watch(
  () => [props.source, props.currentFile, props.rootDir],
  () => update()
);
watch(
  () => props.renderTick,
  () => refreshThemeRender()
);

onBeforeUnmount(() => {
  renderSeq++;
});

defineExpose({ root });
</script>

<template>
  <article ref="root" class="markdown-body" v-html="html"></article>
</template>

<style scoped>
.markdown-body {
  padding: 32px 48px 80px;
  max-width: var(--reader-max-width, 900px);
  margin: 0 auto;
  line-height: var(--reader-line-height, 1.75);
  font-size: var(--reader-font-size, 16px);
  font-family: var(--reader-font-family, inherit);
  color: var(--fg);
}

:root[data-theme="dark"] .markdown-body {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
</style>
