/**
 * lazyComponent — 通用「按需加载组件模块」加载器。
 *
 * 用途:把重依赖组件(如 CodeMirror 编辑器)移出应用启动路径,改为首次需要时
 * 动态 import,避免其随首屏静态加载阻塞主线程。
 *
 * 语义:
 * - 幂等:已成功加载后 ensure() 立即 resolve,不再触发 import;
 * - in-flight 去重:并发调用共享同一次 import Promise(加载期间只发起一次真实 import);
 * - 失败可重试:加载失败时重置状态并记录错误,下一次 ensure() 重新尝试,
 *   避免一次瞬时失败让功能永久不可用。
 *
 * 与 Svelte 解耦:加载成功后经 onLoaded 回调交给调用方写入其响应式状态,
 * 便于独立单测(不依赖组件运行时)。
 */
export interface LazyLoader {
  /** 确保组件已加载(幂等);返回的 Promise 在本次加载结束(成功或失败)后 resolve。 */
  ensure(): Promise<void>;
  /** 是否已成功加载 */
  readonly loaded: boolean;
}

export function createLazyLoader<C>(
  load: () => Promise<{ default: C }>,
  onLoaded: (component: C) => void
): LazyLoader {
  let inFlight: Promise<void> | null = null;
  let loaded = false;

  function ensure(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (!inFlight) {
      inFlight = load()
        .then((mod) => {
          onLoaded(mod.default);
          loaded = true;
        })
        .catch((e) => {
          // 重置以便下次重试;此处吞掉 rejection,使 ensure() 始终 resolve
          inFlight = null;
          console.error("lazy component load failed:", e);
        });
    }
    return inFlight;
  }

  return {
    ensure,
    get loaded() {
      return loaded;
    },
  };
}
