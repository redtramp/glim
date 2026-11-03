/**
 * exportInline 测试
 *
 * 测试目标:
 * - inlineImages: data:/空 src 跳过；Tauri asset 解码后本地读取内联；外部 URL 抓取内联
 * - SSRF 防护: 私网/回环/本机/元数据地址不发起抓取；URL 解析失败亦拒绝
 * - 抓取失败/非 2xx/超限（content-length 与缓冲）→ 保持原 src
 * - mime 推断、大缓冲分块 base64、readFile 返回 ArrayBuffer 兼容
 * - ensureSvgNamespace 补 xmlns 幂等
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { readFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { inlineImages, ensureSvgNamespace } from "./exportInline";

const mockedRead = vi.mocked(readFile);
const mockedFetch = vi.mocked(tauriFetch);

function makeImg(src: string): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("src", src);
  return img;
}

function makeRoot(...srcs: string[]): HTMLElement {
  const root = document.createElement("div");
  for (const s of srcs) root.appendChild(makeImg(s));
  return root;
}

function makeResponse(opts: {
  ok?: boolean;
  bytes?: Uint8Array;
  contentLength?: string | null;
  contentType?: string | null;
}) {
  const bytes = opts.bytes ?? new Uint8Array([104, 105]);
  return {
    ok: opts.ok ?? true,
    headers: {
      get: (k: string) => {
        const key = k.toLowerCase();
        if (key === "content-length") return opts.contentLength ?? null;
        if (key === "content-type") return opts.contentType ?? null;
        return null;
      },
    },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inlineImages", () => {
  it("无图片时直接完成", async () => {
    await inlineImages(document.createElement("div"));
    expect(mockedRead).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("data: 与空 src 跳过", async () => {
    const root = makeRoot("data:image/png;base64,AAAA", "");
    await inlineImages(root);
    expect(mockedRead).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("Tauri asset URL 解码后本地读取并内联（按扩展名推断 mime）", async () => {
    mockedRead.mockResolvedValue(new Uint8Array([1, 2, 3]) as never);
    const root = makeRoot("http://asset.localhost/%2Froot%2Fpic.png");
    await inlineImages(root);
    expect(mockedRead).toHaveBeenCalledWith("/root/pic.png");
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toMatch(
      /^data:image\/png;base64,/
    );
  });

  it("asset URL 解码失败时回退原始串", async () => {
    mockedRead.mockResolvedValue(new Uint8Array([1]) as never);
    const root = makeRoot("http://asset.localhost/%E0%A4%A.png");
    await inlineImages(root);
    expect(mockedRead).toHaveBeenCalledWith("%E0%A4%A.png");
  });

  it("本地读取失败时保持原 src", async () => {
    mockedRead.mockRejectedValue(new Error("no file"));
    const root = makeRoot("asset://localhost/%2Fmissing.png");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(
      "asset://localhost/%2Fmissing.png"
    );
  });

  it("readFile 返回 ArrayBuffer 时兼容内联", async () => {
    mockedRead.mockResolvedValue(new Uint8Array([9, 9]).buffer as never);
    const root = makeRoot("http://asset.localhost/%2Fx.bmp");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toMatch(
      /^data:image\/bmp;base64,/
    );
  });

  it("大缓冲走分块 base64", async () => {
    const big = new Uint8Array(0x8000 + 5);
    mockedRead.mockResolvedValue(big as never);
    const root = makeRoot("http://asset.localhost/%2Fbig.png");
    await inlineImages(root);
    const src = root.querySelectorAll("img")[0].getAttribute("src")!;
    expect(src.startsWith("data:image/png;base64,")).toBe(true);
    expect(src.length).toBeGreaterThan(0x8000);
  });

  it("外部 URL 抓取成功并内联（content-type 优先）", async () => {
    mockedFetch.mockResolvedValue(
      makeResponse({ contentType: "image/webp" }) as never
    );
    const root = makeRoot("https://example.com/a.png");
    await inlineImages(root);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toMatch(
      /^data:image\/webp;base64,/
    );
  });

  it("外部 URL 无 content-type 时按扩展名推断", async () => {
    mockedFetch.mockResolvedValue(makeResponse({ contentType: null }) as never);
    const root = makeRoot("https://example.com/g.gif");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toMatch(
      /^data:image\/gif;base64,/
    );
  });

  it("未知扩展名回退 application/octet-stream", async () => {
    mockedFetch.mockResolvedValue(makeResponse({ contentType: null }) as never);
    const root = makeRoot("https://example.com/file.unknownext");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toMatch(
      /^data:application\/octet-stream;base64,/
    );
  });

  it("非 2xx 响应不内联", async () => {
    mockedFetch.mockResolvedValue(makeResponse({ ok: false }) as never);
    const root = makeRoot("https://example.com/a.png");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(
      "https://example.com/a.png"
    );
  });

  it("content-length 超限不内联", async () => {
    mockedFetch.mockResolvedValue(
      makeResponse({ contentLength: String(20 * 1024 * 1024) }) as never
    );
    const root = makeRoot("https://example.com/huge.png");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(
      "https://example.com/huge.png"
    );
  });

  it("抓取抛错时保持原 src", async () => {
    mockedFetch.mockRejectedValue(new Error("network"));
    const root = makeRoot("https://example.com/a.png");
    await inlineImages(root);
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(
      "https://example.com/a.png"
    );
  });

  it("拒绝私网/回环/元数据/非法 URL（不发起抓取）", async () => {
    const blocked = [
      "http://127.0.0.1/a.png",
      "http://localhost/a.png",
      "http://foo.local/a.png",
      "http://svc.internal/a.png",
      "http://10.0.0.5/a.png",
      "http://172.16.5.5/a.png",
      "http://192.168.1.1/a.png",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/a.png",
      "http://0.0.0.0/a.png",
      "http://[::1]/a.png",
      "http://[fe80::1]/a.png",
      "http://[::ffff:127.0.0.1]/a.png",
      "http://[::ffff:7f00:1]/a.png", // IPv4-mapped 十六进制规范形
      "http://[::ffff:c0a8:1]/a.png", // 192.168.0.1 的映射形
      "http://256.256.256.256/a.png",
      "https://[invalid",
    ];
    const root = makeRoot(...blocked);
    await inlineImages(root);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(blocked[0]);
    expect(
      root.querySelectorAll("img")[blocked.length - 1].getAttribute("src")
    ).toBe(blocked[blocked.length - 1]);
  });

  it("172.32.x 属公网，仍发起抓取", async () => {
    mockedFetch.mockResolvedValue(makeResponse({ contentType: "image/png" }) as never);
    const root = makeRoot("http://172.32.0.1/a.png");
    await inlineImages(root);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

describe("ensureSvgNamespace", () => {
  it("为缺失 xmlns 的 svg 补齐", () => {
    const root = document.createElement("div");
    root.innerHTML = "<svg></svg>";
    ensureSvgNamespace(root);
    expect(root.querySelector("svg")!.getAttribute("xmlns")).toBe(
      "http://www.w3.org/2000/svg"
    );
  });

  it("已有 xmlns 不覆盖（幂等）", () => {
    const root = document.createElement("div");
    root.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    ensureSvgNamespace(root);
    ensureSvgNamespace(root);
    expect(root.querySelector("svg")!.getAttribute("xmlns")).toBe(
      "http://www.w3.org/2000/svg"
    );
  });

  it("无 svg 时不报错", () => {
    expect(() => ensureSvgNamespace(document.createElement("div"))).not.toThrow();
  });
});
