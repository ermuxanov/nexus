<script>
import AppSidebar from "../components/layout/AppSidebar.vue";
import AppHeader from "../components/layout/AppHeader.vue";
import AppIcon from "../components/ui/AppIcon.vue";
import { appearanceStore } from "../store/appearance.js";
import { preferencesStore } from "../store/preferences.js";
import SimpleBar from "simplebar-vue";

export default {
  name: "AppLayout",
  components: { AppSidebar, AppHeader, AppIcon, SimpleBar },
  data() {
    return {
      appearance: appearanceStore.state,
      preferences: preferencesStore.state,
      mobileOpen: false,
      mobileMedia: null,
    };
  },
  watch: {
    "$route.fullPath"() {
      if (this.mobileOpen) this.closeMobile(false);
      this.$nextTick(() => this.$refs.main?.focus());
    },
  },
  created() {
    appearanceStore.init();
    preferencesStore.load();
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
    this.mobileMedia = window.matchMedia("(max-width: 767px)");
    this.mobileMedia.addEventListener("change", this.onViewportChange);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
    this.mobileMedia?.removeEventListener("change", this.onViewportChange);
    document.body.style.overflow = "";
  },
  methods: {
    skipToContent() {
      this.$refs.main?.focus();
      this.$refs.main?.scrollIntoView();
    },
    toggleTheme() {
      appearanceStore.toggleTheme();
    },
    toggleSidebar() {
      appearanceStore.toggleSidebar();
    },
    openMobile() {
      this.mobileOpen = true;
      document.body.style.overflow = "hidden";
      this.$nextTick(() => this.$refs.sidebar.querySelector("a")?.focus());
    },
    closeMobile(restoreFocus = true) {
      this.mobileOpen = false;
      document.body.style.overflow = "";
      if (restoreFocus) this.$nextTick(() => document.querySelector(".mobile-menu")?.focus());
    },
    onViewportChange(event) {
      if (!event.matches && this.mobileOpen) this.closeMobile(false);
    },
    onKeydown(event) {
      if (!this.mobileOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeMobile();
      }
      if (event.key === "Tab") {
        const items = [...this.$refs.sidebar.querySelectorAll('a, button, [tabindex="0"]')].filter(
          (element) => element.getClientRects().length,
        );
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
  },
};
</script>
<template>
  <div class="app-shell" :class="{ 'is-collapsed': appearance.collapsed, 'is-mobile-open': mobileOpen }">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent">Skip to content</a>
    <div v-if="mobileOpen" class="sidebar-backdrop" aria-hidden="true" @click="closeMobile()" />
    <aside
      id="main-sidebar"
      ref="sidebar"
      class="sidebar"
      :role="mobileOpen ? 'dialog' : undefined"
      :aria-modal="mobileOpen ? true : undefined"
      aria-label="Workspace navigation"
    >
      <SimpleBar class="sidebar-scroller" aria-label="Scrollable workspace navigation" :tab-index="0">
        <AppSidebar
          :collapsed="appearance.collapsed"
          @collapse="toggleSidebar"
          @navigate="mobileOpen && closeMobile(false)"
          @close="closeMobile()"
        />
      </SimpleBar>
    </aside>
    <div class="app-body" :inert="mobileOpen || undefined">
      <AppHeader :theme="appearance.theme" @menu="openMobile" @theme="toggleTheme" />
      <div v-if="appearance.error" class="storage-warning" role="alert">
        <AppIcon name="info" :size="16" />{{ appearance.error }}
      </div>
      <div v-if="preferences.error && $route.name !== 'settings'" class="storage-warning" role="alert">
        <AppIcon name="info" :size="16" />{{ preferences.error }}
        <RouterLink to="/settings">Open Settings</RouterLink>
      </div>
      <main id="main-content" ref="main" tabindex="-1"><RouterView /></main>
      <footer class="app-footer">
        <span>NEXUS <span class="footer-dot">·</span> Business operations, together.</span
        ><span><AppIcon name="shield" :size="12" /> Browser-local demo</span>
      </footer>
    </div>
  </div>
</template>
