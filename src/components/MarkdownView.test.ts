/**
 * MarkdownView 组件测试
 *
 * 覆盖:
 * - 渲染管线:renderMarkdown 成功/失败、rewriteImagesAndLinks 与 internal-link 回调、
 *   source 变化重渲染、renderTick 仅重渲染 mermaid(force)、卸载清理观察器
 * - 图片右键菜单:右键图片弹出并记录位置、右键非图片不弹、遮罩/Escape/Tab 关闭、
 *   Enter 激活、菜单位置钳制
 * - 全屏预览:菜单项打开、点击遮罩关闭、滚轮缩放(含 Ctrl 放行与图片未加载跳过)、
 *   拖拽平移(抑制 click 关闭)、双击 1x/3x、键盘 +/−/0/方向键/Escape、
 *   工具栏按钮、缩放上下限钳制、焦点还原
 *
 * mock:vue-i18n、useMarkdown(worker 渲染与数学/mermaid 渲染)、useLinkRewriter。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "image.zoom": "放大查看",
        "image.zoomIn": "放大",
        "image.zoomOut": "缩小",
        "image.reset": "重置",
        "image.close": "关闭",
        "image.hint": "滚轮缩放 · 拖拽平移",
      };
      return map[key] || key;
    },
  }),
}));

vi.mock("../composables/useMarkdown", () => ({
  renderMarkdown: vi.fn(),
  renderMath: vi.fn(),
  renderMermaid: vi.fn(),
  disposeMermaidObserver: vi.fn(),
}));

vi.mock("../composables/useLinkRewriter", () => ({
  rewriteImagesAndLinks: vi.fn(),
}));

import MarkdownView from "./MarkdownView.vue";
import {
  renderMarkdown,
  renderMath,
  renderMermaid,
  disposeMermaidObserver,
} from "../composables/useMarkdown";
import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

const IMAGE_HTML = '<p><img src="https://example.com/a.png" alt="示例图"></p>';

/** 当前测试挂载的 wrapper,afterEach 统一卸载(attachTo 需手动清理) */
let activeWrapper: ReturnType<typeof mount> | null = null;

function mountView(props: Record<string, unknown> = {}) {
  const wrapper = mount(MarkdownView, {
    props: {
      source: "# Hi",
      currentFile: "/a.md",
      rootDir: "/",
      ...props,
    },
    // attachTo 使焦点类操作(如 trapFocus 回绕)在 jsdom 中真实生效
    attachTo: document.body,
  });
  activeWrapper = wrapper;
  return wrapper;
}

afterEach(() => {
  activeWrapper?.unmount();
  activeWrapper = null;
});

function mountWithImage(props: Record<string, unknown> = {}) {
  vi.mocked(renderMarkdown).mockResolvedValue(IMAGE_HTML);
  return mountView(props);
}

/** VTU trigger 对 wheel 事件只读属性(clientX/ctrlKey)会抛错,改为手动派发 */
function dispatchWheel(el: Element, init: WheelEventInit): void {
  el.dispatchEvent(new WheelEvent("wheel", init));
}

/** 右键图片打开菜单 → 点击菜单项打开全屏预览 */
async function openZoom(
  wrapper: ReturnType<typeof mountView>
): Promise<ReturnType<typeof mountView>> {
  await flushPromises();
  await wrapper.find(".markdown-body img").trigger("contextmenu");
  await flushPromises();
  await wrapper.find(".image-menu-item").trigger("click");
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderMarkdown).mockResolvedValue("<p>hello</p>");
  vi.mocked(renderMath).mockResolvedValue(undefined);
  vi.mocked(renderMermaid).mockResolvedValue(undefined);
  vi.mocked(rewriteImagesAndLinks).mockImplementation(() => {});
});

describe("渲染管线", () => {
  it("将 markdown 渲染为 HTML", async () => {
    vi.mocked(renderMarkdown).mockResolvedValue("<h1>标题</h1>");
    const wrapper = mountView();
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledWith("# Hi");
    expect(wrapper.find(".markdown-body h1").text()).toBe("标题");
  });

  it("渲染完成后 emit rendered 并携带 root 元素", async () => {
    const wrapper = mountView();
    await flushPromises();
    const emitted = wrapper.emitted("rendered");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toBe(wrapper.find(".markdown-body").element);
  });

  it("调用 rewriteImagesAndLinks 且内部链接回调 emit internal-link", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(rewriteImagesAndLinks).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(rewriteImagesAndLinks).mock
      .calls[0][2] as (path: string, hash: string) => void;
    cb("/other.md", "sec");
    expect(wrapper.emitted("internal-link")![0]).toEqual(["/other.md", "sec"]);
  });

  it("渲染失败时显示错误占位", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(renderMarkdown).mockRejectedValue(new Error("boom"));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find(".markdown-body .mermaid-error").text()).toContain(
      "Markdown 渲染失败"
    );
    errorSpy.mockRestore();
  });

  it("source 变化时重新渲染", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    vi.mocked(renderMarkdown).mockResolvedValue("<p>new</p>");
    await wrapper.setProps({ source: "# New" });
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledWith("# New");
    expect(wrapper.find(".markdown-body p").text()).toBe("new");
  });

  it("renderTick 变化仅重渲染 mermaid(force)", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.setProps({ renderTick: 1 });
    await flushPromises();
    expect(renderMermaid).toHaveBeenCalledWith(
      wrapper.find(".markdown-body").element,
      true
    );
  });

  it("卸载时清理 mermaid 观察器", async () => {
    const wrapper = mountView();
    await flushPromises();
    wrapper.unmount();
    expect(disposeMermaidObserver).toHaveBeenCalled();
  });
});

describe("图片右键菜单", () => {
  it("右键图片弹出菜单并记录位置与内容", async () => {
    const wrapper = mountWithImage();
    await flushPromises();
    await wrapper
      .find(".markdown-body img")
      .trigger("contextmenu", { clientX: 120, clientY: 80 });
    await flushPromises();
    const menu = wrapper.find(".image-context-menu");
    expect(menu.exists()).toBe(true);
    expect(menu.attributes("style")).toContain("left: 120px");
    expect(menu.attributes("style")).toContain("top: 80px");
    expect(menu.text()).toContain("放大查看");
  });

  it("菜单位置超出视口时被钳制", async () => {
    const wrapper = mountWithImage();
    await flushPromises();
    await wrapper
      .find(".markdown-body img")
      .trigger("contextmenu", { clientX: 5000, clientY: 5000 });
    await flushPromises();
    const menu = wrapper.find(".image-context-menu");
    // jsdom 中菜单 getBoundingClientRect 为 0,宽高为 0 → 钳制到视口边缘
    expect(menu.attributes("style")).toContain(
      `left: ${window.innerWidth - 4}px`
    );
    expect(menu.attributes("style")).toContain(
      `top: ${window.innerHeight - 4}px`
    );
  });

  it("右键非图片区域不弹菜单", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".markdown-body").trigger("contextmenu");
    await flushPromises();
    expect(wrapper.find(".image-context-menu").exists()).toBe(false);
  });

  it("点击遮罩关闭菜单", async () => {
    const wrapper = mountWithImage();
    await flushPromises();
    await wrapper.find(".markdown-body img").trigger("contextmenu");
    await flushPromises();
    expect(wrapper.find(".image-context-menu").exists()).toBe(true);
    await wrapper.find(".image-context-overlay").trigger("click");
    await flushPromises();
    expect(wrapper.find(".image-context-menu").exists()).toBe(false);
  });

  it("Escape/Tab 关闭菜单", async () => {
    const wrapper = mountWithImage();
    await flushPromises();
    const img = wrapper.find(".markdown-body img");
    await img.trigger("contextmenu");
    await flushPromises();
    await wrapper.find(".image-context-menu").trigger("keydown", { key: "Tab" });
    await flushPromises();
    expect(wrapper.find(".image-context-menu").exists()).toBe(false);
    // 重新打开,Escape 同样关闭
    await img.trigger("contextmenu");
    await flushPromises();
    await wrapper.find(".image-context-menu").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find(".image-context-menu").exists()).toBe(false);
  });

  it("Enter/Space 激活菜单项打开预览", async () => {
    const wrapper = mountWithImage();
    await flushPromises();
    const img = wrapper.find(".markdown-body img");
    await img.trigger("contextmenu");
    await flushPromises();
    await wrapper.find(".image-context-menu").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.find(".zoom-overlay").exists()).toBe(true);
    // 重新打开,Space 同样激活
    await img.trigger("contextmenu");
    await flushPromises();
    await wrapper.find(".image-context-menu").trigger("keydown", { key: " " });
    await flushPromises();
    expect(wrapper.find(".zoom-overlay").exists()).toBe(true);
  });
});

describe("全屏预览", () => {
  it("点击菜单项打开预览并携带 src/alt 与标题说明", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    expect(overlay.exists()).toBe(true);
    const img = wrapper.find(".zoom-image");
    expect(img.attributes("src")).toBe("https://example.com/a.png");
    expect(img.attributes("alt")).toBe("示例图");
    expect(wrapper.find(".zoom-info").text()).toBe("100%");
    // alt 存在时显示 caption
    expect(wrapper.find(".zoom-caption").text()).toBe("示例图");
  });

  it("图片无 alt 时预览不显示 caption", async () => {
    vi.mocked(renderMarkdown).mockResolvedValue(
      '<p><img src="https://example.com/b.png"></p>'
    );
    const wrapper = await openZoom(mountView());
    expect(wrapper.find(".zoom-overlay").exists()).toBe(true);
    expect(wrapper.find(".zoom-caption").exists()).toBe(false);
  });

  it("点击遮罩关闭预览", async () => {
    const wrapper = await openZoom(mountWithImage());
    await wrapper.find(".zoom-overlay").trigger("click");
    await flushPromises();
    expect(wrapper.find(".zoom-overlay").exists()).toBe(false);
  });

  it("滚轮缩放(以鼠标位置为中心)并可缩小回退", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    vi.spyOn(img.element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect);
    const overlay = wrapper.find(".zoom-overlay");
    dispatchWheel(overlay.element, { deltaY: -100, clientX: 100, clientY: 100 });
    await nextTick();
    expect(img.attributes("style")).toContain("scale(1.25)");
    expect(wrapper.find(".zoom-info").text()).toBe("125%");
    dispatchWheel(overlay.element, { deltaY: 100 });
    await nextTick();
    expect(img.attributes("style")).toContain("scale(1)");
  });

  it("Ctrl/Cmd+滚轮交给应用层,不缩放", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    vi.spyOn(img.element, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200,
      width: 200, height: 200, toJSON: () => ({}),
    } as DOMRect);
    dispatchWheel(wrapper.find(".zoom-overlay").element, { deltaY: -100, ctrlKey: true });
    await nextTick();
    expect(img.attributes("style")).toContain("scale(1)");
  });

  it("图片未加载(尺寸 0)时滚轮不缩放", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    // jsdom getBoundingClientRect 默认返回全 0 → 提前返回
    dispatchWheel(wrapper.find(".zoom-overlay").element, { deltaY: -100 });
    await nextTick();
    expect(img.attributes("style")).toContain("scale(1)");
  });

  it("拖拽平移且不触发 click 关闭", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    const img = wrapper.find(".zoom-image");
    await overlay.trigger("mousedown", { button: 0, clientX: 100, clientY: 100 });
    await overlay.trigger("mousemove", { clientX: 130, clientY: 110 });
    expect(img.attributes("style")).toContain("translate(30px, 10px)");
    await overlay.trigger("mouseup");
    await overlay.trigger("click");
    await flushPromises();
    // 拖拽后的 click 被抑制,预览保持打开
    expect(wrapper.find(".zoom-overlay").exists()).toBe(true);
  });

  it("双击切换 1x / 3x", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    await img.trigger("dblclick");
    expect(img.attributes("style")).toContain("scale(3)");
    await img.trigger("dblclick");
    expect(img.attributes("style")).toContain("scale(1)");
  });

  it("键盘 +/−/0/方向键 与 Escape 关闭", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    const img = wrapper.find(".zoom-image");
    await overlay.trigger("keydown", { key: "+" });
    expect(img.attributes("style")).toContain("scale(1.25)");
    await overlay.trigger("keydown", { key: "0" });
    expect(img.attributes("style")).toContain("scale(1)");
    await overlay.trigger("keydown", { key: "ArrowRight" });
    expect(img.attributes("style")).toContain("translate(40px, 0px)");
    await overlay.trigger("keydown", { key: "ArrowDown" });
    expect(img.attributes("style")).toContain("translate(40px, 40px)");
    await overlay.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find(".zoom-overlay").exists()).toBe(false);
  });

  it("Ctrl+按键不缩放(交给应用层)", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    await wrapper
      .find(".zoom-overlay")
      .trigger("keydown", { key: "+", ctrlKey: true });
    expect(img.attributes("style")).toContain("scale(1)");
  });

  it("缩放上限钳制为 10x", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    for (let i = 0; i < 12; i++) {
      await overlay.trigger("keydown", { key: "+" });
    }
    expect(wrapper.find(".zoom-info").text()).toBe("1000%");
    await overlay.trigger("keydown", { key: "0" });
    expect(wrapper.find(".zoom-info").text()).toBe("100%");
  });

  it("缩放下限钳制为 0.5x", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    for (let i = 0; i < 15; i++) {
      await overlay.trigger("keydown", { key: "-" });
    }
    expect(wrapper.find(".zoom-info").text()).toBe("50%");
  });

  it("工具栏按钮:缩小/放大/重置/关闭", async () => {
    const wrapper = await openZoom(mountWithImage());
    const img = wrapper.find(".zoom-image");
    await wrapper.find(".zoom-btn[aria-label='放大']").trigger("click");
    expect(img.attributes("style")).toContain("scale(1.25)");
    await wrapper.find(".zoom-btn[aria-label='缩小']").trigger("click");
    expect(img.attributes("style")).toContain("scale(1)");
    await wrapper.find(".zoom-btn[aria-label='放大']").trigger("click");
    await wrapper.find(".zoom-btn[aria-label='重置']").trigger("click");
    expect(img.attributes("style")).toContain("scale(1)");
    await wrapper.find(".zoom-btn[aria-label='关闭']").trigger("click");
    await flushPromises();
    expect(wrapper.find(".zoom-overlay").exists()).toBe(false);
  });

  it("关闭预览后焦点还原到打开前元素", async () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.focus();
    try {
      const wrapper = await openZoom(mountWithImage());
      await wrapper.find(".zoom-overlay").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(document.activeElement).toBe(btn);
    } finally {
      btn.remove();
    }
  });

  it("Tab 焦点陷阱在预览内循环", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    const buttons = wrapper.findAll(".zoom-btn");
    const first = buttons[0].element as HTMLElement;
    const last = buttons[buttons.length - 1].element as HTMLElement;
    // Shift+Tab 从第一个回绕到最后一个
    first.focus();
    await overlay.trigger("keydown", { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Tab 从最后一个回绕到第一个
    await overlay.trigger("keydown", { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("mouseleave 结束拖拽后不再平移", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    const img = wrapper.find(".zoom-image");
    await overlay.trigger("mousedown", { button: 0, clientX: 100, clientY: 100 });
    await overlay.trigger("mousemove", { clientX: 130, clientY: 100 });
    expect(img.attributes("style")).toContain("translate(30px, 0px)");
    await overlay.trigger("mouseleave");
    await overlay.trigger("mousemove", { clientX: 200, clientY: 100 });
    // 拖拽已结束,translate 不再更新
    expect(img.attributes("style")).toContain("translate(30px, 0px)");
  });

  it("预览内右键被阻止(不弹出浏览器菜单)", async () => {
    const wrapper = await openZoom(mountWithImage());
    const overlay = wrapper.find(".zoom-overlay");
    const evt = new MouseEvent("contextmenu", {
      cancelable: true,
      bubbles: true,
    });
    overlay.element.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
