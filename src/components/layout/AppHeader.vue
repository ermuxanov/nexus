<script>
import AppIcon from "../ui/AppIcon.vue";
import BaseTooltip from "../ui/BaseTooltip.vue";
import { preferencesStore } from "../../store/preferences.js";
import { initials } from "../../domain/preferences.js";
export default {
  name: "AppHeader",
  components: { AppIcon, BaseTooltip },
  props: { theme: String },
  emits: ["menu", "theme"],
  data() {
    return { preferences: preferencesStore.state };
  },
  methods: { initials },
};
</script>
<template>
  <header class="app-header">
    <div class="breadcrumb">
      <button
        class="icon-button mobile-menu"
        aria-label="Open navigation"
        aria-controls="main-sidebar"
        @click="$emit('menu')"
      >
        <AppIcon name="menu" /></button
      ><span class="breadcrumb__workspace">Workspace</span><span class="breadcrumb__slash">/</span
      ><span>{{ $route.meta.label }}</span>
    </div>
    <div class="header-actions">
      <span class="demo-label"><span />Local demo</span><span class="header-divider" /><BaseTooltip
        :text="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        ><button
          class="icon-button theme-toggle"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="$emit('theme')"
        >
          <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" /></button></BaseTooltip
      ><span class="avatar avatar--small" :title="`${preferences.data.ownerName} — Workspace owner`">{{
        initials(preferences.data.ownerName)
      }}</span>
    </div>
  </header>
</template>
