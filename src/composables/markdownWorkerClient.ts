/**
 * markdown Web Worker 客户端(主线程侧)。
 *
 * 职责:
 * - 单例懒创建 Worker,请求按 id 关联 Promise,支持并发。
 * - 渲染(html+headings)与仅提取大纲(headings)两种请求,均可在 Worker 中执行;
 *   提取大纲单独走 headings-only 路径,避免为了大纲白白渲染 HTML。
 * - Worker 创建失败 / 渲染异常 / 超时时自动回退到主线程,保证功能永不因 Worker 故障而不可用。
 * - 同一 source 的并发请求合并(共享 in-flight Promise),避免重复渲染/重复 tokenize。
 *
 * ⚠️ 启动体积:主线程兜底引擎经**动态 import** 加载 markdownEngine,
 * 使 markdown-it 及其插件不再进入启动主线程包(仅 Worker 内或兜底时才拉取),
 * 配合 Worker 承担渲染与大纲提取,首屏主线程不再解析/执行 markdown-it。
 */
import type { Heading } from "./markdownEngine";
// 仅类型引用 markdown-it,不产生运行时依赖
import type MarkdownIt from "markdown-it";

export interface MarkdownRenderResult {
  html: string;
  headings: Heading[];
}

type Timer = ReturnType<typeof setTimeout>;

interface PendingRender {
  kind: "render";
  resolve: (r: MarkdownRenderResult) => void;
  reject: (e: unknown) => void;
  timer: Timer;
}
interface PendingHeadings {
  kind: "headings";
  resolve: (h: Heading[]) => void;
  reject: (e: unknown) => void;
  timer: Timer;
}
type PendingRequest = PendingRender | PendingHeadings;

const REQUEST_TIMEOUT_MS = 15_000;
/** Worker 崩溃后的冷却时间:期间回退主线程,避免热循环反复重建 */
const WORKER_RETRY_COOLDOWN_MS = 30_000;
/** 最大重建次数:超过后本会话内不再尝试 Worker */
const WORKER_MAX_RETRIES = 3;

let worker: Worker | null = null;
/** 下次允许重建 Worker 的时间戳(0 表示允许) */
let workerRetryAt = 0;
/** 已连续重建失败次数 */
let workerFailures = 0;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
/** source → in-flight Promise,用于并发请求合并 */
const inflightRender = new Map<string, Promise<MarkdownRenderResult>>();
const inflightHeadings = new Map<string, Promise<Heading[]>>();

// 主线程兜底引擎(Worker 不可用时使用)。markdownEngine 经动态 import 加载,
// 使 markdown-it 不进入启动主线程包(仅 Worker 或兜底时才拉取)。
let engineModulePromise: Promise<typeof import("./markdownEngine")> | null = null;
function loadEngineModule(): Promise<typeof import("./markdownEngine")> {
  if (!engineModulePromise) {
    engineModulePromise = import("./markdownEngine").catch((e) => {
      // chunk 拉取失败等瞬时错误不应永久污染后续兜底,重置以便重试
      engineModulePromise = null;
      throw e;
    });
  }
  return engineModulePromise;
}

// 主线程兜底渲染与大纲提取共用同一个 markdown-it 实例（配置一致，避免重复构建插件栈）
let fallbackMd: MarkdownIt | null = null;
async function ensureFallbackMd(): Promise<MarkdownIt> {
  if (!fallbackMd) {
    const { createMarkdownIt } = await loadEngineModule();
    fallbackMd = createMarkdownIt();
  }
  return fallbackMd;
}

function renderOnMainThread(source: string): Promise<MarkdownRenderResult> {
  return (async () => {
    const { renderMarkdownOnce } = await loadEngineModule();
    const md = await ensureFallbackMd();
    return renderMarkdownOnce(md, source);
  })();
}

function extractHeadingsOnMainThread(source: string): Promise<Heading[]> {
  return (async () => {
    const { extractHeadingsWith } = await loadEngineModule();
    const md = await ensureFallbackMd();
    return extractHeadingsWith(md, source);
  })();
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  // 冷却期或已达最大重建次数:回退主线程
  if (workerFailures >= WORKER_MAX_RETRIES || Date.now() < workerRetryAt) {
    return null;
  }
  try {
    const w = new Worker(
      new URL("../workers/markdown.worker.ts", import.meta.url),
      { type: "module", name: "markdown-renderer" }
    );
    worker = w;
    w.onerror = () => {
      // 冷却后允许重建(最多 WORKER_MAX_RETRIES 次)
      workerFailures += 1;
      workerRetryAt = Date.now() + WORKER_RETRY_COOLDOWN_MS;
      worker = null;
      failAllPending(new Error("markdown worker error"));
    };
    w.onmessage = (
      e: MessageEvent<{ id: number; html?: string; headings?: Heading[]; error?: string }>
    ) => {
      const { id, html, headings, error } = e.data;
      const req = pending.get(id);
      if (!req) return;
      clearTimeout(req.timer);
      pending.delete(id);
      if (error) {
        req.reject(new Error(error));
      } else if (req.kind === "headings") {
        req.resolve(headings ?? []);
      } else if (html == null) {
        req.reject(new Error("markdown worker returned empty result"));
      } else {
        req.resolve({ html, headings: headings ?? [] });
      }
    };
    return w;
  } catch {
    workerFailures += 1;
    workerRetryAt = Date.now() + WORKER_RETRY_COOLDOWN_MS;
    worker = null;
    return null;
  }
}

function failAllPending(reason: unknown): void {
  for (const [, req] of pending) {
    clearTimeout(req.timer);
    req.reject(reason);
  }
  pending.clear();
}

/** 在主线程或 Worker 中渲染 markdown(未净化),返回 HTML 与标题大纲 */
export function renderMarkdownOffThread(source: string): Promise<MarkdownRenderResult> {
  const existing = inflightRender.get(source);
  if (existing) return existing;

  const promise = new Promise<MarkdownRenderResult>((resolve, reject) => {
    const w = ensureWorker();
    if (!w) {
      // 回退主线程
      renderOnMainThread(source).then(resolve, reject);
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      // 超时回退主线程,避免无限等待
      renderOnMainThread(source).then(resolve, reject);
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { kind: "render", resolve, reject, timer });
    w.postMessage({ id, source });
  });

  inflightRender.set(source, promise);
  promise.then(
    () => inflightRender.delete(source),
    () => inflightRender.delete(source)
  );
  return promise;
}

/**
 * 仅提取标题大纲(Worker 优先,主线程兜底)。
 * 避免主线程在启动期同步 tokenize 大文档;Worker 走 headings-only 路径不渲染 HTML。
 */
export function extractHeadingsOffThread(source: string): Promise<Heading[]> {
  const existing = inflightHeadings.get(source);
  if (existing) return existing;

  const promise = new Promise<Heading[]>((resolve, reject) => {
    const w = ensureWorker();
    if (!w) {
      extractHeadingsOnMainThread(source).then(resolve, reject);
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      extractHeadingsOnMainThread(source).then(resolve, reject);
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { kind: "headings", resolve, reject, timer });
    w.postMessage({ id, source, headingsOnly: true });
  });

  inflightHeadings.set(source, promise);
  promise.then(
    () => inflightHeadings.delete(source),
    () => inflightHeadings.delete(source)
  );
  return promise;
}
