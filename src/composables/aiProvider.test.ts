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
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MAX_TOKENS,
  AZURE_API_VERSION,
  GEMINI_MAX_OUTPUT_TOKENS,
  buildAzureUrl,
  buildGeminiUrl,
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
  });

  it("编辑配置项自动启用（填好配置即可用）", () => {
    setAiSettings({ model: "llama3" });
    expect(getAiSettings().enabled).toBe(true);
  });

  it("编辑 baseUrl 同样自动启用", () => {
    setAiSettings({ baseUrl: "http://192.168.1.5:11434" });
    expect(getAiSettings().enabled).toBe(true);
  });

  it("显式设置 enabled=false 保持关闭（取消勾选）", () => {
    setAiSettings({ enabled: false });
    expect(getAiSettings().enabled).toBe(false);
  });

  it("显式设置 enabled=false 时编辑配置也不重新启用", () => {
    setAiSettings({ enabled: false, model: "x" });
    expect(getAiSettings().enabled).toBe(false);
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
  it("未启用（默认 off）→ configMissing", () => {
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

  it("anthropic 缺 apiKey → authFailed", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "anthropic", apiKey: "" }))
    ).toBe("authFailed");
  });

  it("anthropic 带 apiKey 可用", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "anthropic", apiKey: "sk-ant-1" }))
    ).toBeNull();
  });

  it("azure 缺 deployment → configMissing", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "azure", apiKey: "k", deployment: "" }))
    ).toBe("configMissing");
  });

  it("azure 缺 apiKey → authFailed", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "azure", deployment: "gpt-4o" }))
    ).toBe("authFailed");
  });

  it("azure 带 deployment+apiKey 可用（model 不要求）", () => {
    expect(
      validateAiSettings(
        settings({ enabled: true, provider: "azure", apiKey: "k", deployment: "gpt-4o", model: "" })
      )
    ).toBeNull();
  });

  it("gemini 缺 apiKey → authFailed", () => {
    expect(
      validateAiSettings(settings({ enabled: true, provider: "gemini", model: "gemini-2.5-flash" }))
    ).toBe("authFailed");
  });

  it("gemini 带 apiKey+model 可用", () => {
    expect(
      validateAiSettings(
        settings({ enabled: true, provider: "gemini", apiKey: "AIza", model: "gemini-2.5-flash" })
      )
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

  it("openai:智谱以 /v4 结尾时补 /chat/completions 而非 /v1", () => {
    const req = buildChatRequest(
      settings({
        provider: "openai",
        apiKey: "k",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      }),
      []
    );
    expect(req.url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
  });

  it("openai:火山方舟以 /v3 结尾时补 /chat/completions", () => {
    const req = buildChatRequest(
      settings({
        provider: "openai",
        apiKey: "k",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      }),
      []
    );
    expect(req.url).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
  });

  it("openai:Gemini 以 /openai 结尾时补 /chat/completions", () => {
    const req = buildChatRequest(
      settings({
        provider: "openai",
        apiKey: "k",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      }),
      []
    );
    expect(req.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    );
  });

  it("openai:baseUrl 已含完整 /chat/completions 端点时原样使用", () => {
    const req = buildChatRequest(
      settings({
        provider: "openai",
        apiKey: "k",
        baseUrl: "https://proxy.example.com/custom/chat/completions",
      }),
      []
    );
    expect(req.url).toBe("https://proxy.example.com/custom/chat/completions");
  });

  it("openai:baseUrl 含 /chat/completions?query= 完整端点时原样使用", () => {
    const req = buildChatRequest(
      settings({
        provider: "openai",
        apiKey: "k",
        baseUrl:
          "https://proxy.example.com/custom/chat/completions?tenant=abc",
      }),
      []
    );
    expect(req.url).toBe(
      "https://proxy.example.com/custom/chat/completions?tenant=abc"
    );
  });

  it("openai:apiKey 为空时不带 Authorization 头", () => {
    const req = buildChatRequest(settings({ provider: "openai", apiKey: "  " }), []);
    expect(req.headers.Authorization).toBeUndefined();
  });

  it("anthropic:POST {baseUrl}/v1/messages,带 x-api-key 与 anthropic-version", () => {
    const req = buildChatRequest(
      settings({
        provider: "anthropic",
        apiKey: "sk-ant-123",
        baseUrl: "https://api.anthropic.com",
      }),
      [{ role: "user", content: "hi" }]
    );
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-ant-123");
    expect(req.headers["anthropic-version"]).toBe(ANTHROPIC_API_VERSION);
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toMatchObject({
      model: "qwen2.5",
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("anthropic:system 消息拆到顶层字段,messages 只留 user/assistant", () => {
    const req = buildChatRequest(
      settings({ provider: "anthropic", apiKey: "k" }),
      [
        { role: "system", content: "你是助手" },
        { role: "user", content: "你好" },
      ]
    );
    expect(req.body).toMatchObject({
      system: "你是助手",
      messages: [{ role: "user", content: "你好" }],
    });
  });

  it("baseUrl 末尾斜杠被去除", () => {
    const req = buildChatRequest(settings({ baseUrl: "http://localhost:11434/" }), []);
    expect(req.url).toBe("http://localhost:11434/api/chat");
  });
});

describe("buildAzureUrl / buildGeminiUrl（纯函数）", () => {
  it("azure:资源域名补全部署端点与 api-version", () => {
    expect(buildAzureUrl("https://my-res.openai.azure.com", "gpt-4o")).toBe(
      `https://my-res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=${AZURE_API_VERSION}`
    );
  });

  it("azure:已含完整端点(带 query)时原样使用", () => {
    const full =
      "https://my-res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-01-preview";
    expect(buildAzureUrl(full, "gpt-4o")).toBe(full);
  });

  it("azure:deployment 含空格时 URL 编码", () => {
    expect(buildAzureUrl("https://x.openai.azure.com", "my dep")).toContain(
      "/deployments/my%20dep/chat/completions"
    );
  });

  it("gemini:补全 /v1beta/models/{model}:generateContent", () => {
    expect(buildGeminiUrl("https://generativelanguage.googleapis.com", "gemini-2.5-flash")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
  });

  it("gemini:baseUrl 已以 /v1beta 结尾时不重复拼接", () => {
    expect(
      buildGeminiUrl("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash")
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
  });
});

describe("buildChatRequest - azure / gemini", () => {
  it("azure:POST 部署端点,带 api-key 头,body 不含 model", () => {
    const req = buildChatRequest(
      settings({
        enabled: true,
        provider: "azure",
        apiKey: "az-key",
        deployment: "gpt-4o",
        baseUrl: "https://my-res.openai.azure.com",
      }),
      [{ role: "user", content: "hi" }]
    );
    expect(req.url).toBe(
      `https://my-res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=${AZURE_API_VERSION}`
    );
    expect(req.headers["api-key"]).toBe("az-key");
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toMatchObject({
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    expect(req.body).not.toHaveProperty("model");
  });

  it("gemini:POST :generateContent,带 x-goog-api-key 头,contents 映射 user/model", () => {
    const req = buildChatRequest(
      settings({
        enabled: true,
        provider: "gemini",
        apiKey: "AIza-123",
        model: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com",
      }),
      [
        { role: "system", content: "你是助手" },
        { role: "user", content: "你好" },
        { role: "assistant", content: "在的" },
      ]
    );
    expect(req.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(req.headers["x-goog-api-key"]).toBe("AIza-123");
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toMatchObject({
      systemInstruction: { parts: [{ text: "你是助手" }] },
      contents: [
        { role: "user", parts: [{ text: "你好" }] },
        { role: "model", parts: [{ text: "在的" }] },
      ],
      generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS },
    });
  });

  it("gemini:无 system 消息时不带 systemInstruction", () => {
    const req = buildChatRequest(
      settings({ enabled: true, provider: "gemini", apiKey: "k", model: "m" }),
      [{ role: "user", content: "hi" }]
    );
    expect(req.body).toMatchObject({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(req.body).not.toHaveProperty("systemInstruction");
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

  it("anthropic:解析 content[0].text", async () => {
    const fetchImpl = mockFetch(
      200,
      JSON.stringify({ content: [{ type: "text", text: "克劳德回答" }] })
    );
    const out = await chatComplete(
      settings({ enabled: true, provider: "anthropic", apiKey: "sk-ant-1" }),
      [],
      fetchImpl
    );
    expect(out).toBe("克劳德回答");
  });

  it("anthropic:扩展思考模型跳过 thinking 块取 text 块", async () => {
    const fetchImpl = mockFetch(
      200,
      JSON.stringify({
        content: [
          { type: "thinking", thinking: "内部推理过程" },
          { type: "text", text: "最终回答" },
        ],
      })
    );
    const out = await chatComplete(
      settings({ enabled: true, provider: "anthropic", apiKey: "sk-ant-1" }),
      [],
      fetchImpl
    );
    expect(out).toBe("最终回答");
  });

  it("anthropic:content 全为无 text 块 → server 错误", async () => {
    const fetchImpl = mockFetch(
      200,
      JSON.stringify({ content: [{ type: "thinking", thinking: "x" }] })
    );
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "anthropic", apiKey: "sk-ant-1" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "server" });
  });

  it("azure:解析 choices[0].message.content（与 openai 同构）", async () => {
    const fetchImpl = mockFetch(
      200,
      JSON.stringify({ choices: [{ message: { content: "Azure 回答" } }] })
    );
    const out = await chatComplete(
      settings({ enabled: true, provider: "azure", apiKey: "k", deployment: "gpt-4o" }),
      [],
      fetchImpl
    );
    expect(out).toBe("Azure 回答");
  });

  it("gemini:解析 candidates[0].content.parts[0].text", async () => {
    const fetchImpl = mockFetch(
      200,
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemini 回答" }] } }] })
    );
    const out = await chatComplete(
      settings({ enabled: true, provider: "gemini", apiKey: "AIza", model: "gemini-2.5-flash" }),
      [],
      fetchImpl
    );
    expect(out).toBe("Gemini 回答");
  });

  it("gemini:candidates 为空 → server 错误", async () => {
    const fetchImpl = mockFetch(200, JSON.stringify({ candidates: [] }));
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "gemini", apiKey: "AIza", model: "m" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({ code: "server" });
  });

  it("404 → Azure 部署端点诊断", async () => {
    const fetchImpl = mockFetch(404, "Not Found");
    await expect(
      chatComplete(
        settings({
          enabled: true,
          provider: "azure",
          apiKey: "k",
          deployment: "gpt-4o",
          baseUrl: "https://my-res.openai.azure.com",
        }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({
      code: "server",
      detail: expect.stringContaining("openai/deployments"),
    });
  });

  it("404 → Gemini 端点诊断", async () => {
    const fetchImpl = mockFetch(404, "Not Found");
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "gemini", apiKey: "k", model: "m" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({
      code: "server",
      detail: expect.stringContaining("generateContent"),
    });
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

  it("404 → server 且 detail 携带状态、OpenAI 端点诊断与请求地址", async () => {
    const fetchImpl = mockFetch(404, JSON.stringify({ error: "Not Found" }));
    const opts = {
      enabled: true,
      provider: "openai" as const,
      apiKey: "k",
      baseUrl: "http://x.com/v1",
    };
    await expect(chatComplete(settings(opts), [], fetchImpl)).rejects.toMatchObject({
      code: "server",
      detail: expect.stringContaining("Not Found（404）"),
    });
    await expect(chatComplete(settings(opts), [], fetchImpl)).rejects.toMatchObject({
      detail: expect.stringContaining("chat/completions"),
    });
    await expect(chatComplete(settings(opts), [], fetchImpl)).rejects.toMatchObject({
      detail: expect.stringContaining("请求地址:http://x.com/v1/chat/completions"),
    });
  });

  it("404 → Ollama 端点给出 /api/chat 诊断（地址误带 /v1）", async () => {
    const fetchImpl = mockFetch(404, "Not Found");
    await expect(
      chatComplete(
        settings({ enabled: true, provider: "ollama", baseUrl: "http://localhost:11434/v1" }),
        [],
        fetchImpl
      )
    ).rejects.toMatchObject({
      code: "server",
      detail: expect.stringContaining("/api/chat"),
    });
  });

  it("未启用 → configMissing", async () => {
    const fetchImpl = mockFetch(200, "{}");
    await expect(chatComplete(settings({ enabled: false }), [], fetchImpl))
      .rejects.toMatchObject({ code: "configMissing" });
  });

  it("baseUrl/model 为空 → configMissing", async () => {
    const fetchImpl = mockFetch(200, "{}");
    await expect(
      chatComplete(settings({ enabled: true, baseUrl: "", model: " " }), [], fetchImpl)
    ).rejects.toMatchObject({ code: "configMissing" });
  });

  it("openai 缺 apiKey → authFailed", async () => {
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
