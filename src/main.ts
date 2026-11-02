import { mount } from "svelte";
import App from "./App.svelte";
import "highlight.js/styles/github.css";
import "./app.css"; // tailwind + theme.css
import "./reader.css"; // markdown/hljs/find 动态 HTML 样式

const target = document.getElementById("app");
if (target) mount(App, { target });

// 启动体验：窗口 visible:true，index.html 的内联静态 splash 在主窗口首帧即渲染
// （消除点击后空白停顿）；前端首屏内容就绪后由 App.svelte 的 dismissSplash() 淡出移除。
// 启动期重块（highlight.js 高亮、markdown-it 渲染引擎、CodeMirror 编辑器）均移出启动路径：
// hljs 与 markdown-it 在 Web Worker 内加载，CodeMirror 由 App 按需动态 import
// 并在首屏就绪后的空闲时段预加载（见 App.svelte scheduleEditorPreload）。
