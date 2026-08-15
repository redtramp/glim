/**
 * useFileWatcher 测试
 *
 * 测试目标:
 * - start: 首次启动注册 start_watch + listen；再次启动先 stop 清空注册
 * - watchFile: 同会话内同目录只注册一次 IPC；不同目录各自注册；失败后可重试
 * - watchFile: 无活动 watcher 时直接跳过（Rust 侧 watch_path 本为空操作）
 * - stop: 卸载监听、调用 stop_watch、清空 watching 与已注册目录
 * - 事件分发: listen 回调携带 payload 传给 handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, type Component } from "vue";
import { useFileWatcher } from "./useFileWatcher";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

/** 在组件上下文中挂载 composable，使 onUnmounted 生命周期生效 */
function mountWatcher() {
  let watcher: ReturnType<typeof useFileWatcher> | null = null;
  const Wrapper = defineComponent({
    setup() {
      watcher = useFileWatcher();
      return () => null;
    },
  });
  const wrapper = mount(Wrapper as Component);
  return { wrapper: wrapper as VueWrapper, getWatcher: () => watcher! };
}

describe("useFileWatcher", () => {
  let wrapper: VueWrapper;
  let watcher: ReturnType<typeof useFileWatcher>;
  let eventHandler: ((ev: { payload: string[] }) => void) | null;
  let unlistenCalls: number;

  beforeEach(() => {
    vi.clearAllMocks();
    unlistenCalls = 0;
    eventHandler = null;
    mockedInvoke.mockResolvedValue(undefined);
    mockedListen.mockImplementation((async (
      _event: string,
      cb: (ev: { payload: string[] }) => void
    ) => {
      eventHandler = cb;
      return () => {
        unlistenCalls += 1;
      };
    }) as never);
    const m = mountWatcher();
    wrapper = m.wrapper;
    watcher = m.getWatcher();
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  describe("start", () => {
    it("首次启动:注册 start_watch 与 listen,设置 watching", async () => {
      const handler = vi.fn();
      await watcher.start("/root", handler);
      expect(mockedInvoke).toHaveBeenCalledWith("start_watch", { root: "/root" });
      expect(mockedListen).toHaveBeenCalledTimes(1);
      expect(watcher.watching.value).toBe("/root");
      // 事件分发到 handler
      eventHandler?.({ payload: ["/root/a.md"] });
      expect(handler).toHaveBeenCalledWith(["/root/a.md"]);
    });

    it("再次启动:先 stop 卸载监听并清空注册,再重新注册", async () => {
      await watcher.start("/root1", vi.fn());
      await watcher.watchFile("/root1/a.md");
      expect(mockedInvoke).toHaveBeenCalledWith("watch_path", { path: "/root1/a.md" });

      await watcher.start("/root2", vi.fn());
      // stop_watch 被调用、listen 卸载一次、watching 更新
      expect(mockedInvoke).toHaveBeenCalledWith("stop_watch");
      expect(unlistenCalls).toBe(1);
      expect(watcher.watching.value).toBe("/root2");
      // 历史注册被清空:同目录重新注册会再次发 IPC
      await watcher.watchFile("/root2/a.md");
      expect(mockedInvoke).toHaveBeenCalledWith("watch_path", { path: "/root2/a.md" });
    });
  });

  describe("watchFile 目录去重", () => {
    it("无活动 watcher 时跳过注册", async () => {
      await watcher.watchFile("/root/a.md");
      expect(mockedInvoke).not.toHaveBeenCalledWith("watch_path", expect.anything());
    });

    it("同一会话内相同目录只注册一次", async () => {
      await watcher.start("/root", vi.fn());
      await watcher.watchFile("/root/a.md");
      await watcher.watchFile("/root/a.md");
      await watcher.watchFile("/root/b.md");
      const watchPathCalls = mockedInvoke.mock.calls.filter(([name]) => name === "watch_path");
      expect(watchPathCalls).toEqual([
        ["watch_path", { path: "/root/a.md" }],
        ["watch_path", { path: "/root/b.md" }],
      ]);
    });

    it("注册失败后允许重试", async () => {
      await watcher.start("/root", vi.fn());
      mockedInvoke.mockRejectedValueOnce(new Error("boom"));
      await watcher.watchFile("/root/a.md");
      // 失败后再次调用应重新发起 IPC
      await watcher.watchFile("/root/a.md");
      const watchPathCalls = mockedInvoke.mock.calls.filter(([name]) => name === "watch_path");
      expect(watchPathCalls).toHaveLength(2);
    });
  });

  describe("stop", () => {
    it("卸载监听、调用 stop_watch、清空 watching 与注册", async () => {
      await watcher.start("/root", vi.fn());
      await watcher.watchFile("/root/a.md");

      await watcher.stop();
      expect(unlistenCalls).toBe(1);
      expect(mockedInvoke).toHaveBeenCalledWith("stop_watch");
      expect(watcher.watching.value).toBe("");

      // stop 后无活动 watcher,watchFile 跳过
      await watcher.watchFile("/root/a.md");
      const watchPathCalls = mockedInvoke.mock.calls.filter(([name]) => name === "watch_path");
      expect(watchPathCalls).toHaveLength(1); // 只有 stop 前的那次
    });
  });

  describe("组件卸载", () => {
    it("unmount 时自动 stop 清理监听", async () => {
      await watcher.start("/root", vi.fn());
      wrapper.unmount();
      wrapper = null as unknown as VueWrapper; // 已卸载,避免 afterEach 重复 unmount
      expect(unlistenCalls).toBe(1);
      expect(mockedInvoke).toHaveBeenCalledWith("stop_watch");
    });
  });
});
