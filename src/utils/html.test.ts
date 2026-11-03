import { describe, it, expect } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("转义 & < >", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("无特殊字符时原样返回", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });

  it("连续特殊字符逐一转义（引号不转义）", () => {
    expect(escapeHtml("<a>&\"'")).toBe("&lt;a&gt;&amp;\"'");
  });

  it("空字符串", () => {
    expect(escapeHtml("")).toBe("");
  });
});
