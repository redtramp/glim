/**
 * AnnotationToolbar 定位计算（纯函数,便于单测）。
 *
 * 输入:选区坐标 (x=选区中心、y=选区底部)、工具栏自身尺寸与视口尺寸。
 * 输出:工具栏左上角位置,已做视口夹紧与翻转:
 * - 水平以 x 为中心,超出一侧视口时夹紧到边缘;
 * - 垂直默认在选区下方(y+gap);下方放不下且上方有空间时翻转到上方,
 *   否则夹紧到视口底部。
 */

export interface ToolbarPositionOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}

export function computeToolbarPosition(
  opts: ToolbarPositionOptions
): { left: number; top: number } {
  const gap = opts.gap ?? 10;
  const margin = opts.margin ?? 8;
  const width = Math.min(opts.width, opts.viewportWidth - margin * 2);

  let left = opts.x - width / 2;
  left = Math.max(margin, Math.min(left, opts.viewportWidth - width - margin));

  const below = opts.y + gap;
  let top = below;
  if (below + opts.height > opts.viewportHeight - margin) {
    const above = opts.y - opts.height - gap;
    if (above >= margin) {
      top = above;
    } else {
      top = Math.max(margin, opts.viewportHeight - opts.height - margin);
    }
  }
  return { left, top };
}
