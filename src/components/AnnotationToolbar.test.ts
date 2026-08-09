/**
 * AnnotationToolbar 组件测试
 *
 * 覆盖:渲染/隐藏、按钮 emit、输入弹层交互(确认/取消/Enter/Esc)、
 * 视口边缘夹紧与翻转(computeToolbarPosition 纯函数)。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import AnnotationToolbar, {
  type AnnotationToolbarMode,
} from "./AnnotationToolbar.vue";
import { computeToolbarPosition } from "../composables/toolbarPosition";

const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      annotation: {
        groupClipboard: "剪贴板",
        groupAI: "AI",
        groupAnnotations: "批注",
        del: "删除",
        ins: "新增",
        sub: "替换",
        hl: "高亮",
        comment: "评论",
        copyAI: "复制给 AI",
        copyPlain: "复制",
        paste: "粘贴",
        clearAll: "清除全部",
        review: "审阅",
        ai: "AI",
        inputPlaceholder: "输入内容…",
        subPlaceholder: "替换为…",
        commentPlaceholder: "评论内容…",
        confirm: "确定",
        cancel: "取消",
      },
      ai: {
        title: "AI 助手",
      },
    },
  },
});

function mountToolbar(props: {
  visible?: boolean;
  x?: number;
  y?: number;
  mode?: AnnotationToolbarMode;
} = {}) {
  const wrapper = mount(AnnotationToolbar, {
    global: { plugins: [i18n] },
    props: {
      visible: props.visible ?? true,
      x: props.x ?? 100,
      y: props.y ?? 200,
      mode: props.mode ?? "",
    },
  });
  return wrapper;
}

describe("AnnotationToolbar - 渲染", () => {
  it("visible=true 时渲染五个批注按钮与复制/粘贴/复制给AI/清除/审阅/AI", () => {
    const wrapper = mountToolbar();
    const buttons = wrapper.findAll("button");
    expect(buttons.length).toBe(11);
    expect(wrapper.find(".at-del").exists()).toBe(true);
    expect(wrapper.find(".at-ins").exists()).toBe(true);
    expect(wrapper.find(".at-sub").exists()).toBe(true);
    expect(wrapper.find(".at-hl").exists()).toBe(true);
    expect(wrapper.find(".at-comment").exists()).toBe(true);
    expect(wrapper.find(".at-copy").exists()).toBe(true);
    expect(wrapper.find(".at-clear").exists()).toBe(true);
    expect(wrapper.find(".at-review").exists()).toBe(true);
    expect(wrapper.find(".at-ai").exists()).toBe(true);
    expect(wrapper.find(".at-sep").exists()).toBe(true);
  });

  it("visible=false 时不渲染工具栏", () => {
    const wrapper = mountToolbar({ visible: false });
    expect(wrapper.find(".annotation-toolbar").exists()).toBe(false);
  });

  it("三带结构:剪贴板/AI/批注各一行,组名标签存在", () => {
    const wrapper = mountToolbar();
    const bands = wrapper.findAll(".at-band");
    expect(bands.length).toBe(3);
    const labels = wrapper.findAll(".at-band-label").map((n) => n.text());
    expect(labels).toEqual(["剪贴板", "AI", "批注"]);
    // 第一带:复制/粘贴;第二带:AI;第三带:批注全量
    expect(bands[0].find(".at-copy-plain").exists()).toBe(true);
    expect(bands[0].find(".at-paste").exists()).toBe(true);
    expect(bands[1].find(".at-ai").exists()).toBe(true);
    expect(bands[2].find(".at-del").exists()).toBe(true);
    expect(bands[2].find(".at-copy").exists()).toBe(true);
    expect(bands[2].find(".at-review").exists()).toBe(true);
  });
});

describe("AnnotationToolbar - 按钮 emit", () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    wrapper = mountToolbar();
  });

  afterEach(() => {
    wrapper.unmount();
    vi.clearAllMocks();
  });

  it("点击删除立即 emit apply('del')", async () => {
    await wrapper.find(".at-del").trigger("click");
    expect(wrapper.emitted("apply")?.[0]).toEqual(["del"]);
  });

  it("点击高亮立即 emit apply('hl')", async () => {
    await wrapper.find(".at-hl").trigger("click");
    expect(wrapper.emitted("apply")?.[0]).toEqual(["hl"]);
  });

  it("点击新增 emit input-start('ins') 而非直接 apply", async () => {
    await wrapper.find(".at-ins").trigger("click");
    expect(wrapper.emitted("input-start")?.[0]).toEqual(["ins"]);
    expect(wrapper.emitted("apply")).toBeUndefined();
  });

  it("点击复制纯文本 emit copy", async () => {
    await wrapper.find(".at-copy-plain").trigger("click");
    expect(wrapper.emitted("copy")).toBeTruthy();
  });

  it("点击粘贴 emit paste", async () => {
    await wrapper.find(".at-paste").trigger("click");
    expect(wrapper.emitted("paste")).toBeTruthy();
  });

  it("点击替换 emit input-start('sub')", async () => {
    await wrapper.find(".at-sub").trigger("click");
    expect(wrapper.emitted("input-start")?.[0]).toEqual(["sub"]);
  });

  it("点击评论 emit input-start('comment')", async () => {
    await wrapper.find(".at-comment").trigger("click");
    expect(wrapper.emitted("input-start")?.[0]).toEqual(["comment"]);
  });

  it("点击复制给 AI emit copy-ai", async () => {
    await wrapper.find(".at-copy").trigger("click");
    expect(wrapper.emitted("copy-ai")).toBeTruthy();
  });

  it("点击清除全部 emit clear-all", async () => {
    await wrapper.find(".at-clear").trigger("click");
    expect(wrapper.emitted("clear-all")).toBeTruthy();
  });

  it("点击审阅 emit review", async () => {
    await wrapper.find(".at-review").trigger("click");
    expect(wrapper.emitted("review")).toBeTruthy();
  });

  it("点击 AI emit ai", async () => {
    await wrapper.find(".at-ai").trigger("click");
    expect(wrapper.emitted("ai")).toBeTruthy();
  });
});

describe("AnnotationToolbar - 输入弹层", () => {
  let wrapper: VueWrapper;

  function mountInput(mode: AnnotationToolbarMode) {
    wrapper = mountToolbar({ mode });
    return wrapper;
  }

  afterEach(() => {
    wrapper?.unmount();
    vi.clearAllMocks();
  });

  it("mode='ins' 时显示输入框与确定/取消,隐藏批注按钮", async () => {
    const w = mountInput("ins");
    await nextTick();
    expect(w.find(".at-input").exists()).toBe(true);
    expect(w.find(".at-del").exists()).toBe(false);
    expect(w.findAll("button").length).toBe(2);
  });

  it("输入内容后点击确定 emit apply('ins', 文本)", async () => {
    const w = mountInput("ins");
    await nextTick();
    await w.find(".at-input").setValue("新增内容");
    await w.find(".at-confirm").trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual(["ins", "新增内容"]);
  });

  it("输入为空白时确定按钮禁用", async () => {
    const w = mountInput("comment");
    await nextTick();
    expect(w.find(".at-confirm").attributes("disabled")).toBeDefined();
  });

  it("点击取消 emit cancel", async () => {
    const w = mountInput("sub");
    await nextTick();
    await w.find("button.at-btn:not(.at-confirm)").trigger("click");
    expect(w.emitted("cancel")).toBeTruthy();
  });

  it("Enter 确认,Esc 取消", async () => {
    const w = mountInput("ins");
    await nextTick();
    await w.find(".at-input").setValue("x");
    await w.find(".at-input").trigger("keydown.enter");
    expect(w.emitted("apply")?.[0]).toEqual(["ins", "x"]);

    const w2 = mountInput("comment");
    await nextTick();
    await w2.find(".at-input").trigger("keydown.esc");
    expect(w2.emitted("cancel")).toBeTruthy();
  });

  it("替换使用替换专用占位符", async () => {
    const w = mountInput("sub");
    await nextTick();
    expect(w.find(".at-input").attributes("placeholder")).toBe("替换为…");
  });

  it("评论使用评论专用占位符", async () => {
    const w = mountInput("comment");
    await nextTick();
    expect(w.find(".at-input").attributes("placeholder")).toBe("评论内容…");
  });

  it("输入为空白时 Enter 确认不发 apply", async () => {
    const w = mountInput("ins");
    await nextTick();
    await w.find(".at-input").trigger("keydown.enter");
    expect(w.emitted("apply")).toBeUndefined();
  });

  it("输入弹层模式下输入框获得焦点", async () => {
    const focusSpy = vi
      .spyOn(HTMLInputElement.prototype, "focus")
      .mockImplementation(() => {});
    try {
      const w = mountToolbar({ mode: "" });
      await w.setProps({ mode: "ins" });
      await nextTick();
      await nextTick();
      expect(focusSpy).toHaveBeenCalled();
    } finally {
      focusSpy.mockRestore();
    }
  });

  it("坐标变化时重新定位工具栏", async () => {
    const w = mountToolbar({ x: 100, y: 200 });
    await w.setProps({ x: 300, y: 250 });
    // reposition 在异步 watch 回调中执行,需 flush 完 microtask/nextTick 链
    await flushPromises();
    const style = w.find(".annotation-toolbar").attributes("style");
    // jsdom 中工具栏 getBoundingClientRect 为 0:left=x,top=y+10
    expect(style).toContain("left: 300px");
    expect(style).toContain("top: 260px");
  });
});

describe("computeToolbarPosition - 视口边缘夹紧与翻转", () => {
  const base = {
    x: 400,
    y: 300,
    width: 240,
    height: 36,
    viewportWidth: 1024,
    viewportHeight: 768,
  };

  it("常规位置:居中于 x,位于选区下方", () => {
    const { left, top } = computeToolbarPosition(base);
    expect(left).toBe(400 - 120);
    expect(top).toBe(300 + 10);
  });

  it("右侧越界时夹紧到视口边缘", () => {
    const { left } = computeToolbarPosition({
      ...base,
      x: 1000,
      viewportWidth: 1024,
    });
    expect(left).toBeLessThanOrEqual(1024 - 8 - 240);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it("左侧越界时夹紧到左侧边缘", () => {
    const { left } = computeToolbarPosition({ ...base, x: 10 });
    expect(left).toBe(8);
  });

  it("下方放不下且上方有空间时翻转到选区上方", () => {
    const { top } = computeToolbarPosition({
      ...base,
      y: 740,
      viewportHeight: 768,
    });
    expect(top).toBe(740 - 36 - 10);
  });

  it("上下都放不下时夹紧到视口顶部", () => {
    const { top } = computeToolbarPosition({
      ...base,
      y: 20,
      height: 800,
      viewportHeight: 768,
    });
    // 工具栏比视口还高:无法完整容纳,按上方优先夹紧到 8px
    expect(top).toBe(8);
  });

  it("工具栏宽于视口时限制宽度", () => {
    const { left } = computeToolbarPosition({
      ...base,
      width: 2000,
      viewportWidth: 1024,
    });
    expect(left).toBe(8);
  });
});
