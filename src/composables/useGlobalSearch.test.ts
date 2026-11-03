/**
 * useGlobalSearch 测试
 *
 * 测试目标:
 * - 空 root / 空白 query 直接返回 []（不发起 IPC）
 * - searchInFiles 将全部参数透传给 invoke
 * - maxResults/session 默认值
 * - nextSearchSession 单调递增（供后端中断过期遍历）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { searchInFiles, nextSearchSession } from "./useGlobalSearch";

const mockedInvoke = vi.mocked(invoke);

describe("useGlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空 root 返回 [] 且不调用 invoke", async () => {
    expect(await searchInFiles("", "q", false)).toEqual([]);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("空白 query 返回 [] 且不调用 invoke", async () => {
    expect(await searchInFiles("/root", "   ", false)).toEqual([]);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("透传全部参数并返回结果", async () => {
    const hit = { path: "/r/a.md", rel_path: "a.md", line: 1, column: 2, preview: "x" };
    mockedInvoke.mockResolvedValue([hit]);
    const res = await searchInFiles("/root", "q", true, 10, 3);
    expect(mockedInvoke).toHaveBeenCalledWith("search_in_files", {
      root: "/root",
      query: "q",
      caseSensitive: true,
      maxResults: 10,
      session: 3,
    });
    expect(res).toEqual([hit]);
  });

  it("maxResults/session 默认 500/0", async () => {
    mockedInvoke.mockResolvedValue([]);
    await searchInFiles("/root", "q", false);
    expect(mockedInvoke).toHaveBeenCalledWith(
      "search_in_files",
      expect.objectContaining({ maxResults: 500, session: 0 })
    );
  });

  it("nextSearchSession 单调递增", () => {
    const a = nextSearchSession();
    const b = nextSearchSession();
    expect(b).toBe(a + 1);
  });
});
