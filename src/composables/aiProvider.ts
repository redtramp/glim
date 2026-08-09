/**
 * aiProvider.ts — 内置 AI 面板的配置与请求层（Phase 3）。
 *
 * 职责:
 * - AiSettings 配置:provider(ollama / openai 兼容 / anthropic / azure / gemini)、
 *   baseUrl、apiKey、model、deployment、temperature、timeoutMs,
 *   localStorage 持久化(模式与 useReadingSettings 一致);
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

export type AiProvider =
  | "ollama"
  | "openai"
  | "anthropic"
  | "azure"
  | "gemini";

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Azure OpenAI 部署名称(用于拼 /openai/deployments/{deployment} 路径) */
  deployment: string;
  temperature: number;
  timeoutMs: number;
}

/** Anthropic Messages API 版本头(官方固定值) */
export const ANTHROPIC_API_VERSION = "2023-06-01";
/** Anthropic 必填 max_tokens:改写全文等长任务按 8192 给足预算 */
export const ANTHROPIC_MAX_TOKENS = 8192;
/** Azure OpenAI 稳定 GA api-version;如需 preview 版本,可直接粘贴完整端点地址覆盖 */
export const AZURE_API_VERSION = "2024-06-01";
/** Gemini 原生接口 maxOutputTokens 预算 */
export const GEMINI_MAX_OUTPUT_TOKENS = 8192;

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
    deployment: "",
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
  // 配置编辑即启用:用户填写/修改服务配置时自动打开面板,
  // 避免「填好配置仍提示未启用」;显式设置 enabled(如取消勾选)则保持原意。
  const CONFIG_KEYS: ReadonlyArray<keyof AiSettings> = [
    "provider",
    "baseUrl",
    "apiKey",
    "model",
    "deployment",
  ];
  if (partial.enabled === undefined && CONFIG_KEYS.some((k) => k in partial)) {
    next.enabled = true;
  }
  localStorage.setItem(STORAGE, JSON.stringify(next));
}

export function resetAiSettings(): void {
  localStorage.removeItem(STORAGE);
}

/**
 * 校验最小可用配置;返回错误码或 null(可用)。
 *
 * enabled 为「默认关闭」的防护开关:未显式启用即视为未配置(即使 baseUrl/model
 * 自带默认值)。设置中编辑任一配置项会自动置 enabled=true(见 setAiSettings),
 * 因此「填好配置仍提示未启用」由自动启用解决,这里保持门槛不变。
 */
export function validateAiSettings(s: AiSettings): AiErrorCode | null {
  if (!s.enabled) return "configMissing";
  if (!s.baseUrl.trim()) return "configMissing";
  // Azure 用 deployment 标识模型(在 URL 路径中),不要求 model 字段
  if (s.provider === "azure") {
    if (!s.deployment.trim()) return "configMissing";
    if (!s.apiKey.trim()) return "authFailed";
    return null;
  }
  if (!s.model.trim()) return "configMissing";
  // OpenAI 兼容 / Anthropic / Gemini 均需 API key;Ollama 本地无需鉴权
  if (s.provider !== "ollama" && !s.apiKey.trim()) return "authFailed";
  return null;
}

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * OpenAI 兼容端点的 URL 拼接(纯函数,可单测)。
 *
 * 规则(兼容各厂商 base_url 形态):
 * 1. 已含 /chat/completions → 视为完整端点,原样使用(支持自定义路径与带
 *    ?api-version= 等 query 的完整地址,如 Azure 的部署端点);
 * 2. 已含版本段(/v1 /v3 /v4 或 /openai 结尾,如智谱 /api/paas/v4、火山方舟 /api/v3、
 *    Gemini 的 /v1beta/openai)→ 直接补 /chat/completions,不再重复拼 /v1;
 * 3. 其余裸域名(如 https://api.openai.com)→ 拼 /v1/chat/completions(向后兼容)。
 */
export function buildOpenAICompatUrl(base: string): string {
  if (base.includes("/chat/completions")) return base;
  if (/\/v\d+$/.test(base) || /\/openai$/.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * Azure OpenAI 部署端点拼接(纯函数,可单测)。
 * 1. 地址已含 /chat/completions → 视为完整端点(可带自定义 api-version),原样使用;
 * 2. 否则按资源域名补全 /openai/deployments/{deployment}/chat/completions?api-version=。
 */
export function buildAzureUrl(base: string, deployment: string): string {
  if (base.includes("/chat/completions")) return base;
  return `${base}/openai/deployments/${encodeURIComponent(
    deployment.trim()
  )}/chat/completions?api-version=${AZURE_API_VERSION}`;
}

/**
 * Gemini 原生 generateContent 端点拼接(纯函数,可单测)。
 * 地址以 /v1beta 结尾时不重复拼接。
 */
export function buildGeminiUrl(base: string, model: string): string {
  const root = base.endsWith("/v1beta") ? base : `${base}/v1beta`;
  return `${root}/models/${encodeURIComponent(model.trim())}:generateContent`;
}

/**
 * Gemini 原生请求体:system 拆到顶层 systemInstruction(contents 只允许
 * user/model 两种 role),assistant 映射为 model,generationConfig 控制输出预算。
 */
function buildGeminiBody(messages: AiMessage[], temperature: number): unknown {
  const systemParts: string[] = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
  }
  return {
    ...(systemParts.length
      ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } }
      : {}),
    contents,
    generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, temperature },
  };
}

/** 把 system 消息拆到顶层,Anthropic 的 messages 只允许 user/assistant */
function splitAnthropicMessages(messages: AiMessage[]): {
  system: string;
  messages: AiMessage[];
} {
  const systemParts: string[] = [];
  const chat: AiMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else chat.push(m);
  }
  return { system: systemParts.join("\n\n"), messages: chat };
}

/**
 * 构造请求(纯函数)。
 * - ollama:POST {baseUrl}/api/chat,无鉴权头;
 * - openai:POST buildOpenAICompatUrl(baseUrl),apiKey 非空时带 Authorization: Bearer;
 * - anthropic:POST {baseUrl}/v1/messages,鉴权头 x-api-key + anthropic-version,
 *   system 消息拆到顶层字段,max_tokens 必填;
 * - azure:POST buildAzureUrl(baseUrl, deployment),鉴权头 api-key,body 不含 model
 *   (模型由部署名标识,已编入 URL 路径);
 * - gemini:POST buildGeminiUrl(baseUrl, model),鉴权头 x-goog-api-key,
 *   body 为 contents + 顶层 systemInstruction + generationConfig。
 */
export function buildChatRequest(
  s: AiSettings,
  messages: AiMessage[]
): AiRequest {
  const base = s.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (s.provider === "anthropic") {
    if (s.apiKey.trim()) {
      headers["x-api-key"] = s.apiKey.trim();
      headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    }
    const { system, messages: chat } = splitAnthropicMessages(messages);
    return {
      url: `${base}/v1/messages`,
      headers,
      body: {
        model: s.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        temperature: s.temperature,
        ...(system ? { system } : {}),
        messages: chat,
      },
    };
  }
  if (s.provider === "azure") {
    if (s.apiKey.trim()) headers["api-key"] = s.apiKey.trim();
    return {
      url: buildAzureUrl(base, s.deployment),
      headers,
      body: { messages, temperature: s.temperature, stream: false },
    };
  }
  if (s.provider === "gemini") {
    if (s.apiKey.trim()) headers["x-goog-api-key"] = s.apiKey.trim();
    return {
      url: buildGeminiUrl(base, s.model),
      headers,
      body: buildGeminiBody(messages, s.temperature),
    };
  }
  if (s.provider === "openai") {
    if (s.apiKey.trim()) headers.Authorization = `Bearer ${s.apiKey.trim()}`;
    return {
      url: buildOpenAICompatUrl(base),
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

/**
 * 404 路径诊断:各服务端点路径不同,
 * 常见的 404 来自服务类型与地址不匹配(如向 Ollama 请求 /chat/completions,
 * 或 baseUrl 多带了 /v1 导致拼出 /v1/api/chat)。
 */
function buildServerErrorHint(url: string, status: number): string {
  if (status !== 404) return "";
  if (url.endsWith("/api/chat")) {
    return "请求了 Ollama 端点 /api/chat:请确认服务为 Ollama 且地址不含 /v1 等路径后缀";
  }
  if (url.endsWith("/chat/completions")) {
    return "请求了 OpenAI 兼容端点 /chat/completions:请确认该服务支持 OpenAI 兼容接口(/v1/chat/completions)且服务地址正确";
  }
  if (url.endsWith("/v1/messages")) {
    return "请求了 Anthropic 端点 /v1/messages:请确认服务类型为 Anthropic 且服务地址正确(默认 https://api.anthropic.com)";
  }
  if (url.includes("/openai/deployments/")) {
    return "请求了 Azure OpenAI 部署端点:请确认服务类型为 Azure、资源域名正确、部署名称与 Azure 中创建的一致";
  }
  if (url.includes(":generateContent")) {
    return "请求了 Gemini 原生端点 :generateContent:请确认服务类型为 Google Gemini 且模型名称(如 gemini-2.5-flash)正确";
  }
  return "请检查服务地址与所选服务类型是否匹配";
}

/** 从响应体提取 error.message(兼容 openai 与 ollama 的差异格式);raw 为响应文本,内部解析 */
function extractServerError(raw: string): string {
  let body: unknown;
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
 * - openai / azure:choices[0].message.content
 * - ollama:message.content
 * - anthropic:content[0].text(内容块数组,跳过 thinking 块)
 * - gemini:candidates[0].content.parts[0].text(遍历 parts 取第一个带 text 的)
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
  if (provider === "anthropic") {
    const blocks = d.content;
    // 遍历内容块取第一个带 text 的块:扩展思考模型(content[0] 可能是
    // {type:"thinking", thinking:"..."} 无 text 字段)时仍需取到回答文本。
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block && typeof block === "object") {
          const text = (block as Record<string, unknown>).text;
          if (typeof text === "string") return text;
        }
      }
    }
    throw new AiError("server", "AI 服务未返回有效回复(content 块缺失)");
  }
  if (provider === "openai" || provider === "azure") {
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
  if (provider === "gemini") {
    const candidates = d.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const first = candidates[0];
      if (first && typeof first === "object") {
        const content = (first as Record<string, unknown>).content as
          | Record<string, unknown>
          | undefined;
        const parts = content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part && typeof part === "object") {
              const text = (part as Record<string, unknown>).text;
              if (typeof text === "string") return text;
            }
          }
        }
      }
    }
    throw new AiError("server", "AI 服务未返回有效回复(candidates 为空)");
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
      throw new AiError("configMissing", "AI 面板未启用或配置不完整,请先在设置中启用并配置");
    }
    throw new AiError("authFailed", "该服务需要填写 API key,请检查设置");
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

  let raw: string;
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
    // 详情携带状态、请求地址与 404 路径诊断,便于用户直接定位配置问题
    const rawDetail = extractServerError(raw);
    const hint = buildServerErrorHint(req.url, res.status);
    const parts = [rawDetail ? `${rawDetail}（${res.status}）` : `HTTP ${res.status}`];
    if (hint) parts.push(hint);
    parts.push(`请求地址:${req.url}`);
    throw new AiError("server", `AI 服务返回错误 ${res.status}`, truncate(parts.join("；")));
  }
  return extractContent(raw, s.provider);
}
