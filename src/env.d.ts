/// <reference types="vite/client" />

declare module "markdown-it-footnote" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }>;
  export default plugin;
}

/* Tauri 全局 API 类型声明 */
interface TauriEventPayload {
  paths: string[];
  kind: string;
}

interface TauriEvents {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
}

interface TauriWebviewWindow {
  print(): Promise<void>;
  isFullscreen(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
}

interface TauriWebview {
  WebviewWindow: {
    getByLabel(label: string): TauriWebviewWindow | null;
  };
}

interface TauriGlobal {
  events?: TauriEvents;
  webview?: TauriWebview;
}

interface Window {
  __TAURI__?: TauriGlobal;
}