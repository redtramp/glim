/**
 * markdown Web Worker 客户端(主线程侧)。
 *
 * 职责:
 * - 单例懒创建 Worker,请求按 id 关联 Promise,支持并发。
 * - Worker 创建失败 / 渲染异常 / 超时时自动回退到主线程同步渲染,
 *   保证渲染功能永不因 Worker 故障而不可用。
 * - 同一 source 的并发请求合并(共享 in-flight Promise),避免重复渲染。
 */
import type { Heading } from "./markdownEngine";
import { createMarkdownIt, renderMarkdownOnce } from "./markdownEngine";

export interface MarkdownRenderResult {
  html: string;
  headings: Heading[];
}

interface PendingRequest {
  resolve: (r: MarkdownRenderResult) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

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
const inflight = new Map<string, Promise<MarkdownRenderResult>>();

// 主线程兜底引擎(Worker 不可用时使用)
let fallbackMd: ReturnType<typeof createMarkdownIt> | null = null;
function getFallbackMd() {
  if (!fallbackMd) fallbackMd = createMarkdownIt();
  return fallbackMd;
}

function renderOnMainThread(source: string): MarkdownRenderResult {
  const md = getFallbackMd();
  return renderMarkdownOnce(md, source);
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
  const existing = inflight.get(source);
  if (existing) return existing;

  const promise = new Promise<MarkdownRenderResult>((resolve, reject) => {
    const w = ensureWorker();
    if (!w) {
      // 回退主线程
      try {
        resolve(renderOnMainThread(source));
      } catch (e) {
        reject(e);
      }
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      try {
        // 超时回退主线程,避免无限等待
        resolve(renderOnMainThread(source));
      } catch (e) {
        reject(e);
      }
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ id, source });
  });

  inflight.set(source, promise);
  promise.finally(() => {
    inflight.delete(source);
  });
  return promise;
}
