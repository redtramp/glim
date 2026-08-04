/**
 * ReviewPanel 组件测试
 *
 * 覆盖:列表渲染(类型/内容/行号)、空态、逐条接受/拒绝 emit、
 * 全部接受/拒绝 emit、点击条目 focus、关闭。
 * 组件为纯展示+事件,决策逻辑在 App 侧(由 criticMarkup.test.ts 覆盖)。
 */

import { describe, it, expect } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import ReviewPanel from "./ReviewPanel.vue";

const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  messages: {
    "zh-CN": {
      review: {
        title: "审阅批注",
        accept: "接受",
        reject: "拒绝",
        acceptAll: "全部接受",
        rejectAll: "全部拒绝",
        empty: "文档中没有批注",
        count: "{n} 条批注",
        typeDel: "删除",
        typeIns: "新增",
        typeSub: "替换",
        typeHl: "高亮",
        typeComment: "评论",
      },
    },
  },
});

function mountPanel(props: { visible?: boolean; source?: string; fileName?: string } = {}) {
  return mount(ReviewPanel, {
    global: { plugins: [i18n] },
    props: {
      visible: props.visible ?? true,
      source: props.source ?? "",
      fileName: props.fileName ?? "test.md",
    },
  });
}

describe("ReviewPanel - 渲染", () => {
  it("visible=false 时不渲染", () => {
    const wrapper = mountPanel({ visible: false });
    expect(wrapper.find(".rv-overlay").exists()).toBe(false);
  });

  it("空源显示空态文案", () => {
    const wrapper = mountPanel();
    expect(wrapper.find(".rv-empty").exists()).toBe(true);
    expect(wrapper.find(".rv-item").exists()).toBe(false);
  });

  it("五种批注类型均渲染为条目", () => {
    const wrapper = mountPanel({
      source:
        "a{--del--}b{++ins++}c{~~old~>new~~}d{==hl==}e{>>cmt<<}f",
    });
    const items = wrapper.findAll(".rv-item");
    expect(items).toHaveLength(5);
    const labels = items.map((i) => i.find(".rv-type").text());
    expect(labels).toEqual(["删除", "新增", "替换", "高亮", "评论"]);
  });

  it("删除批注显示删除线旧文本,无新文本", () => {
    const wrapper = mountPanel({ source: "a{--bad--}b" });
    expect(wrapper.find(".rv-old").text()).toBe("bad");
    expect(wrapper.find(".rv-new").exists()).toBe(false);
  });

  it("替换批注同时显示旧→新", () => {
    const wrapper = mountPanel({ source: "x{~~old~>new~~}y" });
    expect(wrapper.find(".rv-old").text()).toBe("old");
    expect(wrapper.find(".rv-new").text()).toBe("new");
    expect(wrapper.find(".rv-arrow").exists()).toBe(true);
  });

  it("行号显示 1-based 起始行", () => {
    const wrapper = mountPanel({ source: "line1\nline2{==x==}" });
    expect(wrapper.find(".rv-line").text()).toBe("L2");
  });

  it("计数显示批注条数", () => {
    const wrapper = mountPanel({ source: "a{--x--}b{++y++}c" });
    expect(wrapper.find(".rv-count").text()).toBe("2 条批注");
  });
});

describe("ReviewPanel - 事件", () => {
  let wrapper: VueWrapper;

  function mountSample() {
    wrapper = mountPanel({ source: "a{--x--}b{++y++}c" });
    return wrapper;
  }

  it("点击接受按钮 emit apply('accept', id)", async () => {
    const w = mountSample();
    await w.find('[data-action="accept-0"]').trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual(["accept", 0]);
  });

  it("点击拒绝按钮 emit apply('reject', id)", async () => {
    const w = mountSample();
    await w.find('[data-action="reject-1"]').trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual(["reject", 1]);
  });

  it("点击条目 emit focus(id)", async () => {
    const w = mountSample();
    await w.findAll(".rv-item")[1].trigger("click");
    expect(w.emitted("focus")?.[0]).toEqual([1]);
  });

  it("点击条目内按钮不触发 focus(事件冒泡被阻止)", async () => {
    const w = mountSample();
    await w.find('[data-action="accept-0"]').trigger("click");
    expect(w.emitted("focus")).toBeUndefined();
  });

  it("全部接受 emit apply-all('accept')", async () => {
    const w = mountSample();
    await w.find('[data-action="accept-all"]').trigger("click");
    expect(w.emitted("apply-all")?.[0]).toEqual(["accept"]);
  });

  it("全部拒绝 emit apply-all('reject')", async () => {
    const w = mountSample();
    await w.find('[data-action="reject-all"]').trigger("click");
    expect(w.emitted("apply-all")?.[0]).toEqual(["reject"]);
  });

  it("关闭按钮 emit close", async () => {
    const w = mountSample();
    await w.find('[data-action="close"]').trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("点击遮罩 emit close", async () => {
    const w = mountSample();
    await w.find(".rv-overlay").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });
});
