/**
 * MarkdownEditor 组件挂载测试（Task 5 最小接入验证）。
 *
 * 目标：锁定「组件实际挂载路径」（onMount → createEditor → 扩展组合）在
 * 加入 livePreview / GFM 语法后不报错，且就地富文本装饰真实生效。
 * 纯函数与 ViewPlugin 的细粒度行为由 livePreview.test.ts 覆盖，此处只做集成守门。
 *
 * mock：@tauri-apps/plugin-fs（组件内图片粘贴用，jsdom 下不需要真实文件 IO）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";

vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

afterEach(() => cleanup());

/** 组件必填 props + 本测试用到的可选回调 */
interface MountProps {
  modelValue: string;
  theme: "light" | "dark";
  onReady?: () => void;
}

/** 渲染组件并返回容器；Svelte 5 组件需动态 import 以匹配项目现有惯例 */
async function mountEditor(props: MountProps) {
  const { default: MarkdownEditor } = await import("./MarkdownEditor.svelte");
  const { container } = render(MarkdownEditor, { props });
  await tick();
  return container;
}

describe("MarkdownEditor / 最小接入", () => {
  it("挂载成功：创建 .cm-editor、触发 onReady、无异常", async () => {
    const onReady = vi.fn();
    const container = await mountEditor({
      modelValue: "# Title\n\nbody\n",
      theme: "light",
      onReady,
    });
    expect(container.querySelector(".cm-editor")).not.toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".cm-content")?.textContent).toContain("Title");
  });

  it("livePreview 生效：off-cursor 的 ~~ 标记被隐藏、文字带 cm-lp-strike", async () => {
    // 光标默认在文档开头（第 1 行标题）→ 第 3 行删除线 off-cursor，应就地渲染
    const container = await mountEditor({
      modelValue: "# Title\n\n~~gone~~\n",
      theme: "light",
    });
    const cmContent = container.querySelector(".cm-content");
    expect(cmContent).not.toBeNull();
    // 删除线标记 ~~ 不应出现在渲染文本中（被 replace 装饰隐藏）
    expect(cmContent!.textContent).not.toContain("~~");
    expect(cmContent!.textContent).toContain("gone");
    // 内容带删除线样式类
    expect(container.querySelector(".cm-lp-strike")).not.toBeNull();
    // 光标所在的标题行露源码："# " 仍可见
    expect(cmContent!.textContent).toContain("# Title");
  });

  it("GFM 语法已接入：任务复选框 widget 在组件中生成", async () => {
    const container = await mountEditor({
      modelValue: "# Title\n\n- [ ] todo\n",
      theme: "light",
    });
    // 若组件误用裸 markdown()，无 TaskMarker 节点 → 不会有 checkbox widget
    expect(container.querySelector(".cm-lp-task")).not.toBeNull();
  });

  it("dark 主题挂载不报错", async () => {
    const container = await mountEditor({
      modelValue: "# Dark\n",
      theme: "dark",
    });
    expect(container.querySelector(".cm-editor")).not.toBeNull();
  });
});
