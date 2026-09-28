import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";
import "highlight.js/styles/github.css";
import "./app.css"; // tailwind + theme.css
import "./reader.css"; // markdown/hljs/find 动态 HTML 样式
import "./legacy-components.css"; // 切换期兜底，Task 12 删除

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.mount("#app");