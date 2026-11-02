/**
 * GrantAccessDialog 单测（Vue test-utils → @testing-library/svelte 迁移）
 *
 * 覆盖:标题/目录/文案渲染、授权与拒绝按钮回调、点击遮罩拒绝。
 * i18n:vue-i18n 实例 → 自研 locale 模块 mock（原测试用真实 i18n zh-CN 全量消息，
 * 此处 map 只放断言用到的 grant.* 键，取值与 zh-CN.ts 一致）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import GrantAccessDialog from "./GrantAccessDialog.svelte";
import { t } from "../i18n/locale.svelte.ts";

// Mock 自研 i18n（原测试 global.plugins:[i18n] 的等价迁移）
vi.mock("../i18n/locale.svelte.ts", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "grant.title": "需要访问授权",
      "grant.message":
        "该文档位于预置授权目录之外，需要你的确认才能读取。授权仅在本次运行内有效，重启后会重新询问。",
      "grant.allow": "授权并打开",
      "grant.deny": "取消",
    };
    return map[key] ?? key;
  },
  locale: { value: "zh-CN" },
  setLocale: vi.fn(),
  persistLocale: vi.fn(),
  detectLocale: vi.fn(() => "zh-CN"),
}));

function renderDialog(opts: {
  visible?: boolean;
  dir?: string;
  allowLabel?: string;
  denyLabel?: string;
} = {}) {
  const onAllow = vi.fn();
  const onDeny = vi.fn();
  const result = render(GrantAccessDialog, {
    props: {
      visible: opts.visible ?? true,
      dir: opts.dir ?? "/opt/app/.config",
      allowLabel: opts.allowLabel,
      denyLabel: opts.denyLabel,
      onAllow,
      onDeny,
    },
  });
  return { ...result, onAllow, onDeny };
}

describe("GrantAccessDialog", () => {
  beforeEach(() => {
    // Ruling 7:jsdom navigator 为 en-US,种子 storage 使 detectLocale 走已存路径
    localStorage.setItem("glim-reader-locale", "zh-CN");
  });

  afterEach(() => cleanup());

  it("visible=false 时不渲染", () => {
    const { container } = renderDialog({ visible: false });
    expect(container.querySelector(".dialog")).toBeNull();
  });

  it("渲染标题、目录与说明", () => {
    const { container } = renderDialog();
    expect(container.querySelector(".title")!.textContent).toBe(t("grant.title"));
    expect(container.querySelector(".dir")!.textContent).toBe("/opt/app/.config");
    expect(container.querySelector(".message")!.textContent).toBe(t("grant.message"));
  });

  it("点击授权触发 onAllow,点击取消触发 onDeny", async () => {
    const { container, onAllow, onDeny } = renderDialog();
    const buttons = container.querySelectorAll("button");
    await fireEvent.click(buttons[buttons.length - 1]);
    expect(onAllow).toHaveBeenCalledTimes(1);
    await fireEvent.click(buttons[0]);
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("点击遮罩触发 onDeny", async () => {
    const { container, onDeny } = renderDialog();
    await fireEvent.click(container.querySelector(".overlay")!);
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("允许覆盖默认按钮文案", () => {
    const { container } = renderDialog({ allowLabel: "自定义允许", denyLabel: "自定义取消" });
    expect(container.textContent).toContain("自定义允许");
    expect(container.textContent).toContain("自定义取消");
  });
});
