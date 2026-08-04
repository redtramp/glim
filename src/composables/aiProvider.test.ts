/**
 * aiProvider 单测
 *
 * 覆盖:配置默认值/持久化容错、buildChatRequest 两 provider 的 url/header/body、
 * apiKey 有无、validateAiSettings、chatComplete 成功解析与错误映射
 * (401/408/5xx/timeout/network/configMissing)、响应解析(openai/ollama)。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  defaultAiSettings,
  getAiSettings,
  setAiSettings,
  resetAiSettings,
  validateAiSettings,
  buildChatRequest,
  chatComplete,
  AiError,
  type AiSettings,
  type AiFetch,
} from "./aiProvider";

/** 构造注入用 mock fetch:返回固定状态码与响应体 */
function mockFetch(status: number, body: string): AiFetch {
  return vi.fn(async () => new Response(body, { status }));
}

const settings = (partial: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  ...partial,
});

/** vitest4 + jsdom 环境无 localStorage,提供内存实现保证配置持久化可测 */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  };
}

describe("配置持久化", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("默认值:enabled=false,provider=ollama", () => {
    const s = defaultAiSettings();
    expect(s.enabled).toBe(false);
    expect(s.provider).toBe("ollama");
    expect(s.baseUrl).toBe("http://localhost:11434");
  });

  it("getAiSettings 无存储时返回默认", () => {
    expect(getAiSettings()).toEqual(defaultAiSettings());
  });

  it("set/get 往返合并部分字段", () => {
    setAiSettings({ model: "llama3" });
    const s = getAiSettings();
    expect(s.model).toBe("llama3");
    expect(s.enabled).toBe(false); // 未覆盖字段保留默认
  });

  it("reset 清除存储回退默认", () => {
    setAiSettings({ model: "x" });
    resetAiSettings();
    expect(getAiSettings()).toEqual(defaultAiSettings());
  });

  it("损坏的 JSON 回退默认不抛错", () => {
    localStorage.setItem("glim-reader-ai", "{bad json");
    expect(getAiSettings()).toEqual(defaultAiSettings());
  });
});

describe("validateAiSettings", () => {
  it("未启用 → configMissing", () => {
    expect(validateAiSettings(settings({ enabled: false }))).toBe("configMissing");
  });

  it("baseUrl/model 为空 → configMissing", () => {
    expect(
      validateAiSettings(settings({ enabled: true, baseUrl: " ", model: "" }))
    ).toBe("configMissing");
  });

  it("openai 缺 apiKey → authFailed", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "openai", apiKey: "" }))
    ).toBe("authFailed");
  });

  it("ollama 无 apiKey 可用", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "ollama" }))
    ).toBeNull();
  });
});

describe("buildChatRequest", () => {
  it("ollama:POST {baseUrl}/api/chat,无鉴权头", () => {
    const req = buildChatRequest(settings({ provider: "ollama" }), [
      { role: "user", content: "hi" },
    ]);
    expect(req.url).toBe("http://localhost:11434/api/chat");
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toMatchObject({
      model: "qwen2.5",
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("openai:POST {baseUrl}/v1/chat/completions,带 Bearer", () => {
    const req = buildChatRequest(
      settings({ provider: "openai", apiKey: "sk-123", baseUrl: "https://api.openai.com" }),
      [{ role: "user", content: "hi" }]
    );
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.headers.Authorization).toBe("Bearer sk-123");
  });

  it("openai:baseUrl 已含 /v1 时不重复拼接", () => {
    const req = buildChatRequest(
      settings({ provider: "openai", apiKey: "k", baseUrl: "https://x.com/v1" }),
      []
    );
    expect(req.url).toBe("https://x.com/v1/chat/completions");
  });

  it("openai:apiKey 为空时不带 Authorization 头", () => {
    const req = buildChatRequest(settings({ provider: "openai", apiKey: "  " }), []);
    expect(req.headers.Authorization).toBeUndefined();
  });

  it("baseUrl 末尾斜杠被去除", () => {
    const req = buildChatRequest(settings({ baseUrl: "http://localhost:11434/" }), []);
    expect(req.url).toBe("http://localhost:11434/api/chat");
  });
});

describe("chatComplete - 成功路径", () => {
  it("openai:解析 choices[0].message.content", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ choices: [{ message: { content: "回答" } }] }));
    const out = await chatComplete(
      settings({ enabled: true, provider: "openai", apiKey: "k" }),
      [],
      fetchImpl
    );
    expect(out).toBe("回答");
  });

  it("ollama:解析 message.content", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ message: { content: "本地回答" } }));
    const out = await chatComplete(
      settings({ enabled: true, provider: "ollama" }),
      [],
      fetchImpl
    );
    expect(out).toBe("本地回答");
  });

  it("非 2xx:401 → authFailed", async () => {
    const fetchImpl = mockFetch(401, JSON.stringify({ error: { message: "bad key" } }));
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "openai", apiKey: "k" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "authFailed" });
  });

  it("非 2xx:408 → timeout", async () => {
    const fetchImpl = mockFetch(408, "timeout");
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("非 2xx:500 → server 并携带截断信息(detail)", async () => {
    const fetchImpl = mockFetch(500, JSON.stringify({ error: { message: "boom" } }));
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "server" });
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl)).rejects.toMatchObject({
      detail: expect.stringContaining("boom"),
    });
  });

  it("未启用 → configMissing", async () => {
    const fetchImpl = mockFetch(200, "{}");
    await expect(chatComplete(settings({ enabled: false }), [], fetchImpl))
      .rejects.toMatchObject({ code: "configMissing" });
  });

  it("openai 缺 apiKey → authFailed(未启用不触发)", async () => {
    const fetchImpl = mockFetch(200, "{}");
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "openai", apiKey: "" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "authFailed" });
  });

  it("网络异常 → network", async () => {
    const fetchImpl: AiFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "network" });
  });

  it("超时(AbortError) → timeout", async () => {
    const fetchImpl: AiFetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("响应缺 content 字段 → server", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ choices: [] }));
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "server" });
  });

  it("响应非 JSON → server", async () => {
    const fetchImpl = mockFetch(200, "<html>error</html>");
    await expect(chatComplete(settings({ enabled: true }), [], fetchImpl))
      .rejects.toMatchObject({ code: "server" });
  });
});

describe("AiError", () => {
  it("携带 code 与 message", () => {
    const err = new AiError("network", "连接失败");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("network");
    expect(err.message).toBe("连接失败");
    expect(err.name).toBe("AiError");
  });
});
