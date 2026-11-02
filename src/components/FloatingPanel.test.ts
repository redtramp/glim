/**
 * FloatingPanel 组件测试（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 测试目标:
 * - visible prop 控制显示/隐藏
 * - side prop 控制滑入方向
 * - 动画 class 切换
 * - 磨砂玻璃背景
 * - 外部点击关闭
 * - 键盘事件
 *
 * 迁移注意:Vue 的 <slot> → Svelte 的 children Snippet,需 createRawSnippet。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import FloatingPanel from "./FloatingPanel.svelte";

describe("FloatingPanel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("visible=false 时不渲染内容", () => {
    const { container } = render(FloatingPanel, {
      props: { visible: false },
    });
    expect(container.querySelector(".floating-panel")).toBeNull();
  });

  it("visible=true 时渲染浮层", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true },
    });
    // showContent 初始即为 visible,等价原 watch 后的状态
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector(".floating-panel")).not.toBeNull();
  });

  it("side='left' 时浮层从左侧滑入", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, side: "left" },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = container.querySelector(".floating-panel")!;
    expect(panel.classList.contains("left")).toBe(true);
    expect(panel.classList.contains("entering")).toBe(true);
  });

  it("side='bottom' 时浮层从底部滑入", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, side: "bottom" },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = container.querySelector(".floating-panel")!;
    expect(panel.classList.contains("bottom")).toBe(true);
  });

  it("底部弹出模式显示拖拽手柄", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, side: "bottom" },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector(".fp-handle")).not.toBeNull();
  });

  it("左侧浮层不显示拖拽手柄", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, side: "left" },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector(".fp-handle")).toBeNull();
  });

  it("visible 从 true 变为 false 时添加 leaving class", async () => {
    const { container, rerender } = render(FloatingPanel, {
      props: { visible: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    await rerender({ visible: false });
    // 切换后 showContent 仍然为 true（动画延迟卸载）
    const panel = container.querySelector(".floating-panel");
    expect(panel).not.toBeNull();
    expect(panel!.classList.contains("leaving")).toBe(true);
  });

  it("自定义宽度生效", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, width: 280 },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = container.querySelector(".floating-panel")!;
    expect(panel.getAttribute("style")).toContain("width: 280px");
  });

  it("自定义 zIndex 生效", async () => {
    const { container } = render(FloatingPanel, {
      props: { visible: true, zIndex: 100 },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = container.querySelector(".floating-panel")!;
    expect(panel.getAttribute("style")).toContain("z-index: 100");
  });

  it("点击浮层内部不触发 close 回调", async () => {
    const onClose = vi.fn();
    const { container } = render(FloatingPanel, {
      props: { visible: true, onClose },
    });
    await new Promise((r) => setTimeout(r, 50));
    await fireEvent.click(container.querySelector(".fp-body")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("接收 children（slot 内容）", async () => {
    const { container } = render(FloatingPanel, {
      props: {
        visible: true,
        children: createRawSnippet(() => ({
          render: () => '<div class="test-content">内容</div>',
        })),
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    const el = container.querySelector(".test-content");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("内容");
  });

  it("鼠标离开后触发 autoHide（autoHideDelay > 0 时）", async () => {
    const onClose = vi.fn();
    const { container } = render(FloatingPanel, {
      props: { visible: true, autoHideDelay: 100, onClose },
    });
    await new Promise((r) => setTimeout(r, 50));
    await fireEvent.mouseLeave(container.querySelector(".floating-panel")!);
    // 等待 autoHide 触发
    await new Promise((r) => setTimeout(r, 150));
    expect(onClose).toHaveBeenCalled();
  });

  it("鼠标进入取消自动收回", async () => {
    const onClose = vi.fn();
    const { container } = render(FloatingPanel, {
      props: { visible: true, autoHideDelay: 100, onClose },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = container.querySelector(".floating-panel")!;
    await fireEvent.mouseLeave(panel);
    await fireEvent.mouseEnter(panel);
    // 等待 autoHide 应该触发的时刻
    await new Promise((r) => setTimeout(r, 150));
    // mouseenter 取消了 autoHide，所以 close 不应被触发
    expect(onClose).not.toHaveBeenCalled();
  });
});
