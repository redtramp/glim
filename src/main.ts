import { mount } from "svelte";
import App from "./App.svelte";
import "highlight.js/styles/github.css";
import "./app.css"; // tailwind + theme.css
import "./reader.css"; // markdown/hljs/find 动态 HTML 样式

const target = document.getElementById("app");
if (target) mount(App, { target });

// 窗口显示时机交由 App 在首屏内容就绪后显式 show（见 App.svelte onMount），
// 避免「窗口先显示空白、再等恢复渲染」的卡顿体感。Rust setup 中有 3s 超时
// 兜底 show，防止前端异常时窗口永久隐藏。
