import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";
import "highlight.js/styles/github.css";
import "./styles.css";
import "./theme-dark.css";

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.mount("#app");