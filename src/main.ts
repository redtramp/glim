import { mount } from "svelte";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import App from "./App.svelte";
import "highlight.js/styles/github.css";
import "./app.css"; // tailwind + theme.css
import "./reader.css"; // markdown/hljs/find 动态 HTML 样式

const target = document.getElementById("app");
if (target) mount(App, { target });

// 窗口配置 visible:false 为避免渲染前白屏闪烁；前端挂载完成后再显式显示，
// 否则 release 下窗口持续隐藏，体感为「启动卡顿/白屏」。
// 渲染异步完成，show 用 fire-and-forget 不阻塞挂载。
void getCurrentWebview()
  .show()
  .catch(() => {
    /* 非 Tauri 环境（测试/预览）忽略 */
  });
