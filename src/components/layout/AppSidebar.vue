<script>
import AppIcon from "../ui/AppIcon.vue";
import BaseTooltip from "../ui/BaseTooltip.vue";
import { preferencesStore } from "../../store/preferences.js";
import { initials } from "../../domain/preferences.js";
export default {
  name: "AppSidebar",
  components: { AppIcon, BaseTooltip },
  props: { collapsed: Boolean },
  emits: ["navigate", "collapse", "close"],
  data() {
    return {
      preferences: preferencesStore.state,
      links: [
        { to: "/dashboard", label: "Overview", icon: "overview" },
        { to: "/orders", label: "Orders", icon: "orders" },
        { to: "/customers", label: "Customers", icon: "customers" },
        { to: "/settings", label: "Settings", icon: "settings" },
      ],
    };
  },
  methods: { initials },
  computed: {
    workspaceInitial() {
      return Array.from(initials(this.preferences.data.workspaceName))[0];
    },
  },
};
</script>
<template>
  <div class="sidebar__brand">
    <RouterLink to="/dashboard" class="brand" aria-label="NEXUS home" @click="$emit('navigate')"
      ><span class="brand__mark">N</span
      ><span class="sidebar__expanded brand__word">nexus<span>®</span></span></RouterLink
    ><button class="icon-button sidebar__close" aria-label="Close navigation" @click="$emit('close')">
      <AppIcon name="close" />
    </button>
  </div>
  <div
    class="workspace-label"
    role="group"
    :aria-label="preferences.data.workspaceName"
    :title="collapsed ? preferences.data.workspaceName : undefined"
  >
    <span class="workspace-label__avatar" aria-hidden="true">{{ workspaceInitial }}</span
    ><span class="sidebar__expanded workspace-label__details"
      ><strong>{{ preferences.data.workspaceName }}</strong
      ><small>Local demo workspace</small></span
    >
  </div>
  <div class="sidebar__section sidebar__expanded">WORKSPACE</div>
  <nav aria-label="Main navigation" class="sidebar__nav">
    <BaseTooltip v-for="link in links" :key="link.to" :text="link.label" :disabled="!collapsed" side="right"
      ><RouterLink :to="link.to" :aria-label="link.label" class="nav-link" @click="$emit('navigate')"
        ><AppIcon :name="link.icon" /><span class="sidebar__expanded">{{ link.label }}</span></RouterLink
      ></BaseTooltip
    >
  </nav>
  <div class="sidebar__bottom">
    <div class="workspace-note sidebar__expanded">
      <span class="workspace-note__icon"><AppIcon name="shield" :size="18" /></span
      ><strong>Your data stays here.</strong>
      <p>Browser-local demo.<br />Built for a clearer overview.</p>
      <span>NEXUS · DEMO WORKSPACE</span>
    </div>
    <div class="sidebar__toggle-row">
      <button
        class="sidebar__collapse"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-expanded="!collapsed"
        aria-controls="main-sidebar"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="$emit('collapse')"
      >
        <AppIcon name="collapse" /><span class="sidebar__expanded sidebar__collapse-label">Collapse sidebar</span>
      </button>
    </div>
    <div class="sidebar__footer">
      <div class="sidebar__identity">
        <span class="avatar" :title="preferences.data.ownerName">{{ initials(preferences.data.ownerName) }}</span
        ><span class="sidebar__expanded"
          ><strong>{{ preferences.data.ownerName }}</strong
          ><small>Workspace owner</small></span
        >
      </div>
    </div>
  </div>
</template>
