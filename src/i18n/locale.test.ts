/**
 * 自研 i18n 模块测试
 * 覆盖: key 命中/缺失回退、插值、locale 响应式、持久化、点号下探与 en-US 回退链
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
// 预热(实测缺陷修复): 并行全量跑时测试 1 内的首次冷 transform >5s 默认 testTimeout
// (实测 6077ms, 串行仅 ~100ms), 移到文件导入阶段(不计入单测计时);
// beforeEach 的 vi.resetModules 只清模块注册表, transform 缓存保留, 各测试动态 import 仍走缓存
import "./locale.svelte.ts";

// flat key 与嵌套消息并存：前者走直查，后者走点号下探（Ruling 8）
vi.mock("./zh-CN", () => ({
  default: { "a.b": "你好", greet: "你好，{name}", panel: { title: { deep: "深层中文" } } },
}));
vi.mock("./en-US", () => ({
  default: {
    "a.b": "hello",
    greet: "hi, {name}",
    panel: { title: { deep: "deep english" } },
    enOnly: "english only",
  },
}));

describe("i18n locale 模块", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // 执行期修订 Ruling 7: jsdom 的 navigator.language 硬编码 en-US,
    // 不种初始值则测试 1/3 断言的中文文案必挂; 种子 storage 使 detectLocale 走已存路径,
    // 产品侧 detectLocale 行为不动
    localStorage.setItem("glim-reader-locale", "zh-CN");
  });

  it("命中 key 返回对应语言文案", async () => {
    const { t, setLocale } = await import("./locale.svelte.ts");
    expect(t("a.b")).toBe("你好");
    setLocale("en-US");
    expect(t("a.b")).toBe("hello");
  });

  it("缺失 key 原样返回（与 vue-i18n 行为一致）", async () => {
    const { t } = await import("./locale.svelte.ts");
    expect(t("not.exist")).toBe("not.exist");
  });

  it("嵌套消息按点号逐段下探（Ruling 8）", async () => {
    const { t } = await import("./locale.svelte.ts");
    expect(t("panel.title.deep")).toBe("深层中文");
    // 命中中间对象（非字符串）视为 miss，原样返回 key
    expect(t("panel.title")).toBe("panel.title");
  });

  it("当前语言缺失时回退 en-US，再缺失才原样返回 key", async () => {
    const { t, setLocale } = await import("./locale.svelte.ts");
    // zh-CN mock 无 enOnly → 落 en-US
    expect(t("enOnly")).toBe("english only");
    setLocale("en-US");
    expect(t("never.defined")).toBe("never.defined");
  });

  it("插值替换 {name}", async () => {
    const { t } = await import("./locale.svelte.ts");
    expect(t("greet", { name: "Glim" })).toBe("你好，Glim");
  });

  it("插值参数缺失时保留占位", async () => {
    const { t } = await import("./locale.svelte.ts");
    expect(t("greet", {})).toBe("你好，{name}");
  });

  it("setLocale 持久化到 localStorage", async () => {
    const { setLocale } = await import("./locale.svelte.ts");
    setLocale("en-US");
    expect(localStorage.getItem("glim-reader-locale")).toBe("en-US");
  });
});
