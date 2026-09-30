import { mount } from "svelte";
import App from "./App.svelte";
import "highlight.js/styles/github.css";
import "./app.css"; // tailwind + theme.css
import "./reader.css"; // markdown/hljs/find 动态 HTML 样式

const target = document.getElementById("app");
if (target) mount(App, { target });
