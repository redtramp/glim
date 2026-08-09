/**
 * clipboard 单测
 *
 * 覆盖:Clipboard API 成功路径、API 抛错/缺失时回退 execCommand、
 * execCommand 失败抛错、execCommand 抛错时仍清理 textarea。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyTextToClipboard } from "./clipboard";

const TEXT = "需要复制的文本";

/** 最小 Clipboard 接口(jsdom 无 Clipboard 全局) */
interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

function stubClipboard(impl: ClipboardLike | undefined): void {
  Object.defineProperty(navigator, "clipboard", { value: impl, configurable: true });
}

// jsdom 未实现 document.execCommand,先定义可替换的属性供 spy/断言使用
let execCommand: ReturnType<typeof vi.fn>;
beforeEach(() => {
  execCommand = vi.fn(() => false);
  Object.defineProperty(document, "execCommand", {
    value: execCommand,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("copyTextToClipboard", () => {
  it("Clipboard API 可用时直接写入", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as ClipboardLike);
    await copyTextToClipboard(TEXT);
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("Clipboard API 抛错时回退 execCommand", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard({ writeText } as unknown as ClipboardLike);
    execCommand.mockReturnValue(true);
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");
    await copyTextToClipboard(TEXT);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it("Clipboard API 缺失时回退 execCommand", async () => {
    stubClipboard(undefined);
    execCommand.mockReturnValue(true);
    await copyTextToClipboard(TEXT);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("execCommand 返回 false 时抛错", async () => {
    stubClipboard(undefined);
    execCommand.mockReturnValue(false);
    await expect(copyTextToClipboard(TEXT)).rejects.toThrow("copy failed");
  });

  it("execCommand 抛错时向上传播并清理 textarea", async () => {
    stubClipboard(undefined);
    execCommand.mockImplementation(() => {
      throw new Error("boom");
    });
    const removeSpy = vi.spyOn(document.body, "removeChild");
    await expect(copyTextToClipboard(TEXT)).rejects.toThrow("boom");
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
