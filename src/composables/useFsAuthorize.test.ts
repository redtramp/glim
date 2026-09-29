/**
 * useFsAuthorize 单测
 *
 * 覆盖:非授权错误透传、拒绝授权、授权后调用 allow_dir 并重试、
 * 重试仍失败时抛出、提示未决期间的并发请求直接拒绝。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useFsAuthorize, isForbiddenError } from "./useFsAuthorize.svelte.ts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const mockedRead = vi.mocked(readTextFile);

const FORBIDDEN = "forbidden path: /opt/app/.config/doc.md, maybe it is not allowed by the fs plugin";
const PATH = "/opt/app/.config/doc.md";
const DIR = "/opt/app/.config";

/** 让被拒绝的 Promise 与后续微任务链推进到弹窗状态 */
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isForbiddenError", () => {
  it("识别 debug 文案与 PathForbidden 文案", () => {
    expect(isForbiddenError(FORBIDDEN)).toBe(true);
    expect(isForbiddenError("forbidden path: /a/b")).toBe(true);
    expect(isForbiddenError(new Error(FORBIDDEN))).toBe(true);
  });

  it("其它错误不视为授权错误", () => {
    expect(isForbiddenError("file not found")).toBe(false);
    expect(isForbiddenError(new Error("io error"))).toBe(false);
    expect(isForbiddenError(undefined)).toBe(false);
  });
});

describe("readTextFileAuthorized", () => {
  it("可直接读取时不弹窗也不授权", async () => {
    mockedRead.mockResolvedValueOnce("# ok");
    await expect(useFsAuthorize().readTextFileAuthorized(PATH)).resolves.toBe("# ok");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("非授权错误原样抛出且不弹窗", async () => {
    const fs = useFsAuthorize();
    mockedRead.mockRejectedValueOnce("Permission denied");
    await expect(fs.readTextFileAuthorized(PATH)).rejects.toBe("Permission denied");
    expect(fs.showGrantDialog.value).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("拒绝授权时抛出原错误且不调用 allow_dir", async () => {
    const fs = useFsAuthorize();
    mockedRead.mockRejectedValueOnce(FORBIDDEN);
    const pending = fs.readTextFileAuthorized(PATH);
    await settle();
    expect(fs.showGrantDialog.value).toBe(true);
    expect(fs.grantDir.value).toBe(DIR);
    fs.resolveDialog(false);
    await expect(pending).rejects.toBe(FORBIDDEN);
    expect(fs.showGrantDialog.value).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("授权后调用 allow_dir 并重试一次读取", async () => {
    const fs = useFsAuthorize();
    mockedRead.mockRejectedValueOnce(FORBIDDEN).mockResolvedValueOnce("# granted");
    mockedInvoke.mockResolvedValueOnce(undefined);
    const pending = fs.readTextFileAuthorized(PATH);
    await settle();
    fs.resolveDialog(true);
    await expect(pending).resolves.toBe("# granted");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("allow_dir", { path: DIR });
    expect(mockedRead).toHaveBeenCalledTimes(2);
  });

  it("重试仍失败时抛出重试产生的错误", async () => {
    const fs = useFsAuthorize();
    mockedRead.mockRejectedValueOnce(FORBIDDEN).mockRejectedValueOnce(FORBIDDEN);
    mockedInvoke.mockResolvedValueOnce(undefined);
    const pending = fs.readTextFileAuthorized(PATH);
    await settle();
    fs.resolveDialog(true);
    await expect(pending).rejects.toBe(FORBIDDEN);
    expect(mockedRead).toHaveBeenCalledTimes(2);
  });

  it("提示未决期间的并发请求直接拒绝，不再弹第二个窗", async () => {
    const fs = useFsAuthorize();
    mockedRead.mockRejectedValueOnce(FORBIDDEN).mockRejectedValueOnce(FORBIDDEN);
    const first = fs.readTextFileAuthorized(PATH);
    await settle();
    const second = fs.readTextFileAuthorized(PATH);
    await expect(second).rejects.toBe(FORBIDDEN);
    expect(fs.showGrantDialog.value).toBe(true);
    expect(mockedRead).toHaveBeenCalledTimes(2);
    expect(mockedInvoke).not.toHaveBeenCalled();
    fs.resolveDialog(false);
    await expect(first).rejects.toBe(FORBIDDEN);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
