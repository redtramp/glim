import { defineConfig } from "vite";
// v6.2.4 仅提供具名导出 svelte(),无 default 导出
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { configDefaults } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  // svelte({ hot: false }):vitest(jsdom)下 HMR 依赖 window,必须关闭
  // tailwindcss() 必须置于 svelte 之前,保证样式管线先于组件管线处理
  plugins: [tailwindcss(), svelte({ hot: false })],
  // vitest 运行时需要 browser 条件解析 Svelte 包
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@codemirror") || id.includes("codemirror"))
              return "vendor-codemirror";
            if (id.includes("highlight.js")) return "vendor-hljs";
            if (id.includes("markdown-it") || id.includes("dompurify"))
              return "vendor-markdown";
            if (id.includes("@tauri-apps")) return "vendor-tauri";
            if (id.includes("svelte")) return "vendor-svelte";
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    // Node 26 内置实验性 localStorage 全局会遮蔽 jsdom 的实现,
    // 使 vitest 跳过复制 jsdom 的 localStorage;关闭该全局交还 jsdom
    execArgv: ["--no-experimental-webstorage"],
    exclude: [...configDefaults.exclude, "src-tauri/**"],
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 低于阈值时测试失败,防止新改动显著拉低覆盖率
      thresholds: {
        lines: 85,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
}));
