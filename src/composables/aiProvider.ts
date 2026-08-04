/**
 * aiProvider.ts — 内置 AI 面板的配置与请求层（Phase 3）。
 *
 * 职责:
 * - AiSettings 配置:provider(ollama / openai 兼容)、baseUrl、apiKey、model、
 *   temperature、timeoutMs,localStorage 持久化(模式与 useReadingSettings 一致);
 * - buildChatRequest:纯函数构造请求(url/headers/body),可单测;
 * - chatComplete:统一入口,经 Tauri http 插件发出(Rust 侧 reqwest,
 *   同时绕过 webview CSP 与本地 Ollama 无 CORS 的限制),超时中止,错误归一为 AiError;
 * - 错误码:configMissing / authFailed / timeout / network / server。
 *
 * 网络层说明:必须走 @tauri-apps/plugin-http 的 fetch,不能用 webview fetch——
 * tauri.conf.json CSP 为 default-src 'self'(无 connect-src),且本地 Ollama
 * 默认不返回 CORS 头,webview fetch 会被双拦截。
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type AiProvider = "ollama" | "openai";

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiErrorCode =
  | "configMissing"
  | "authFailed"
  | "timeout"
  | "network"
  | "server";

/**
 * AI 请求错误。message 为通用描述(可作为兜底展示),detail 为附加详情
 * (服务端错误信息、截断后的底层异常等),UI 可按 code 映射 i18n 文案并拼接 detail。
 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly detail: string;

  constructor(code: AiErrorCode, message: string, detail = "") {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.detail = detail;
  }
}

const STORAGE = "glim-reader-ai";

export function defaultAiSettings(): AiSettings {
  return {
    enabled: false,
    provider: "ollama",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    model: "qwen2.5",
    temperature: 0.7,
    timeoutMs: 60000,
  };
}

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { ...defaultAiSettings(), ...JSON.parse(raw) };
  } catch {
    /* 损坏的配置回退默认 */
  }
  return defaultAiSettings();
}

export function setAiSettings(partial: Partial<AiSettings>): void {
  const next = { ...getAiSettings(), ...partial };
  localStorage.setItem(STORAGE, JSON.stringify(next));
}

export function resetAiSettings(): void {
  localStorage.removeItem(STORAGE);
}

/** 校验最小可用配置;返回错误码或 null(可用) */
export function validateAiSettings(s: AiSettings): AiErrorCode | null {
  if (!s.enabled) return "configMissing";
  if (!s.baseUrl.trim() || !s.model.trim()) return "configMissing";
  if (s.provider === "openai" && !s.apiKey.trim()) return "authFailed";
  return null;
}

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * 构造请求(纯函数)。
 * - ollama:POST {baseUrl}/api/chat,无鉴权头;
 * - openai:POST {baseUrl}/chat/completions(baseUrl 以 /v1 结尾时直接拼接),
 *   apiKey 非空时带 Authorization: Bearer。
 */
export function buildChatRequest(
  s: AiSettings,
  messages: AiMessage[]
): AiRequest {
  const base = s.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (s.provider === "openai") {
    const url = base.endsWith("/v1")
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
    if (s.apiKey.trim()) headers.Authorization = `Bearer ${s.apiKey.trim()}`;
    return {
      url,
      headers,
      body: {
        model: s.model,
        messages,
        temperature: s.temperature,
        stream: false,
      },
    };
  }
  return {
    url: `${base}/api/chat`,
    headers,
    body: { model: s.model, messages, temperature: s.temperature, stream: false },
  };
}

/** 截断服务端错误信息,避免把大段响应塞进 UI */
function truncate(msg: string, max = 200): string {
  return msg.length > max ? `${msg.slice(0, max)}…` : msg;
}

/** 从响应体提取 error.message(兼容 openai 与 ollama 的差异格式);raw 为响应文本,内部解析 */
function extractServerError(raw: string): string {
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return "";
  }
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (err && typeof err === "object") {
      const m = (err as Record<string, unknown>).message;
      if (typeof m === "string" && m) return m;
    }
    if (typeof err === "string" && err) return err;
    const m = b.message;
    if (typeof m === "string" && m) return m;
  }
  return "";
}

/**
 * 解析 provider 响应文本为最终回答内容;缺字段时抛 server 错误。
 * - openai:choices[0].message.content
 * - ollama:message.content
 */
function extractContent(raw: string, provider: AiProvider): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AiError("server", "AI 服务返回了无法解析的响应");
  }
  if (!data || typeof data !== "object") {
    throw new AiError("server", "AI 服务响应格式无效");
  }
  const d = data as Record<string, unknown>;
  if (provider === "openai") {
    const choices = d.choices;
    if (
      Array.isArray(choices) &&
      choices.length > 0 &&
      choices[0] &&
      typeof choices[0] === "object"
    ) {
      const msg = (choices[0] as Record<string, unknown>).message as
        | Record<string, unknown>
        | undefined;
      if (msg && typeof msg.content === "string") return msg.content;
    }
    throw new AiError("server", "AI 服务未返回有效回复(choices 为空)");
  }
  const msg = d.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.content === "string") return msg.content;
  throw new AiError("server", "AI 服务未返回有效回复(message 缺失)");
}

/** 将 fetch 抛出的底层异常归类为 AiError,detail 携带截断的底层信息 */
function classifyNetworkError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/timed out|abort/i.test(msg)) {
    return new AiError("timeout", "AI 请求超时,请稍后重试或调大超时设置", truncate(msg));
  }
  return new AiError("network", "无法连接 AI 服务", truncate(msg));
}

export type AiFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  }
) => Promise<Response>;

/**
 * 发起一次对话补全,返回回答文本。
 * 经 Tauri http 插件(Rust reqwest)发出,绕过 CSP 与 CORS;超时经 AbortController 中止。
 * 错误归一:AiError{code}。
 * fetchImpl 仅供测试注入(默认插件 fetch),生产调用不传。
 * externalSignal:可选外部中止信号(如面板关闭时取消进行中的请求)。
 */
export async function chatComplete(
  s: AiSettings,
  messages: AiMessage[],
  fetchImpl: AiFetch = tauriFetch,
  externalSignal?: AbortSignal
): Promise<string> {
  const invalid = validateAiSettings(s);
  if (invalid) {
    if (invalid === "configMissing") {
      throw new AiError("configMissing", "AI 面板未启用或配置不完整,请先在设置中配置");
    }
    throw new AiError("authFailed", "OpenAI 兼容接口需要填写 API key");
  }

  const req = buildChatRequest(s, messages);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), s.timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", onExternalAbort);
  }
  let res: Response;
  try {
    res = await fetchImpl(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
  } catch (e) {
    // 外部中止(面板关闭)与超时中止均会抛 AbortError,归类为 timeout 即可,
    // UI 面板在关闭后不会再展示该错误
    throw classifyNetworkError(e);
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }

  let raw = "";
  try {
    raw = await res.text();
  } catch (e) {
    throw classifyNetworkError(e);
  }

  if (res.status === 401 || res.status === 403) {
    throw new AiError("authFailed", "API key 无效或没有权限,请检查设置");
  }
  if (res.status === 408) {
    throw new AiError("timeout", "AI 请求超时,请稍后重试或调大超时设置");
  }
  if (!res.ok) {
    const detail = extractServerError(raw);
    throw new AiError(
      "server",
      `AI 服务返回错误 ${res.status}`,
      detail ? truncate(detail) : ""
    );
  }
  return extractContent(raw, s.provider);
}
