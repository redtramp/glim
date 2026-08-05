/**
 * FloatingPanel 组件测试
 *
 * 测试目标:
 * - visible prop 控制显示/隐藏
 * - side prop 控制滑入方向
 * - 动画 class 切换
 * - 磨砂玻璃背景
 * - 外部点击关闭
 * - 键盘事件
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FloatingPanel from "./FloatingPanel.vue";

describe("FloatingPanel", () => {
  it("visible=false 时不渲染内容", () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: false },
    });
    expect(wrapper.find(".floating-panel").exists()).toBe(false);
  });

  it("visible=true 时渲染浮层", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true },
    });
    // showContent 通过 watch 异步更新
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.find(".floating-panel").exists()).toBe(true);
  });

  it("side='left' 时浮层从左侧滑入", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, side: "left" },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = wrapper.find(".floating-panel");
    expect(panel.classes()).toContain("left");
    expect(panel.classes()).toContain("entering");
  });

  it("side='right' 时浮层从右侧滑入", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, side: "right" },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = wrapper.find(".floating-panel");
    expect(panel.classes()).toContain("right");
  });

  it("side='bottom' 时浮层从底部滑入", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, side: "bottom" },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = wrapper.find(".floating-panel");
    expect(panel.classes()).toContain("bottom");
  });

  it("底部弹出模式显示拖拽手柄", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, side: "bottom" },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.find(".fp-handle").exists()).toBe(true);
  });

  it("左侧/右侧浮层不显示拖拽手柄", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, side: "left" },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.find(".fp-handle").exists()).toBe(false);
  });

  it("visible 从 true 变为 false 时添加 leaving class", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.setProps({ visible: false });
    // 切换后 showContent 仍然为 true（动画延迟卸载）
    const panel = wrapper.find(".floating-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.classes()).toContain("leaving");
  });

  it("自定义宽度生效", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, width: 280 },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = wrapper.find(".floating-panel");
    expect(panel.attributes("style")).toContain("width: 280px");
  });

  it("自定义 zIndex 生效", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, zIndex: 100 },
    });
    await new Promise((r) => setTimeout(r, 50));
    const panel = wrapper.find(".floating-panel");
    expect(panel.attributes("style")).toContain("z-index: 100");
  });

  it("点击浮层内部不触发 close emit", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.find(".fp-body").trigger("click");
    expect(wrapper.emitted("close")).toBeFalsy();
  });

  it("接收 slot 内容", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true },
      slots: { default: '<div class="test-content">内容</div>' },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.find(".test-content").exists()).toBe(true);
    expect(wrapper.find(".test-content").text()).toBe("内容");
  });

  it("鼠标离开后触发 autoHide（autoHideDelay > 0 时）", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, autoHideDelay: 100 },
    });
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.find(".floating-panel").trigger("mouseleave");
    // 等待 autoHide 触发
    await new Promise((r) => setTimeout(r, 150));
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("鼠标进入取消自动收回", async () => {
    const wrapper = mount(FloatingPanel, {
      props: { visible: true, autoHideDelay: 100 },
    });
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.find(".floating-panel").trigger("mouseleave");
    await wrapper.find(".floating-panel").trigger("mouseenter");
    // 等待 autoHide 应该触发的时刻
    await new Promise((r) => setTimeout(r, 150));
    // mouseenter 取消了 autoHide，所以 close 不应被 emit
    expect(wrapper.emitted("close")).toBeFalsy();
  });
});