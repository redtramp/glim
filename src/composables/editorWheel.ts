/**
 * 编辑器滚轮回退（WebKitGTK/Wayland）：
 * 部分环境下原生 wheel 无法驱动嵌套滚动容器（tauri-apps/tauri#14427），
 * 但脚本写 scrollTop 仍然有效（方向键滚动、scrollToLine 走的就是这条路径）。
 * 这里只做判定和换算，DOM 事件绑定留给组件：
 * - 把“上一个 wheel 之后滚动位置没变、且当时不在可滚边界”视为原生未生效；
 * - 连续命中 threshold 次后永久接管，把 deltaX/deltaY 换算成 scrollTop/scrollLeft；
 * - 原生正常的平台完全不干预（不改位置、不 preventDefault）；
 * - 首个 wheel 只能建立基准，因此接管至少发生在第 threshold + 1 个事件。
 */

/** 判定原生滚动失效所需的连续未滚动次数（避开位置滞后一帧的误判） */
export const WHEEL_TAKEOVER_THRESHOLD = 2;

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/** 每个 delta 单位对应的像素数（DOM_DELTA_LINE / DOM_DELTA_PAGE） */
export function wheelUnit(e: WheelLike, scroller: HTMLElement): number {
  if (e.deltaMode === 1) return 16;
  if (e.deltaMode === 2) return scroller.clientHeight || 1;
  return 1;
}

/** 该方向是否已经到边界（此时原生无可滚动量，不能算作失效） */
export function wheelAtBoundary(e: WheelLike, scroller: HTMLElement): boolean {
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (e.deltaY < 0 && scroller.scrollTop <= 0) return true;
  if (e.deltaY > 0 && scroller.scrollTop >= maxTop) return true;
  return false;
}

/** 按 wheel delta 滚动容器；真正发生了位移才返回 true */
export function scrollByWheel(e: WheelLike, scroller: HTMLElement): boolean {
  const unit = wheelUnit(e, scroller);
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const top = Math.min(Math.max(0, scroller.scrollTop + e.deltaY * unit), maxTop);
  const left = Math.min(Math.max(0, scroller.scrollLeft + e.deltaX * unit), maxLeft);
  if (top === scroller.scrollTop && left === scroller.scrollLeft) return false;
  scroller.scrollTop = top;
  scroller.scrollLeft = left;
  return true;
}

export interface WheelFallback {
  /** 是否已接管滚轮（原生失效后永久为 true） */
  readonly takeover: boolean;
  /**
   * 处理一次 wheel：返回 true 表示已由脚本滚动，调用方应 preventDefault。
   * 未接管且原生可能生效时返回 false，交给浏览器原生滚动。
   */
  handle(e: WheelLike, scroller: HTMLElement): boolean;
  reset(): void;
}

export function createWheelFallback(
  threshold: number = WHEEL_TAKEOVER_THRESHOLD
): WheelFallback {
  let misses = 0;
  let takeover = false;
  let last: { top: number; left: number; stuck: boolean } | null = null;

  return {
    get takeover() {
      return takeover;
    },
    handle(e: WheelLike, scroller: HTMLElement) {
      if (takeover) return scrollByWheel(e, scroller);
      const top = scroller.scrollTop;
      const left = scroller.scrollLeft;
      if (last && !last.stuck && top === last.top && left === last.left) {
        misses += 1;
      } else if (last) {
        misses = 0;
      }
      last = { top, left, stuck: wheelAtBoundary(e, scroller) };
      if (misses < threshold) return false;
      takeover = true;
      return scrollByWheel(e, scroller);
    },
    reset() {
      misses = 0;
      takeover = false;
      last = null;
    },
  };
}
