import { reactive } from "vue";

const KEY = "nexus.appearance.v1";
const state = reactive({ theme: "dark", collapsed: false, error: "" });
function apply() {
  document.documentElement.dataset.theme = state.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim());
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: state.theme, collapsed: state.collapsed }));
    state.error = "";
    return true;
  } catch {
    state.error = "Appearance changed for this session. Browser storage could not save your preference.";
    return false;
  }
}
export const appearanceStore = {
  state,
  init() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved) {
        if (!["light", "dark"].includes(saved.theme) || typeof saved.collapsed !== "boolean")
          throw new Error("Invalid preferences");
        state.theme = saved.theme;
        state.collapsed = saved.collapsed;
      }
    } catch {
      state.error = "Saved appearance could not be read. Default appearance is active.";
    }
    apply();
  },
  toggleTheme() {
    return this.setTheme(state.theme === "dark" ? "light" : "dark");
  },
  setTheme(theme) {
    if (!["dark", "light"].includes(theme)) return false;
    state.theme = theme;
    apply();
    return persist();
  },
  toggleSidebar() {
    return this.setCollapsed(!state.collapsed);
  },
  setCollapsed(collapsed) {
    if (typeof collapsed !== "boolean") return false;
    state.collapsed = collapsed;
    return persist();
  },
};
