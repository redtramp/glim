/**
 * 离屏 markdown-it 渲染（阶段二 Task 4）。
 *
 * 单一 CM6 视图下不再有 markdown-it 渲染的 `.markdown-body` 视图 DOM，
 * 但导出 HTML/DOCX/PDF 与打印仍需完整渲染结果（含 KaTeX / Mermaid / 图片路径改写 /
 * data-source-line 锚点）。本模块一次性生成临时离屏元素供现有导出管线消费，
 * 复用 MarkdownView.update() 的既有渲染顺序，保证导出功能零回退。
 *
 * 源文本只读，不改写；元素不挂到 document（渲染函数只 querySelector 容器内节点）。
 */
import {
  renderMarkdown,
  renderMath,
  renderMermaidAll,
} from "./useMarkdown";
import { rewriteImagesAndLinks } from "./useLinkRewriter";

/**
 * 生成一份完整渲染的离屏 `.markdown-body` 元素。
 *
 * @param source  Markdown 源文本（只读）
 * @param currentFile 当前文件路径（用于相对图片/链接解析）
 * @param rootDir 根目录（用于内部链接解析）
 * @throws 渲染失败时向上抛出，调用方负责展示错误
 */
export async function renderOffscreen(
  source: string,
  currentFile: string,
  rootDir: string,
): Promise<HTMLElement> {
  const el = document.createElement("article");
  el.className = "markdown-body";
  el.innerHTML = await renderMarkdown(source);

  // 离屏元素仅用于导出，内部链接跳转无消费者；仍透传上下文以正确改写图片 src。
  rewriteImagesAndLinks(
    el,
    { currentFile, rootDir },
    () => {},
  );
  await renderMath(el);
  // 导出/打印必须全量渲染 Mermaid（非 IntersectionObserver 懒渲染），
  // renderMermaidAll 内部走 force 分支且已有串行队列。
  await renderMermaidAll(el);

  return el;
}
