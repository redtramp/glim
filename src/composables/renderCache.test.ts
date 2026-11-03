/**
 * renderCache 测试
 *
 * 测试目标:
 * - cyrb53 稳定、定长十六进制、seed 区分
 * - markdownCacheKey / mermaidCacheKey 形状（mermaid 含主题维度）
 * - LengthCheckedLRU: 命中需 key+源长度一致；长度不符作废；LRU 置顶/淘汰；delete/clear/size
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  cyrb53,
  markdownHtmlCache,
  markdownHeadingsCache,
  mermaidSvgCache,
  markdownCacheKey,
  mermaidCacheKey,
} from "./renderCache";

describe("renderCache", () => {
  beforeEach(() => {
    markdownHtmlCache.clear();
    markdownHeadingsCache.clear();
    mermaidSvgCache.clear();
  });

  describe("cyrb53", () => {
    it("同输入稳定且为 16 位十六进制", () => {
      const a = cyrb53("hello");
      expect(a).toBe(cyrb53("hello"));
      expect(a).toMatch(/^[0-9a-f]{16}$/);
    });

    it("不同输入/不同 seed 结果不同", () => {
      expect(cyrb53("world")).not.toBe(cyrb53("hello"));
      expect(cyrb53("hello", 1)).not.toBe(cyrb53("hello"));
    });

    it("空串可哈希", () => {
      expect(cyrb53("")).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("cache key", () => {
    it("markdownCacheKey 返回哈希与源长度", () => {
      const { key, length } = markdownCacheKey("abc");
      expect(length).toBe(3);
      expect(key).toBe(cyrb53("abc"));
    });

    it("mermaidCacheKey 含主题前缀且长度按代码计", () => {
      const a = mermaidCacheKey("dark", "code");
      const b = mermaidCacheKey("light", "code");
      expect(a.key).not.toBe(b.key);
      expect(a.key.startsWith("dark|")).toBe(true);
      expect(a.length).toBe(4);
    });
  });

  describe("LengthCheckedLRU", () => {
    it("命中需 key 与源长度一致", () => {
      markdownHtmlCache.set("k", "<p/>", 10);
      expect(markdownHtmlCache.get("k", 10)).toBe("<p/>");
    });

    it("长度不符视为未命中并作废该条目", () => {
      markdownHtmlCache.set("k", "<p/>", 10);
      expect(markdownHtmlCache.get("k", 11)).toBeUndefined();
      expect(markdownHtmlCache.get("k", 10)).toBeUndefined();
    });

    it("未命中返回 undefined", () => {
      expect(markdownHtmlCache.get("nope", 0)).toBeUndefined();
    });

    it("命中置顶并淘汰最久未用（limit 10）", () => {
      for (let i = 0; i < 10; i++) markdownHtmlCache.set(`k${i}`, `v${i}`, 1);
      expect(markdownHtmlCache.size).toBe(10);
      expect(markdownHtmlCache.get("k0", 1)).toBe("v0"); // 置顶 k0
      markdownHtmlCache.set("k10", "v10", 1); // 淘汰 k1
      expect(markdownHtmlCache.get("k1", 1)).toBeUndefined();
      expect(markdownHtmlCache.get("k0", 1)).toBe("v0");
      expect(markdownHtmlCache.size).toBe(10);
    });

    it("重复 set 同 key 只保留一份", () => {
      markdownHtmlCache.set("k", "a", 1);
      markdownHtmlCache.set("k", "b", 1);
      expect(markdownHtmlCache.size).toBe(1);
      expect(markdownHtmlCache.get("k", 1)).toBe("b");
    });

    it("delete 与 clear", () => {
      markdownHeadingsCache.set("a", [], 3);
      markdownHeadingsCache.delete("a");
      expect(markdownHeadingsCache.get("a", 3)).toBeUndefined();

      mermaidSvgCache.set("m", "<svg/>", 3);
      expect(mermaidSvgCache.size).toBe(1);
      mermaidSvgCache.clear();
      expect(mermaidSvgCache.size).toBe(0);
    });
  });
});
