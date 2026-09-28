// @ts-check
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "src-tauri/target/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: { parser: { ts: tsParser } },
    },
    rules: {
      "svelte/no-at-html-tags": "off",
    },
  },
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        process: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Range: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLTextAreaElement: "readonly",
        SVGSVGElement: "readonly",
        Text: "readonly",
        CSS: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        PointerEvent: "readonly",
        ClipboardEvent: "readonly",
        File: "readonly",
        WheelEvent: "readonly",
        WheelEventInit: "readonly",
        Element: "readonly",
        btoa: "readonly",
        Uint8Array: "readonly",
        Worker: "readonly",
        MessageEvent: "readonly",
        IntersectionObserver: "readonly",
        IntersectionObserverCallback: "readonly",
        IntersectionObserverEntry: "readonly",
        URL: "readonly",
        Blob: "readonly",
        self: "readonly",
        performance: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        Response: "readonly",
        Storage: "readonly",
        DOMException: "readonly",
        Selection: "readonly",
        DOMRect: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {},
  },
];
