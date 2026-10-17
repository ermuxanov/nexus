import { createApp } from "vue";
import App from "./app/App.vue";
import router from "./app/router.js";
import ui from "@nuxt/ui/vue-plugin";
import "./styles/ui.css";
import "simplebar-vue/dist/simplebar.min.css";
import "./styles/main.scss";
import "./styles/ui.scss";

createApp(App).use(router).use(ui).mount("#app");
