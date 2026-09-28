/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
  /**
   * 过渡期兜底:svelte-check 不解析 .vue,而 AnnotationToolbar.vue 导出的
   * 共享类型被 useAnnotations.ts / AnnotationToolbar.test.ts 以具名类型导入。
   * 此处按原联合类型声明以保住类型安全;AnnotationToolbar.vue 转 .svelte 后
   * 改从组件导入,本条即可删除。
   */
  export type AnnotationToolbarMode = "" | import("./composables/criticMarkup").CriticType;
}

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