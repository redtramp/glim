/**
 * MarkdownView 组件测试（Vue test-utils → @testing-library/svelte 迁移）
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
 * 迁移要点:
 * - defineEmits(rendered/internal-link) → 回调 props(onRendered/onInternalLink)
 * - mount(attachTo) → render(container 自动挂到 body,focus 类断言可用)
 * - wrapper.find/exists/attributes/text → container.querySelector/getAttribute/textContent
 * - setProps → rerender；VTU flushPromises/nextTick → 本地 flushPromises(macrotask + svelte tick)
 * - vue-i18n 实例 → mock 自研 i18n(locale.svelte.ts)，文案沿用原测试
 * - wheel 仍手动派发(VTU/只读属性限制)；contextmenu/dblClick/mouseLeave 改用 fireEvent
 *
 * mock:i18n、useMarkdown(worker 渲染与数学/mermaid 渲染)、useLinkRewriter。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  type RenderResult,
} from "@testing-library/svelte";
import { tick } from "svelte";

// Mock 自研 i18n（原 vue-i18n 实例的等价迁移，文案沿用原测试）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "image.zoom": "放大查看",
      "image.zoomIn": "放大",
      "image.zoomOut": "缩小",
      "image.reset": "重置",
      "image.close": "关闭",
      "image.hint": "滚轮缩放 · 拖拽平移",
      "image.fullscreen": "全屏",
      "image.exitFullscreen": "退出全屏",
      "mermaid.zoom": "放大查看图表",
      "mermaid.zoomIn": "放大",
      "mermaid.zoomOut": "缩小",
      "mermaid.reset": "重置",
      "mermaid.fullscreen": "全屏",
      "mermaid.exitFullscreen": "退出全屏",
      "mermaid.close": "关闭",
      "mermaid.hint": "滚轮缩放 · 拖拽平移",
    };
    return map[key] || key;
  },
  locale: { value: "zh-CN" },
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

import MarkdownView from "./MarkdownView.svelte";
import {
  renderMarkdown,
  renderMath,
  renderMermaid,
  disposeMermaidObserver,
} from "../composables/useMarkdown";
import { rewriteImagesAndLinks } from "../composables/useLinkRewriter";

const IMAGE_HTML = '<p><img src="https://example.com/a.png" alt="示例图"></p>';

type Mock = ReturnType<typeof vi.fn>;
type ViewRendered = RenderResult<typeof MarkdownView> & {
  onRendered: Mock;
  onInternalLink: Mock;
};

interface ViewProps {
  source?: string;
  currentFile?: string;
  rootDir?: string;
  renderTick?: number;
}

function renderView(props: ViewProps = {}): ViewRendered {
  const onRendered = vi.fn();
  const onInternalLink = vi.fn();
  const result = render(MarkdownView, {
    props: {
      source: "# Hi",
      currentFile: "/a.md",
      rootDir: "/",
      ...props,
      onRendered,
      onInternalLink,
    },
  });
  return { ...result, onRendered, onInternalLink };
}

/** 等待 mock promise 链完成并刷新 Svelte 微任务（替代 VTU flushPromises） */
async function flushPromises(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

/** wheel 的 clientX/ctrlKey 等只读属性经 fireEvent 包装易失真，改为手动派发 */
function dispatchWheel(el: Element, init: WheelEventInit): void {
  el.dispatchEvent(new WheelEvent("wheel", init));
}

/** 右键图片打开菜单 → 点击菜单项打开全屏预览 */
async function openZoom(r: ViewRendered): Promise<ViewRendered> {
  await flushPromises();
  await fireEvent.contextMenu(
    r.container.querySelector(".markdown-body img")!
  );
  await flushPromises();
  await fireEvent.click(r.container.querySelector(".image-menu-item")!);
  await flushPromises();
  return r;
}

function renderWithImage(props: ViewProps = {}): ViewRendered {
  vi.mocked(renderMarkdown).mockResolvedValue(IMAGE_HTML);
  return renderView(props);
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  // 与 Banner.test 相同：种子 locale，保证自研 i18n 在 zh-CN 下取词
  localStorage.setItem("glim-reader-locale", "zh-CN");
  vi.mocked(renderMarkdown).mockResolvedValue("<p>hello</p>");
  vi.mocked(renderMath).mockResolvedValue(undefined);
  vi.mocked(renderMermaid).mockResolvedValue(undefined);
  vi.mocked(rewriteImagesAndLinks).mockImplementation(() => {});
});

describe("渲染管线", () => {
  it("将 markdown 渲染为 HTML", async () => {
    vi.mocked(renderMarkdown).mockResolvedValue("<h1>标题</h1>");
    const { container } = renderView();
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledWith("# Hi");
    expect(container.querySelector(".markdown-body h1")!.textContent).toBe(
      "标题"
    );
  });

  it("渲染完成后回调 rendered 并携带 root 元素", async () => {
    const { container, onRendered } = renderView();
    await flushPromises();
    expect(onRendered).toHaveBeenCalled();
    expect(onRendered.mock.calls[0][0]).toBe(
      container.querySelector(".markdown-body")
    );
  });

  it("调用 rewriteImagesAndLinks 且内部链接回调 internal-link", async () => {
    const { onInternalLink } = renderView();
    await flushPromises();
    expect(rewriteImagesAndLinks).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(rewriteImagesAndLinks).mock.calls[0][2] as (
      path: string,
      hash: string
    ) => void;
    cb("/other.md", "sec");
    expect(onInternalLink).toHaveBeenCalledWith("/other.md", "sec");
  });

  it("渲染失败时显示错误占位", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(renderMarkdown).mockRejectedValue(new Error("boom"));
    const { container } = renderView();
    await flushPromises();
    expect(
      container.querySelector(".markdown-body .mermaid-error")!.textContent
    ).toContain("Markdown 渲染失败");
    errorSpy.mockRestore();
  });

  it("source 变化时重新渲染", async () => {
    const { container, rerender } = renderView();
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    vi.mocked(renderMarkdown).mockResolvedValue("<p>new</p>");
    await rerender({ source: "# New" });
    await flushPromises();
    expect(renderMarkdown).toHaveBeenCalledWith("# New");
    expect(container.querySelector(".markdown-body p")!.textContent).toBe(
      "new"
    );
  });

  it("renderTick 变化仅重渲染 mermaid(force)", async () => {
    const { container, rerender } = renderView();
    await flushPromises();
    await rerender({ renderTick: 1 });
    await flushPromises();
    expect(renderMermaid).toHaveBeenCalledWith(
      container.querySelector(".markdown-body"),
      true
    );
  });

  it("卸载时清理 mermaid 观察器", async () => {
    const { unmount } = renderView();
    await flushPromises();
    unmount();
    expect(disposeMermaidObserver).toHaveBeenCalled();
  });
});

describe("图片右键菜单", () => {
  it("右键图片弹出菜单并记录位置与内容", async () => {
    const { container } = renderWithImage();
    await flushPromises();
    await fireEvent.contextMenu(container.querySelector(".markdown-body img")!, {
      clientX: 120,
      clientY: 80,
    });
    await flushPromises();
    const menu = container.querySelector(".image-context-menu");
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute("style")).toContain("left: 120px");
    expect(menu!.getAttribute("style")).toContain("top: 80px");
    expect(menu!.textContent).toContain("放大查看");
  });

  it("菜单位置超出视口时被钳制", async () => {
    const { container } = renderWithImage();
    await flushPromises();
    await fireEvent.contextMenu(container.querySelector(".markdown-body img")!, {
      clientX: 5000,
      clientY: 5000,
    });
    await flushPromises();
    const menu = container.querySelector(".image-context-menu");
    // jsdom 中菜单 getBoundingClientRect 为 0,宽高为 0 → 钳制到视口边缘
    expect(menu!.getAttribute("style")).toContain(
      `left: ${window.innerWidth - 4}px`
    );
    expect(menu!.getAttribute("style")).toContain(
      `top: ${window.innerHeight - 4}px`
    );
  });

  it("右键非图片区域不弹菜单", async () => {
    const { container } = renderView();
    await flushPromises();
    await fireEvent.contextMenu(container.querySelector(".markdown-body")!);
    await flushPromises();
    expect(container.querySelector(".image-context-menu")).toBeNull();
  });

  it("点击遮罩关闭菜单", async () => {
    const { container } = renderWithImage();
    await flushPromises();
    await fireEvent.contextMenu(container.querySelector(".markdown-body img")!);
    await flushPromises();
    expect(container.querySelector(".image-context-menu")).not.toBeNull();
    await fireEvent.click(
      container.querySelector(".image-context-overlay")!
    );
    await flushPromises();
    expect(container.querySelector(".image-context-menu")).toBeNull();
  });

  it("Escape/Tab 关闭菜单", async () => {
    const { container } = renderWithImage();
    await flushPromises();
    const img = container.querySelector(".markdown-body img")!;
    await fireEvent.contextMenu(img);
    await flushPromises();
    await fireEvent.keyDown(container.querySelector(".image-context-menu")!, {
      key: "Tab",
    });
    await flushPromises();
    expect(container.querySelector(".image-context-menu")).toBeNull();
    // 重新打开,Escape 同样关闭
    await fireEvent.contextMenu(img);
    await flushPromises();
    await fireEvent.keyDown(container.querySelector(".image-context-menu")!, {
      key: "Escape",
    });
    await flushPromises();
    expect(container.querySelector(".image-context-menu")).toBeNull();
  });

  it("Enter/Space 激活菜单项打开预览", async () => {
    const { container } = renderWithImage();
    await flushPromises();
    const img = container.querySelector(".markdown-body img")!;
    await fireEvent.contextMenu(img);
    await flushPromises();
    await fireEvent.keyDown(container.querySelector(".image-context-menu")!, {
      key: "Enter",
    });
    await flushPromises();
    expect(container.querySelector(".viewer-overlay")).not.toBeNull();
    // 重新打开,Space 同样激活
    await fireEvent.contextMenu(img);
    await flushPromises();
    await fireEvent.keyDown(container.querySelector(".image-context-menu")!, {
      key: " ",
    });
    await flushPromises();
    expect(container.querySelector(".viewer-overlay")).not.toBeNull();
  });
});

describe("全屏预览", () => {
  it("点击菜单项打开预览并携带 src/alt 与标题说明", async () => {
    const { container } = await openZoom(renderWithImage());
    expect(container.querySelector(".viewer-overlay")).not.toBeNull();
    const img = container.querySelector(".viewer-image")!;
    expect(img.getAttribute("src")).toBe("https://example.com/a.png");
    expect(img.getAttribute("alt")).toBe("示例图");
    expect(container.querySelector(".viewer-info")!.textContent).toBe("100%");
    // alt 存在时显示 caption
    expect(container.querySelector(".viewer-caption")!.textContent).toBe(
      "示例图"
    );
  });

  it("图片无 alt 时预览不显示 caption", async () => {
    vi.mocked(renderMarkdown).mockResolvedValue(
      '<p><img src="https://example.com/b.png"></p>'
    );
    const { container } = await openZoom(renderView());
    expect(container.querySelector(".viewer-overlay")).not.toBeNull();
    expect(container.querySelector(".viewer-caption")).toBeNull();
  });

  it("点击遮罩关闭预览", async () => {
    const { container } = await openZoom(renderWithImage());
    await fireEvent.click(container.querySelector(".viewer-overlay")!);
    await flushPromises();
    expect(container.querySelector(".viewer-overlay")).toBeNull();
  });

  it("滚轮缩放(以鼠标位置为中心)并可缩小回退", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
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
    const overlay = container.querySelector(".viewer-overlay")!;
    dispatchWheel(overlay, { deltaY: -100, clientX: 100, clientY: 100 });
    await tick();
    expect(img.getAttribute("style")).toContain("scale(1.25)");
    expect(container.querySelector(".viewer-info")!.textContent).toBe("125%");
    dispatchWheel(overlay, { deltaY: 100 });
    await tick();
    expect(img.getAttribute("style")).toContain("scale(1)");
  });

  it("Ctrl/Cmd+滚轮交给应用层,不缩放", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
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
    dispatchWheel(container.querySelector(".viewer-overlay")!, {
      deltaY: -100,
      ctrlKey: true,
    });
    await tick();
    expect(img.getAttribute("style")).toContain("scale(1)");
  });

  it("图片未加载(尺寸 0)时滚轮不缩放", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    // jsdom getBoundingClientRect 默认返回全 0 → 提前返回
    dispatchWheel(container.querySelector(".viewer-overlay")!, {
      deltaY: -100,
    });
    await tick();
    expect(img.getAttribute("style")).toContain("scale(1)");
  });

  it("拖拽平移且不触发 click 关闭", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.mouseDown(overlay, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    await fireEvent.mouseMove(overlay, { clientX: 130, clientY: 110 });
    expect(img.getAttribute("style")).toContain("translate(30px, 10px)");
    await fireEvent.mouseUp(overlay);
    await fireEvent.click(overlay);
    await flushPromises();
    // 拖拽后的 click 被抑制,预览保持打开
    expect(container.querySelector(".viewer-overlay")).not.toBeNull();
  });

  it("双击切换 1x / 3x", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.dblClick(img);
    expect(img.getAttribute("style")).toContain("scale(3)");
    await fireEvent.dblClick(img);
    expect(img.getAttribute("style")).toContain("scale(1)");
  });

  it("键盘 +/−/0/方向键 与 Escape 关闭", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.keyDown(overlay, { key: "+" });
    expect(img.getAttribute("style")).toContain("scale(1.25)");
    await fireEvent.keyDown(overlay, { key: "0" });
    expect(img.getAttribute("style")).toContain("scale(1)");
    await fireEvent.keyDown(overlay, { key: "ArrowRight" });
    expect(img.getAttribute("style")).toContain("translate(40px, 0px)");
    await fireEvent.keyDown(overlay, { key: "ArrowDown" });
    expect(img.getAttribute("style")).toContain("translate(40px, 40px)");
    await fireEvent.keyDown(overlay, { key: "Escape" });
    await flushPromises();
    expect(container.querySelector(".viewer-overlay")).toBeNull();
  });

  it("Ctrl+按键不缩放(交给应用层)", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.keyDown(container.querySelector(".viewer-overlay")!, {
      key: "+",
      ctrlKey: true,
    });
    expect(img.getAttribute("style")).toContain("scale(1)");
  });

  it("缩放上限钳制为 10x", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    for (let i = 0; i < 12; i++) {
      await fireEvent.keyDown(overlay, { key: "+" });
    }
    expect(container.querySelector(".viewer-info")!.textContent).toBe("1000%");
    await fireEvent.keyDown(overlay, { key: "0" });
    expect(container.querySelector(".viewer-info")!.textContent).toBe("100%");
  });

  it("缩放下限钳制为 0.5x", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    for (let i = 0; i < 15; i++) {
      await fireEvent.keyDown(overlay, { key: "-" });
    }
    expect(container.querySelector(".viewer-info")!.textContent).toBe("50%");
  });

  it("工具栏按钮:缩小/放大/重置/关闭", async () => {
    const { container } = await openZoom(renderWithImage());
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.click(
      container.querySelector(".viewer-btn[aria-label='放大']")!
    );
    expect(img.getAttribute("style")).toContain("scale(1.25)");
    await fireEvent.click(
      container.querySelector(".viewer-btn[aria-label='缩小']")!
    );
    expect(img.getAttribute("style")).toContain("scale(1)");
    await fireEvent.click(
      container.querySelector(".viewer-btn[aria-label='放大']")!
    );
    await fireEvent.click(
      container.querySelector(".viewer-btn[aria-label='重置']")!
    );
    expect(img.getAttribute("style")).toContain("scale(1)");
    await fireEvent.click(
      container.querySelector(".viewer-btn[aria-label='关闭']")!
    );
    await flushPromises();
    expect(container.querySelector(".viewer-overlay")).toBeNull();
  });

  it("关闭预览后焦点还原到打开前元素", async () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.focus();
    try {
      const { container } = await openZoom(renderWithImage());
      await fireEvent.keyDown(container.querySelector(".viewer-overlay")!, {
        key: "Escape",
      });
      await flushPromises();
      expect(document.activeElement).toBe(btn);
    } finally {
      btn.remove();
    }
  });

  it("Tab 焦点陷阱在预览内循环", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    const buttons = container.querySelectorAll(".viewer-btn");
    const first = buttons[0] as HTMLElement;
    const last = buttons[buttons.length - 1] as HTMLElement;
    // Shift+Tab 从第一个回绕到最后一个
    first.focus();
    await fireEvent.keyDown(overlay, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Tab 从最后一个回绕到第一个
    await fireEvent.keyDown(overlay, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("mouseleave 结束拖拽后不再平移", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    const img = container.querySelector(".viewer-image")!;
    await fireEvent.mouseDown(overlay, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    await fireEvent.mouseMove(overlay, { clientX: 130, clientY: 100 });
    expect(img.getAttribute("style")).toContain("translate(30px, 0px)");
    await fireEvent.mouseLeave(overlay);
    await fireEvent.mouseMove(overlay, { clientX: 200, clientY: 100 });
    // 拖拽已结束,translate 不再更新
    expect(img.getAttribute("style")).toContain("translate(30px, 0px)");
  });

  it("预览内右键被阻止(不弹出浏览器菜单)", async () => {
    const { container } = await openZoom(renderWithImage());
    const overlay = container.querySelector(".viewer-overlay")!;
    const evt = new MouseEvent("contextmenu", {
      cancelable: true,
      bubbles: true,
    });
    overlay.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
