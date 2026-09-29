import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type FileChangeHandler = (paths: string[]) => void;

export function useFileWatcher() {
  // 保留 .value 访问形状：$state box 替代 vue ref
  const watching = $state<{ value: string }>({ value: "" });
  /** 当前 watcher 会话内已注册的额外监听目录（watch_path），避免同一目录重复 IPC */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 过程内注册去重集合，无响应式依赖（与原 vue 行为一致）
  const registeredPaths = new Set<string>();
  let unlisten: UnlistenFn | null = null;

  async function start(root: string, handler: FileChangeHandler) {
    await stop();
    // Rust 侧 stop_watch 会丢弃整个 debouncer，历史 watch_path 注册全部失效
    registeredPaths.clear();
    await invoke("start_watch", { root });
    unlisten = await listen<string[]>(
      "glim-reader://file-changed",
      (event) => {
        handler(event.payload);
      }
    );
    watching.value = root;
  }

  async function stop() {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    if (watching.value) {
      try {
        await invoke("stop_watch");
      } catch {
        /* ignore */
      }
      watching.value = "";
    }
    registeredPaths.clear();
  }

  /**
   * 追加监听单个目录（NonRecursive）：打开文件后监听其所在目录，检测外部修改。
   * - 无活动 watcher 时跳过（Rust 侧 watch_path 同样为空操作）；
   * - 同一会话内重复注册直接跳过，避免 N 个文件同目录时重复 IPC。
   */
  async function watchFile(path: string) {
    if (!watching.value || registeredPaths.has(path)) return;
    registeredPaths.add(path);
    try {
      await invoke("watch_path", { path });
    } catch {
      registeredPaths.delete(path); // 失败允许后续重试
    }
  }

  // 旧 onUnmounted → 调用方显式调用 stop()（单测直接调用 stop）

  return { watching, start, stop, watchFile };
}
