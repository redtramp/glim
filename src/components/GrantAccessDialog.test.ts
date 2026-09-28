/**
 * GrantAccessDialog 单测
 *
 * 覆盖:标题/目录/文案渲染、授权与拒绝按钮 emit、点击遮罩拒绝。
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { i18n } from "../i18n";
import GrantAccessDialog from "./GrantAccessDialog.vue";

function mountDialog(visible = true) {
  return mount(GrantAccessDialog, {
    props: { visible, dir: "/opt/app/.config" },
    global: { plugins: [i18n] },
  });
}

describe("GrantAccessDialog", () => {
  it("visible=false 时不渲染", () => {
    expect(mountDialog(false).find(".dialog").exists()).toBe(false);
  });

  it("渲染标题、目录与说明", () => {
    const wrapper = mountDialog();
    expect(wrapper.find(".title").text()).toBe(i18n.global.t("grant.title"));
    expect(wrapper.find(".dir").text()).toBe("/opt/app/.config");
    expect(wrapper.find(".message").text()).toBe(i18n.global.t("grant.message"));
  });

  it("点击授权 emit allow,点击取消 emit deny", async () => {
    const wrapper = mountDialog();
    const buttons = wrapper.findAll("button");
    await buttons[buttons.length - 1].trigger("click");
    expect(wrapper.emitted("allow")).toHaveLength(1);
    await buttons[0].trigger("click");
    expect(wrapper.emitted("deny")).toHaveLength(1);
  });

  it("点击遮罩 emit deny", async () => {
    const wrapper = mountDialog();
    await wrapper.find(".overlay").trigger("click");
    expect(wrapper.emitted("deny")).toHaveLength(1);
  });

  it("允许覆盖默认按钮文案", () => {
    const wrapper = mount(GrantAccessDialog, {
      props: { visible: true, dir: "/a", allowLabel: "自定义允许", denyLabel: "自定义取消" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain("自定义允许");
    expect(wrapper.text()).toContain("自定义取消");
  });
});
