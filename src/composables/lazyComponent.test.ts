/**
 * lazyComponent 单测
 *
 * 覆盖 createLazyLoader 的三项核心语义：
 * - 首次 ensure 触发一次 import 并回调 onLoaded；
 * - 已加载后 ensure 幂等（不再 import）；
 * - 并发 ensure 共享同一次 in-flight import（去重）；
 * - 加载失败不标记 loaded，下一次 ensure 可重试并成功。
 */
import { describe, it, expect, vi } from "vitest";
import { createLazyLoader } from "./lazyComponent";

describe("createLazyLoader", () => {
  it("首次 ensure 触发一次 import 并回调 onLoaded", async () => {
    const component = { marker: 1 };
    const load = vi.fn(async () => ({ default: component }));
    const onLoaded = vi.fn();
    const loader = createLazyLoader(load, onLoaded);

    expect(loader.loaded).toBe(false);
    await loader.ensure();

    expect(load).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith(component);
    expect(loader.loaded).toBe(true);
  });

  it("已加载后 ensure 幂等，不再 import", async () => {
    const load = vi.fn(async () => ({ default: {} }));
    const loader = createLazyLoader(load, vi.fn());

    await loader.ensure();
    await loader.ensure();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("并发 ensure 共享同一次 in-flight import，onLoaded 只回调一次", async () => {
    let resolveLoad!: (value: { default: unknown }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ default: unknown }>((resolve) => {
          resolveLoad = resolve;
        })
    );
    const onLoaded = vi.fn();
    const loader = createLazyLoader(load, onLoaded);

    const p1 = loader.ensure();
    const p2 = loader.ensure();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad({ default: { ok: true } });
    await Promise.all([p1, p2]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("加载失败后不标记 loaded，可重试并成功", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ default: { ok: true } });
    const onLoaded = vi.fn();
    const loader = createLazyLoader(load, onLoaded);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await loader.ensure();
    expect(loader.loaded).toBe(false);
    expect(onLoaded).not.toHaveBeenCalled();
    // 失败被吞掉，ensure 不 reject
    expect(errorSpy).toHaveBeenCalled();

    await loader.ensure();
    expect(load).toHaveBeenCalledTimes(2);
    expect(onLoaded).toHaveBeenCalledWith({ ok: true });
    expect(loader.loaded).toBe(true);

    errorSpy.mockRestore();
  });
});
